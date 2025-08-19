contract;

pub mod error;
mod score;

use std::storage::storage_map::*;
use std::storage::storage_bytes::*;
use std::storage::storage_vec::*;
use std::bytes::Bytes;
use std::hash::Hash;
use std::context::{msg_amount, this_balance};
use std::call_frames::msg_asset_id;
use std::auth::msg_sender;
use reentrancy::reentrancy_guard;

use error::*;
use score::score;
use score::is_blackjack;

enum Outcome {
    Win: (),
    BlackJack: (),
    Lose: (),
    Bust: (),
    Push: (),
    Continue: (),
}
impl PartialEq for Outcome {
    fn eq(self, other: Self) -> bool {
        match (self, other) {
            (Self::Win, Self::Win) => true,
            (Self::BlackJack, Self::BlackJack) => true,
            (Self::Lose, Self::Lose) => true,
            (Self::Bust, Self::Bust) => true,
            (Self::Push, Self::Push) => true,
            (Self::Continue, Self::Continue) => true,
            _ => false,
        }
    }
}

enum Move {
    Start: b256,
    Hit: b256,
    Stand: b256,
}

storage {
    moves: StorageMap<Address, StorageVec<Move>> = StorageMap {},
    stood: StorageMap<Address, bool> = StorageMap {},
    // TODO: support non base assets bet
    bets: StorageMap<Address, u64> = StorageMap {},

    rng: StorageMap<b256, b256> = StorageMap {},
}

struct Rng {
    offset: u64,
    random_bytes: Bytes,
}

#[storage(read)]
fn read_proof(seed: b256) -> b256 {
    match storage.rng.get(seed).try_read() {
        Some(proof) => proof,
        None => panic BlackjackError::RandomnessNotReady,
    }
}

impl Rng {
    #[storage(read)]
    pub fn new(seed: b256) -> Self {
        let randomness = read_proof(seed);
        let random_bytes = Bytes::from(randomness);

        Self {
            random_bytes,
            offset: 0,
        }
    }

    pub fn random_card(ref mut self) -> u8 {
        if self.offset >= self.random_bytes.len() {
            panic BlackjackError::RandomnessRanOut;
        }

        let res = self.random_bytes.get(self.offset).unwrap() % 13;
        self.offset += 1;
        res
    }
}

fn player() -> Address {
    msg_sender().unwrap().as_address().unwrap() // caller address
}

fn max_bet() -> u64 {
    this_balance(AssetId::base()) / 2 //FIXME: better RoR calculation
}

struct GameState {
    dealer_cards: Bytes,
    player_cards: Bytes,
    dealer_score: u8,
    player_score: u8,
    outcome: Outcome,
    bet: u64,
}

abi Blackjack {
    #[payable]
    #[storage(read, write)]
    fn start(seed: b256, bet: u64);

    #[storage(read, write)]
    fn hit(seed: b256);

    #[storage(read, write)]
    fn stand(seed: b256);

    #[storage(read, write)]
    fn redeem(claimed_outcome: Outcome);

    #[storage(read)]
    fn game_state(game: Address) -> GameState;

    #[payable]
    fn fund();
}

impl Blackjack for Contract {
    #[payable]
    #[storage(read, write)]
    fn start(seed: b256, bet: u64) {
        reentrancy_guard();

        assert_eq(msg_amount(), bet);
        assert_eq(msg_asset_id(), AssetId::base());

        let player = player();

        // reset moves
        let mut moves = Vec::new();
        moves.push(Move::Start(seed));
        storage.moves.get(player).store_vec(moves);
        // reset stand
        storage.stood.insert(player, false);
        // reset bet
        if bet > max_bet() {
            // we can't bet more than there is to payout
            panic BlackjackError::BetTooLarge;
        }

        storage.bets.insert(player, bet);

        request_rng(seed);
    }

    #[storage(read, write)]
    fn hit(seed: b256) {
        reentrancy_guard();

        let player = player();

        assert(!storage.stood.get(player).try_read().unwrap_or(true));

        storage.moves.get(player).push(Move::Hit(seed));

        request_rng(seed);
    }

    #[storage(read, write)]
    fn stand(seed: b256) {
        reentrancy_guard();

        let player = player();

        assert(!storage.stood.get(player).try_read().unwrap_or(true));

        storage.moves.get(player).push(Move::Stand(seed));
        storage.stood.insert(player, true);

        request_rng(seed);
    }

    #[storage(read, write)]
    fn redeem(claimed_outcome: Outcome) {
        reentrancy_guard();

        let player = player();

        let bet = storage.bets.get(player).read();
        // zero out bet
        storage.bets.get(player).write(0);

        let payout = match claimed_outcome {
            Outcome::Win => bet + bet,
            Outcome::BlackJack => bet + bet + bet / 2,
            Outcome::Push => bet,
            _ => panic BlackjackError::NoPayoutOutcome,
        };

        std::asset::transfer(Identity::Address(player), AssetId::base(), payout);

        let game_state = simulate_game(player);
        assert_eq(claimed_outcome, game_state.outcome);
    }

    #[storage(read)]
    fn game_state(game: Address) -> GameState {
        simulate_game(game)
    }

    #[payable]
    fn fund() {
        assert_eq(msg_asset_id(), AssetId::base());
    }
}

#[storage(write)]
pub fn request_rng(seed: b256) {
    // TODO FIXME: vrf integration
    let proof = std::block::block_header_hash(std::block::height()-1).unwrap(); // FIXME: this is not safe
    storage.rng.insert(seed, proof);

    // let vrf = abi(SimpleVrf, VRF_ID);

    // let min_fee = vrf.get_fee(fee_asset);
    // if min_fee > fee {
    //     log(BlackjackError::InvalidAmount);
    //     revert(2);
    // }

    // let _ = vrf.request {
    //     gas: 1_000_000,
    //     asset_id: fee_asset.bits(),
    //     coins: fee,
    // }(seed);
}


// impl SimpleVrfCallback for Contract {
//     #[storage(read, write)]
//     fn simple_callback(seed: b256, proof: b256) {
//         storage.rng.insert(seed, proof);
//     }
// }

#[storage(read)]
fn simulate_game(game: Address) -> GameState {
    let mut dealer_cards = Bytes::new();
    let mut player_cards = Bytes::new();

    let bet = storage.bets.get(game).try_read().unwrap_or(0);
    let moves = storage.moves.get(game).load_vec();

    let mut has_stood = false;

    let mut i = 0;
    while i < moves.len() {
        match moves.get(i).unwrap() {
            Move::Start(seed) => {
                let mut rng = Rng::new(seed);
                dealer_cards.push(rng.random_card());
                player_cards.push(rng.random_card());
                player_cards.push(rng.random_card());
            }
            Move::Hit(seed) => {
                let mut rng = Rng::new(seed);
                player_cards.push(rng.random_card());
            }
            Move::Stand(seed) => {
                has_stood = true;
                let mut rng = Rng::new(seed);
                while score(dealer_cards) < 17 {
                    dealer_cards.push(rng.random_card());
                }
            }
        }
        i += 1;
    }
    let outcome = if score(player_cards) > 21 {
        Outcome::Bust
    } else if !has_stood {
        Outcome::Continue
    } else if is_blackjack(player_cards)
        && !is_blackjack(dealer_cards)
    {
        Outcome::BlackJack
    } else if score(dealer_cards) == score(player_cards) {
        Outcome::Push
    } else if score(dealer_cards) > 21
        || score(player_cards) > score(dealer_cards)
    {
        Outcome::Win
    } else {
        Outcome::Lose
    };

    GameState {
        dealer_cards,
        player_cards,
        dealer_score: score(dealer_cards),
        player_score: score(player_cards),
        outcome,
        bet,
    }
}

