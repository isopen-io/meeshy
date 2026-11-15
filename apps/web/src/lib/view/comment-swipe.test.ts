import { describe, expect, test } from 'bun:test';

import {
  COMMENT_SWIPE_ACTION_ZONE,
  COMMENT_SWIPE_COMMIT_DISTANCE,
  COMMENT_SWIPE_DOMINANCE_RATIO,
  COMMENT_SWIPE_MINIMUM_DISTANCE,
  COMMENT_SWIPE_RUBBER_BAND,
  commentSwipeCommits,
  commentSwipeEngages,
  commentSwipeOffset,
  commentSwipeProgress,
  commentSwipeTrackedOffset,
  readingDelta,
} from './comment-swipe';

describe('le glissé « répondre » d’un commentaire (#8583) — miroir de CommentSwipeRules', () => {
  test('les constantes sont celles de BubbleSwipeResistance (.normal)', () => {
    expect(COMMENT_SWIPE_MINIMUM_DISTANCE).toBe(22);
    expect(COMMENT_SWIPE_DOMINANCE_RATIO).toBe(3);
    expect(COMMENT_SWIPE_ACTION_ZONE).toBe(72);
    expect(COMMENT_SWIPE_RUBBER_BAND).toBe(0.15);
    expect(COMMENT_SWIPE_COMMIT_DISTANCE).toBe(66);
  });

  test('sous 22 px, le geste n’est pas engagé', () => {
    expect(commentSwipeEngages(22, 0)).toBe(false);
    expect(commentSwipeEngages(23, 0)).toBe(true);
  });

  test('un glissé qui n’est pas trois fois plus horizontal que vertical appartient au défilement', () => {
    expect(commentSwipeEngages(60, 20)).toBe(false);
    expect(commentSwipeEngages(61, 20)).toBe(true);
    expect(commentSwipeOffset(60, 20)).toBeNull();
  });

  test('le doigt est suivi 1:1 dans la zone d’action, puis l’élastique freine à 15 %', () => {
    expect(commentSwipeTrackedOffset(50)).toBe(50);
    expect(commentSwipeTrackedOffset(72)).toBe(72);
    expect(commentSwipeTrackedOffset(172)).toBeCloseTo(72 + 100 * 0.15);
  });

  test('vers la GAUCHE, la rangée ne bouge pas : un commentaire n’a qu’une action', () => {
    expect(commentSwipeOffset(-80, 0)).toBe(0);
  });

  test('relâcher au seuil répond, en deçà le geste s’annule', () => {
    expect(commentSwipeCommits(65.9)).toBe(false);
    expect(commentSwipeCommits(66)).toBe(true);
    const offset = commentSwipeOffset(70, 2);
    expect(offset).toBe(70);
    expect(commentSwipeCommits(offset ?? 0)).toBe(true);
  });

  test('l’avancement va de 0 à 1 et plafonne au seuil', () => {
    expect(commentSwipeProgress(0)).toBe(0);
    expect(commentSwipeProgress(33)).toBeCloseTo(0.5);
    expect(commentSwipeProgress(200)).toBe(1);
  });

  test('en RTL, « vers la droite » se lit depuis le bord de début', () => {
    expect(readingDelta(-40, 'rtl')).toBe(40);
    expect(readingDelta(40, 'ltr')).toBe(40);
  });
});
