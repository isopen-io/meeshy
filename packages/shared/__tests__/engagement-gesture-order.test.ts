/**
 * L'ordre des gestes de publication (#9667, décision du porteur du 2026-10-08) :
 * Réel > Post > Commentaire > Story > Humeur, et il tient pour CHAQUE
 * visibilité — la story la plus visible reste sous le commentaire, le post le
 * moins visible au-dessus.
 */
import { describe, it, expect } from 'vitest';
import { VISIBILITY_VARIANTS } from '../types/engagement-operations.js';
import { DEFAULT_ENGAGEMENT_SCALE, basePointsForOperation, dailyGestureLimit } from '../types/engagement-scale.js';
import { ErrorCode, ErrorMessages } from '../types/errors.js';

const ops = DEFAULT_ENGAGEMENT_SCALE.operations;
const VISIBLE = VISIBILITY_VARIANTS.filter((variant) => variant !== 'other');

describe('le barème de la décision', () => {
  it('un réel vaut 300, plafond 10 par jour', () => {
    expect(ops['content.reel']).toMatchObject({ points: 300, cap: 10 });
  });

  it('un post vaut 150 / 100 / 70 selon sa visibilité, rien hors de ces trois', () => {
    expect(ops['content.post'].variantPoints).toEqual({ public: 150, community: 100, friends: 70, other: 0 });
  });

  it('un commentaire, écrit ou vocal, vaut 40, borné par les limites quotidiennes de gestes', () => {
    expect(ops['comment.text'].points).toBe(40);
    expect(ops['comment.audio'].points).toBe(40);
    expect(dailyGestureLimit(DEFAULT_ENGAGEMENT_SCALE, 'comment', 'original')).toBe(50);
    expect(dailyGestureLimit(DEFAULT_ENGAGEMENT_SCALE, 'comment', 'repost')).toBe(10);
  });

  it('une story vaut 30 / 20 / 10 selon sa visibilité, rien hors de ces trois', () => {
    expect(ops['content.story'].variantPoints).toEqual({ public: 30, community: 20, friends: 10, other: 0 });
  });

  it('une humeur vaut 5, plafond 3 par jour', () => {
    expect(ops['content.status']).toMatchObject({ points: 5, cap: 3 });
  });
});

describe('Réel > Post > Commentaire > Story > Humeur, à toute visibilité', () => {
  const points = (key: Parameters<typeof basePointsForOperation>[1], variant?: string) =>
    basePointsForOperation(DEFAULT_ENGAGEMENT_SCALE, key, variant);

  it.each(VISIBLE)('visibilité %s', (variant) => {
    const lowestPost = Math.min(...VISIBLE.map((v) => points('content.post', v)));
    const highestStory = Math.max(...VISIBLE.map((v) => points('content.story', v)));
    expect(points('content.reel')).toBeGreaterThan(points('content.post', variant));
    expect(lowestPost).toBeGreaterThan(points('comment.text'));
    expect(points('comment.text')).toBeGreaterThan(highestStory);
    expect(points('content.story', variant)).toBeGreaterThan(points('content.status'));
  });
});

describe('un refus de limite quotidienne dit qu’il compte des gestes, jamais des points (porteur, 2026-10-08)', () => {
  it.each([ErrorCode.DAILY_COMMENT_LIMIT, ErrorCode.DAILY_REACTION_LIMIT])('%s', (code) => {
    expect(ErrorMessages[code].fr).toMatch(/gestes, jamais vos points/);
    expect(ErrorMessages[code].en).toMatch(/actions, never your points/);
  });
});
