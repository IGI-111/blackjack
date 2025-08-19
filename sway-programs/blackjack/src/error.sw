library;

#[error_type]
pub enum BlackjackError {
    #[error(m = "Invalid amount")]
    InvalidAmount: (),
    #[error(m = "Invalid card")]
    InvalidCard: (),
    #[error(m = "Game has ended")]
    GameEnded: (),
    #[error(m = "Invalid phase")]
    InvalidPhase: (),
    #[error(m = "Randomness has run out")]
    RandomnessRanOut: (),
    #[error(m = "Randomness is not ready")]
    RandomnessNotReady: (),
    #[error(m = "Invalid seed")]
    InvalidSeed: (),
    #[error(m = "Reveal too early")]
    RevealTooEarly: (),
    #[error(m = "Bet is larger than max payout")]
    BetTooLarge: (),
    #[error(m = "Trying to redeem an outcome with no payout")]
    NoPayoutOutcome: (),
}
