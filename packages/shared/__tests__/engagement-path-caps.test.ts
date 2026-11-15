/**
 * Les limites quotidiennes de GESTES (#9584, décision porteur 2026-10-07) : par
 * personne et par jour civil du compte, combien de commentaires et de réactions
 * de post elle peut faire, sur un original ou sous une republication. Une limite
 * borne le geste ET ses points : les opérations qu'elle gouverne n'ont pas d'autre
 * plafond, sans quoi on pourrait faire un geste qui ne rapporte rien.
 */
import { describe, it, expect } from 'vitest';
import {
  DEFAULT_ENGAGEMENT_SCALE,
  DAILY_GESTURE_LIMIT_CEILING,
  DEFAULT_PATH_CAPS,
  dailyGestureLimit,
  gestureFamilyOf,
  parseEngagementScale,
  type EngagementScale,
} from '../types/engagement-scale.js';
import { ENGAGEMENT_OPERATIONS, ENGAGEMENT_OPERATION_CATALOG } from '../types/engagement-operations.js';

const withPathCaps = (pathCaps: unknown): unknown => ({ ...DEFAULT_ENGAGEMENT_SCALE, pathCaps });

describe('les limites quotidiennes de gestes', () => {
  it('valent par défaut ce que le porteur a fixé : 50 et 10 commentaires, 100 et 50 réactions', () => {
    expect(DEFAULT_PATH_CAPS).toEqual({
      comment: { original: 50, repost: 10 },
      reaction: { original: 100, repost: 50 },
    });
    expect(DEFAULT_ENGAGEMENT_SCALE.pathCaps).toEqual(DEFAULT_PATH_CAPS);
  });

  it('se lisent par famille et par chemin, réglées par l’administration', () => {
    const scale = parseEngagementScale(withPathCaps({ comment: { original: 7, repost: 2 }, reaction: { original: 0, repost: 3 } })) as EngagementScale;

    expect(dailyGestureLimit(scale, 'comment', 'original')).toBe(7);
    expect(dailyGestureLimit(scale, 'comment', 'repost')).toBe(2);
    expect(dailyGestureLimit(scale, 'reaction', 'original')).toBe(0);
    expect(dailyGestureLimit(scale, 'reaction', 'repost')).toBe(3);
  });

  it('gouvernent les commentaires (texte et vocal) et les réactions de post, aucune autre opération', () => {
    expect(gestureFamilyOf('comment.text')).toBe('comment');
    expect(gestureFamilyOf('comment.audio')).toBe('comment');
    expect(gestureFamilyOf('tool.post_reaction')).toBe('reaction');
    expect(gestureFamilyOf('tool.post_bookmark')).toBeNull();
    expect(gestureFamilyOf('tool.comment_like')).toBeNull();
    expect(gestureFamilyOf('tool.reaction')).toBeNull();
  });

  it('les opérations qu’elles gouvernent n’ont aucun autre plafond quotidien — gestes et points ne divergent pas', () => {
    const governed = ENGAGEMENT_OPERATIONS.filter((key) => gestureFamilyOf(key) !== null);

    expect(governed).toEqual(expect.arrayContaining(['comment.text', 'comment.audio', 'tool.post_reaction']));
    governed.forEach((key) => {
      expect(ENGAGEMENT_OPERATION_CATALOG[key].capScope).toBe('none');
      expect(ENGAGEMENT_OPERATION_CATALOG[key].defaults.cap).toBeNull();
    });
  });

  it('un barème réglé avant elles se relit avec les défauts', () => {
    const { pathCaps: _absent, ...legacy } = { ...DEFAULT_ENGAGEMENT_SCALE, pathCaps: undefined };
    expect(parseEngagementScale(legacy)?.pathCaps).toEqual(DEFAULT_PATH_CAPS);
  });

  it.each([
    ['une limite « sans limite » (null)', { comment: { original: null, repost: 10 }, reaction: { original: 100, repost: 50 } }],
    ['une limite négative', { comment: { original: -1, repost: 10 }, reaction: { original: 100, repost: 50 } }],
    ['une limite fractionnaire', { comment: { original: 1.5, repost: 10 }, reaction: { original: 100, repost: 50 } }],
    ['une limite au-delà du plafond dur', { comment: { original: DAILY_GESTURE_LIMIT_CEILING + 1, repost: 10 }, reaction: { original: 100, repost: 50 } }],
    ['une limite non numérique', { comment: { original: '50', repost: 10 }, reaction: { original: 100, repost: 50 } }],
    ['une famille manquante', { comment: { original: 50, repost: 10 } }],
    ['un chemin manquant', { comment: { original: 50 }, reaction: { original: 100, repost: 50 } }],
    ['une section qui n’est pas un objet', null],
  ])('refusent %s — le barème entier est rejeté, la passerelle sert les défauts', (_label, pathCaps) => {
    expect(parseEngagementScale(withPathCaps(pathCaps))).toBeNull();
  });

  it.each([
    ['null', null],
    ['négative', -5],
    ['NaN', Number.NaN],
    ['infinie', Number.POSITIVE_INFINITY],
    ['au-delà du plafond dur', DAILY_GESTURE_LIMIT_CEILING + 1],
    ['absente', undefined],
  ])('un barème forgé en mémoire avec une limite %s retombe sur le DÉFAUT du code, jamais sur « sans limite »', (_label, value) => {
    const forged = { ...DEFAULT_ENGAGEMENT_SCALE, pathCaps: { comment: { original: value, repost: value }, reaction: { original: value, repost: value } } } as unknown as EngagementScale;

    expect(dailyGestureLimit(forged, 'comment', 'repost')).toBe(10);
    expect(dailyGestureLimit(forged, 'comment', 'original')).toBe(50);
    expect(dailyGestureLimit(forged, 'reaction', 'repost')).toBe(50);
    expect(dailyGestureLimit(forged, 'reaction', 'original')).toBe(100);
  });

  it('un barème sans section du tout, ou à famille absente, sert les défauts', () => {
    const noSection = { ...DEFAULT_ENGAGEMENT_SCALE, pathCaps: undefined } as EngagementScale;
    const noFamily = { ...DEFAULT_ENGAGEMENT_SCALE, pathCaps: { comment: { original: 7, repost: 2 } } } as unknown as EngagementScale;

    expect(dailyGestureLimit(noSection, 'comment', 'repost')).toBe(10);
    expect(dailyGestureLimit(noFamily, 'reaction', 'original')).toBe(100);
  });
});
