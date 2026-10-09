/**
 * LA GRILLE DES PUBLICATIONS (#9667, décision du porteur du 2026-10-08, qui
 * remplace la grille du matin) : chaque contenu vaut selon QUI PEUT LE VOIR —
 * public / communauté / amis ; une audience restreinte (« sauf », « seulement »,
 * brouillon) ne vaut rien ; une visibilité inconnue vaut la plus basse (amis),
 * jamais la plus haute. Les plafonds restent des comptes d'ACTES.
 */
import { describe, it, expect } from 'vitest';
import {
  ENGAGEMENT_OPERATION_CATALOG,
  VISIBILITY_VARIANTS,
  visibilityVariant,
  type EngagementOperationKey,
} from '../types/engagement-operations.js';
import { DEFAULT_ENGAGEMENT_SCALE, basePointsForOperation, dailyGestureLimit, gestureFamilyOf } from '../types/engagement-scale.js';
import { ErrorCode, ErrorMessages } from '../types/errors.js';

const ops = DEFAULT_ENGAGEMENT_SCALE.operations;

const GRID: ReadonlyArray<readonly [EngagementOperationKey, number, number, number]> = [
  ['content.reel', 1000, 500, 250],
  ['content.post', 500, 200, 100],
  ['content.story', 300, 200, 100],
  ['content.status', 50, 25, 10],
  ['comment.text', 100, 50, 10],
  ['comment.audio', 100, 50, 10],
];

describe('la grille, contenu × visibilité', () => {
  it.each(GRID)('%s : public %i, communauté %i, amis %i, audience restreinte 0', (key, pub, community, friends) => {
    expect(ENGAGEMENT_OPERATION_CATALOG[key].variants).toEqual(VISIBILITY_VARIANTS);
    expect(ops[key].variantPoints).toEqual({ public: pub, community, friends, other: 0 });
    expect(basePointsForOperation(DEFAULT_ENGAGEMENT_SCALE, key, 'public')).toBe(pub);
    expect(basePointsForOperation(DEFAULT_ENGAGEMENT_SCALE, key, 'community')).toBe(community);
    expect(basePointsForOperation(DEFAULT_ENGAGEMENT_SCALE, key, 'friends')).toBe(friends);
    expect(basePointsForOperation(DEFAULT_ENGAGEMENT_SCALE, key, 'other')).toBe(0);
  });

  it.each(GRID)('%s sans variante vaut la plus basse des visibilités ouvertes (amis), jamais la plus haute', (key, _pub, _community, friends) => {
    expect(basePointsForOperation(DEFAULT_ENGAGEMENT_SCALE, key)).toBe(friends);
  });
});

describe('la visibilité d’un contenu, lue sur la ligne, en variante', () => {
  it.each([
    ['PUBLIC', 'public'],
    ['COMMUNITY', 'community'],
    ['FRIENDS', 'friends'],
    ['EXCEPT', 'other'],
    ['ONLY', 'other'],
    ['PRIVATE', 'other'],
    ['public', 'public'],
  ])('%s ⇒ %s', (visibility, variant) => {
    expect(visibilityVariant(visibility)).toBe(variant);
  });

  it.each([null, undefined, '', 'EVERYONE', 'secret'])('une visibilité inconnue (%s) vaut amis, jamais public', (visibility) => {
    expect(visibilityVariant(visibility)).toBe('friends');
  });
});

describe('les plafonds restent des comptes d’actes, inchangés', () => {
  it('10 réels, 50 posts, 20 stories, 3 humeurs par jour', () => {
    expect(ops['content.reel'].cap).toBe(10);
    expect(ops['content.post'].cap).toBe(50);
    expect(ops['content.story'].cap).toBe(20);
    expect(ops['content.status'].cap).toBe(3);
    for (const key of ['content.reel', 'content.post', 'content.story', 'content.status'] as const) {
      expect(ENGAGEMENT_OPERATION_CATALOG[key].capScope).toBe('day');
    }
  });

  it('les commentaires sont bornés par les limites quotidiennes de gestes (50 sur un original, 10 sous une republication)', () => {
    expect(gestureFamilyOf('comment.text')).toBe('comment');
    expect(gestureFamilyOf('comment.audio')).toBe('comment');
    expect(dailyGestureLimit(DEFAULT_ENGAGEMENT_SCALE, 'comment', 'original')).toBe(50);
    expect(dailyGestureLimit(DEFAULT_ENGAGEMENT_SCALE, 'comment', 'repost')).toBe(10);
  });
});

describe('aucun geste répétable n’échappe à une borne d’actes (#9667)', () => {
  it('les seuls répétables sans plafond propre sont bornés ailleurs : limites de gestes, ou une fois par publication', () => {
    const uncapped = Object.entries(ENGAGEMENT_OPERATION_CATALOG)
      .filter(([key, definition]) => definition.frequency === 'repeatable' && (definition.capScope === 'none' || ops[key as keyof typeof ops].cap === null))
      .map(([key]) => key)
      .sort();
    expect(uncapped).toEqual(['comment.audio', 'comment.text', 'tool.direct_publish', 'tool.in_app_edit', 'tool.post_reaction']);
    expect(gestureFamilyOf('tool.post_reaction')).toBe('reaction');
  });
});

describe('un refus de limite quotidienne dit qu’il compte des gestes, jamais des points (porteur, 2026-10-08)', () => {
  it.each([ErrorCode.DAILY_COMMENT_LIMIT, ErrorCode.DAILY_REACTION_LIMIT])('%s', (code) => {
    expect(ErrorMessages[code].fr).toMatch(/gestes, jamais vos points/);
    expect(ErrorMessages[code].en).toMatch(/actions, never your points/);
  });
});
