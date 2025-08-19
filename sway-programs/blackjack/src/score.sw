library;

use std::bytes::Bytes;
use ::error::*;

pub fn is_blackjack(cards: Bytes) -> bool {
    score(cards) == 21 && cards.len() == 2
}

pub fn score(cards: Bytes) -> u8 {
    let mut score: u8 = 0;
    let mut ace_count: u8 = 0;

    let mut i = 0;
    while i < cards.len() {
        let card = cards.get(i).unwrap();
        if card == 0 {
            score += 1;
            ace_count += 1;
        } else if card >= 1 && card <= 8 {
            score += card + 1;
        } else if card >= 9 && card <= 12 {
            score += 10;
        } else {
            panic BlackjackError::InvalidCard;
        }
        i += 1;
    }

    let mut i = 0u8;
    while i < ace_count && score <= 21 {
        if score + 10 <= 21 {
            score += 10;
        }
        i += 1;
    }
    score
}

#[test]
fn test_score() {
    let mut hand = Bytes::new();
    hand.push(0); // A
    hand.push(0); // A
    assert_eq(score(hand), 12);

    let mut hand = Bytes::new();
    hand.push(0); // A
    hand.push(9); // 10
    assert_eq(score(hand), 21);

    let mut hand = Bytes::new();
    hand.push(4); // 5
    hand.push(4); // 5
    hand.push(0); // A
    hand.push(0); // A
    hand.push(0); // A
    hand.push(0); // A
    hand.push(0); // A
    hand.push(0); // A
    hand.push(0); // A
    hand.push(0); // A
    hand.push(0); // A
    hand.push(0); // A
    assert_eq(score(hand), 20);

    let mut hand = Bytes::new();
    hand.push(4); // 5
    hand.push(2); // 3
    hand.push(11); // Q
    assert_eq(score(hand), 18);

    let mut hand = Bytes::new();
    assert_eq(score(hand), 0);
}
