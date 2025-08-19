
import React, { useState, useEffect } from 'react';
import { useWallet, useBalance } from "@fuels/react";
import { Address, bn, WalletUnlocked } from "fuels";

import { Blackjack as BlackjackContract, GameStateOutput } from "../sway-api";
import { useNotification } from "../hooks/useNotification.tsx";
import { useBaseAssetId } from "../hooks/useBaseAssetId.tsx";
import { isLocal, contractId } from "../lib.tsx";

const genRanHex = (size: number) => [...Array(size)].map(() => Math.floor(Math.random() * 16).toString(16)).join('');
const randomSeed = () => `0x${genRanHex(64)}`.toString();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const outcomeIsRedeemable = (outcome: GameStatus) => ['Win', 'BlackJack', 'Push'].includes(outcome);

type Suit = "hearts" | "spades" | "clubs" | "diamonds";
type Rank = "?" | "A" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10" | "J" | "Q" | "K";
type GameStatus =  'Win' | 'BlackJack' | 'Lose' | 'Bust' | 'Push' | 'Continue';
interface Card {
  suit: Suit,
  rank: Rank,
}
interface LocalGameState {
    playerHand: Card[],
    dealerHand: Card[],
    playerScore: number,
    dealerScore: number | '?',
    gameStatus: GameStatus,
    canHit: boolean,
    canStand: boolean,
    canRedeem: boolean,
}

function convertGameState(game_state: GameStateOutput): LocalGameState {
  const CARD_DICT = [ "A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K" ];
  const SUIT_DICT = ['hearts', 'spades', 'clubs', 'diamonds'];

  const playerHand = [...game_state.player_cards].map((x, i) => ({ rank: CARD_DICT[x], suit: SUIT_DICT[i % 4]}));
  const dealerHand = [...game_state.dealer_cards].map((x, i) => ({ rank: CARD_DICT[x], suit: SUIT_DICT[i % 4]}));

  const playerScore = game_state.player_score;
  const dealerScore = dealerHand.length < 2 ? '?' : game_state.dealer_score;

  while(playerHand.length < 2) {
    playerHand.push({ rank:'?', suit:"spades" })
  }
  while(dealerHand.length < 2) {
    dealerHand.push({ rank:'?', suit:"spades" })
  }

  return {
    playerHand,
    dealerHand,
    playerScore,
    dealerScore,
    gameStatus: game_state.outcome.toString(),
    canHit: game_state.outcome.toString() == 'Continue',
    canStand: game_state.outcome.toString() == 'Continue',
    canRedeem: outcomeIsRedeemable(game_state.outcome.toString()) && game_state.bet.toNumber() > 0,
  }
}

export default function Blackjack() {
  const {
    errorNotification,
    transactionSubmitNotification,
    transactionSuccessNotification,
  } = useNotification();

  const { baseAssetId } = useBaseAssetId();
  const [contract, setContract] = useState<BlackjackContract>();
  const [bet, setBet] = useState<number>(1000);
  const [isLoading, setIsLoading] = useState(false);
  const { wallet, refetch } = useWallet();
  const address = wallet?.address.toB256() || "";
  const { balance , refetch: refetchBalance } = useBalance({
    address,
    assetId: baseAssetId,
  });

  const [gameState, setGameState] = useState<LocalGameState>({
    playerHand: [
      { suit: 'hearts', rank: '?' },
      { suit: 'spades', rank: '?' }
    ],
    dealerHand: [
      { suit: 'clubs', rank: '?' },
      { suit: 'diamonds', rank: '?' } // Hidden card
    ],
    playerScore: 17,
    dealerScore: '?',
    gameStatus: 'playing', // 'playing', 'playerWin', 'dealerWin', 'push', 'bust'
    canHit: false,
    canStand: false,
    canRedeem: false,
  });

  useEffect(() => {
    if (wallet) {
      console.log("Wallet:", wallet.address.toString());
      const contract = new BlackjackContract(contractId, wallet);
      setContract(contract);
      refresh();
    }
  }, [wallet]);

  const refresh = async () => {
    if(contract && wallet) {
      const { value: game_state } = await contract.functions.game_state({ bits: wallet.address.toString() }).get();
      setGameState(convertGameState(game_state));
    }
    refetchBalance();
  }

  const handleRedeem= async () => {
    if(contract) {
      const { waitForResult } = await contract.functions.redeem(gameState.gameStatus).call();
      await waitForResult();
      refresh();
    }
  };

  const handleHit = async () => {
    if(contract) {
      const buf = await contract.functions.hit(randomSeed()).call();
      const { waitForResult, waitForPreConfirmation } = buf;
      await waitForResult();
      refresh();
    }
  };

  const handleStand = async () => {
    if(contract) {
      const { waitForResult } = await contract.functions.stand(randomSeed()).call();
      await waitForResult();
      refresh();
    }
  };

  const handleNewGame = async () => {
    if(contract) {
      const { waitForResult } = await contract.functions.start(randomSeed(), bet)
        .callParams({
          forward: [bet, baseAssetId],
        }).call();
      await waitForResult();
      refresh();
    }
  };

  const handleFund = async () => {
    if(contract) {
      const { waitForResult } = await contract.functions.fund()
        .callParams({
          forward: [bet, baseAssetId],
        }).call();
      await waitForResult();
      refresh();
    }
  };

  const handleBetChange = (amount: number) => {
    setBet(amount);
    refresh();
  };

  // Card component
  const Card = ({ suit, rank, isHidden = false }: { suit: Suit, rank: Rank, isHidden: boolean }) => {
    const getSuitSymbol = (suit: Suit) => {
      const symbols = {
        hearts: '♥',
        diamonds: '♦',
        clubs: '♣',
        spades: '♠'
      };
      return symbols[suit] || '';
    };

    const getSuitColor = (suit: Suit) => {
      return suit === 'hearts' || suit === 'diamonds' ? 'text-red-500' : 'text-gray-800';
    };

    if (isHidden || rank === '?') {
      return (
        <div className="w-20 h-28 bg-gradient-to-br from-indigo-600 via-purple-600 to-indigo-800 rounded-lg shadow-2xl border border-purple-400 flex items-center justify-center transform hover:scale-110 transition-all duration-300 hover:shadow-purple-500/50 hover:shadow-xl">
          <div className="text-white text-2xl animate-pulse">?</div>
          <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent rounded-lg"></div>
        </div>
      );
    }

    return (
      <div className="w-20 h-28 bg-gradient-to-br from-gray-50 to-white rounded-lg shadow-2xl border-2 border-gray-200 flex flex-col items-center justify-center p-2 transform hover:scale-110 transition-all duration-300 hover:shadow-xl hover:shadow-emerald-500/30 relative overflow-hidden">
        {/* Card shine effect */}
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent transform -skew-x-12 -translate-x-full hover:translate-x-full transition-transform duration-700"></div>
        
        <div className={`text-center ${getSuitColor(suit)} relative z-10`}>
          <div className="text-2xl font-bold mb-1">{rank}</div>
          <div className="text-3xl drop-shadow-sm">{getSuitSymbol(suit)}</div>
        </div>
      </div>
    );
  };

  // Hand component
  const Hand = ({ cards, title, score, isDealer = false }: { cards: Card[], title: string, score: number | '?', isDealer: boolean }) => (
    <div className="flex flex-col items-center space-y-6">
      <div className="relative">
        <h3 className="text-2xl font-bold bg-gradient-to-r from-emerald-300 to-teal-200 bg-clip-text text-transparent drop-shadow-lg">
          {title}
        </h3>
        {title === 'Player' && <div className="absolute -top-2 -right-8 text-emerald-400 text-xl">♠</div>}
        {title === 'Dealer' && <div className="absolute -top-2 -right-8 text-emerald-400 text-xl">♣</div>}
      </div>
      <div className="flex space-x-3">
        {cards.map((card, index) => (
          <div key={index} className="transform hover:translate-y-2 transition-all duration-300">
            <Card 
              suit={card.suit} 
              rank={card.rank} 
              isHidden={isDealer && index === 1 && gameState.gameStatus === 'playing'}
            />
          </div>
        ))}
      </div>
      <div className="bg-black/30 backdrop-blur-sm rounded-lg px-6 py-3 border border-emerald-400/50">
        <div className="text-xl font-bold text-emerald-300 text-center drop-shadow-lg">
          Score: {score}
        </div>
      </div>
    </div>
  );

  // Betting component
  const BettingControls = () => (
    <div className="bg-gradient-to-br from-gray-900 via-gray-800 to-black rounded-xl p-6 space-y-6 border border-emerald-500/30 shadow-2xl relative overflow-hidden">
      {/* Decorative background pattern */}
      <div className="absolute inset-0 opacity-10">
        <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-emerald-400 to-transparent"></div>
      </div>
      
      <div className="relative z-10">
        <h3 className="text-center text-emerald-300 font-bold text-xl mb-4 tracking-wide">BETTING</h3>
        <div className="text-center space-y-2">
          <div className="bg-black/50 rounded-lg p-3 border border-emerald-500/50">
            <div className="text-lg font-bold text-emerald-300">Balance: <span className="text-white">{balance && `${balance.toNumber()} Wei`}</span></div>
          </div>
          <div className="bg-black/50 rounded-lg p-3 border border-teal-500/50">
            <div className="text-lg font-bold text-teal-300">Bet: <span className="text-white">{bet} Wei</span></div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 mt-4">
          {[1000, 2000, 3000, 10_000].map((amount) => (
            <button
              key={amount}
              onClick={() => handleBetChange(amount)}
              className="px-4 py-3 bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white font-bold rounded-lg transition-all duration-300 transform hover:scale-105 hover:shadow-lg hover:shadow-emerald-500/50 border border-emerald-400"
            >
              {amount}Wei
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  // Game status message
  const getStatusMessage = () => {
    switch (gameState.gameStatus) {
      case 'Win':
        return { text: 'You Win! 🎉', color: 'text-white' };
      case 'BlackJack':
        return { text: 'Blackjack! You Win! 🎉', color: 'text-white' };
      case 'Lose':
        return { text: 'Dealer Wins', color: 'text-red-400' };
      case 'Push':
        return { text: "It's a Push!", color: 'text-yellow-400' };
      case 'Bust':
        return { text: 'Bust! 💥', color: 'text-red-400' };
      default:
        return { text: 'Make your move', color: 'text-white' };
    }
  };

  const statusMessage = getStatusMessage();

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-800 via-green-700 to-green-900 p-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <div className={`text-2xl font-semibold ${statusMessage.color}`}>
            {statusMessage.text}
          </div>
        </div>

        {/* Game Table */}
        <div className="bg-green-600 rounded-3xl shadow-2xl p-8 mb-6 border-4 border-yellow-600">
          {/* Dealer Section */}
          <div className="mb-12">
            <Hand
              cards={gameState.dealerHand}
              title="Dealer"
              score={gameState.dealerScore}
              isDealer={true}
            />
          </div>

          {/* Player Section */}
          <div>
            <Hand
              cards={gameState.playerHand}
              title="Player"
              score={gameState.playerScore}
              isDealer={false}
            />
          </div>
        </div>

        {/* Controls Section */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Betting Controls */}
          <BettingControls />

          {/* Game Actions */}
          <div className="bg-gradient-to-br from-gray-900 via-gray-800 to-black rounded-xl p-6 border border-emerald-500/30 shadow-2xl relative overflow-hidden">
            <div className="absolute inset-0 opacity-10">
              <div className="absolute bottom-0 right-0 w-full h-full bg-gradient-to-tl from-teal-400 to-transparent"></div>
            </div>
            
            <div className="relative z-10">
              <h3 className="text-emerald-300 text-xl font-bold text-center mb-6 tracking-wide">ACTIONS</h3>
              <div className="grid grid-cols-2 gap-4">
                <button
                  onClick={handleHit}
                  disabled={!gameState.canHit}
                  className="px-4 py-4 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 disabled:from-gray-600 disabled:to-gray-700 disabled:cursor-not-allowed text-white rounded-lg font-bold transition-all duration-300 transform hover:scale-105 hover:shadow-lg hover:shadow-blue-500/50 border border-blue-400 disabled:border-gray-500"
                >
                  HIT
                </button>
                <button
                  onClick={handleStand}
                  disabled={!gameState.canStand}
                  className="px-4 py-4 bg-gradient-to-r from-red-600 to-red-500 hover:from-red-500 hover:to-red-400 disabled:from-gray-600 disabled:to-gray-700 disabled:cursor-not-allowed text-white rounded-lg font-bold transition-all duration-300 transform hover:scale-105 hover:shadow-lg hover:shadow-red-500/50 border border-red-400 disabled:border-gray-500"
                >
                  STAND
                </button>
                <button
                  onClick={handleRedeem}
                  disabled={!gameState.canRedeem}
                  className="px-4 py-4 bg-gradient-to-r from-yellow-600 to-yellow-500 hover:from-yellow-500 hover:to-yellow-400 disabled:from-gray-600 disabled:to-gray-700 disabled:cursor-not-allowed text-white rounded-lg font-bold transition-all duration-300 transform hover:scale-105 hover:shadow-lg hover:shadow-yellow-500/50 border border-yellow-400 disabled:border-gray-500"
                >
                  REDEEM
                </button>
              </div>
            </div>
          </div>

          {/* Game Controls */}
          <div className="bg-gradient-to-br from-gray-900 via-gray-800 to-black rounded-xl p-6 border border-emerald-500/30 shadow-2xl relative overflow-hidden">
            <div className="absolute inset-0 opacity-10">
              <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-green-400 to-transparent"></div>
            </div>
            
            <div className="relative z-10">
              <h3 className="text-emerald-300 text-xl font-bold text-center mb-6 tracking-wide">GAME</h3>
              <button
                onClick={handleNewGame}
                className="w-full px-6 py-4 bg-gradient-to-r from-emerald-600 to-green-500 hover:from-emerald-500 hover:to-green-400 text-white rounded-lg font-bold text-lg transition-all duration-300 transform hover:scale-105 hover:shadow-lg hover:shadow-emerald-500/50 border border-emerald-400"
              >
                NEW GAME
              </button>
            {/*
              <button
                onClick={refresh}
                className="w-full px-6 py-4 bg-gradient-to-r from-black-600 to-black-500 hover:from-black-500 hover:to-black-400 text-white rounded-lg font-bold text-lg transition-all duration-300 transform hover:scale-105 hover:shadow-lg hover:shadow-black-500/50 border border-black-400"
              >
                REFRESH
              </button>
              <button
                onClick={handleFund}
                className="w-full px-6 py-4 bg-gradient-to-r from-black-600 to-black-500 hover:from-black-500 hover:to-black-400 text-white rounded-lg font-bold text-lg transition-all duration-300 transform hover:scale-105 hover:shadow-lg hover:shadow-black-500/50 border border-black-400"
              >
                FUND
              </button>
              */}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
