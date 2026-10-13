/**
 * Les séries par acte et la fidélité (#10388, #10389, #10390).
 */
import { describe, it, expect } from 'vitest';
import {
  ENGAGEMENT_STREAK_ACTS,
  LEGACY_STREAK_BONUS_POINTS_CEILING,
  crossedStreakTiers,
  civilDaysBetween,
  nextActStreak,
  reachedLoyaltyTiers,
  streakActOf,
} from '../types/engagement-act-streaks.js';
import {
  DEFAULT_ENGAGEMENT_SCALE,
  ENGAGEMENT_SCALE_POINTS_CEILING,
  ENGAGEMENT_SCALE_TIER_POINTS_TOTAL_CEILING,
  ENGAGEMENT_STREAK_TIERS_MAX,
  mergeEngagementScaleBody,
  parseEngagementScale,
  type EngagementScale,
} from '../types/engagement-scale.js';

const asJson = <T>(value: T): unknown => JSON.parse(JSON.stringify(value));

const legacyBody = (patch: Record<string, unknown> = {}): Record<string, unknown> => {
  const { streaks: _streaks, loyalty: _loyalty, ...legacy } = asJson(DEFAULT_ENGAGEMENT_SCALE) as Record<string, unknown>;
  return { ...legacy, ...patch };
};

const withStreaks = (streaks: unknown, patch: Record<string, unknown> = {}): unknown => ({
  ...(asJson(DEFAULT_ENGAGEMENT_SCALE) as Record<string, unknown>),
  streaks,
  ...patch,
});

describe('streakActOf', () => {
  it('range chaque publication sous son acte', () => {
    expect(streakActOf({ operationKey: 'content.post' })).toBe('post');
    expect(streakActOf({ operationKey: 'content.reel' })).toBe('reel');
    expect(streakActOf({ operationKey: 'content.story' })).toBe('story');
    expect(streakActOf({ operationKey: 'content.status' })).toBe('mood');
  });

  it('range un commentaire texte ou vocal sous « comment »', () => {
    expect(streakActOf({ operationKey: 'comment.text' })).toBe('comment');
    expect(streakActOf({ operationKey: 'comment.audio' })).toBe('comment');
  });

  it('ne compte un message que dans une conversation', () => {
    expect(streakActOf({ operationKey: 'content.text_message', conversationId: 'c1' })).toBe('conversation');
    expect(streakActOf({ operationKey: 'content.audio_message', conversationId: 'c1' })).toBe('conversation');
    expect(streakActOf({ operationKey: 'content.text_message' })).toBeNull();
  });

  it('range une réaction selon le type de ce qu’elle vise, jamais une humeur', () => {
    expect(streakActOf({ operationKey: 'tool.post_reaction', postType: 'POST' })).toBe('reaction_post');
    expect(streakActOf({ operationKey: 'tool.post_reaction', postType: 'REEL' })).toBe('reaction_reel');
    expect(streakActOf({ operationKey: 'tool.post_reaction', postType: 'STORY' })).toBe('reaction_story');
    expect(streakActOf({ operationKey: 'tool.post_reaction', postType: 'STATUS' })).toBeNull();
    expect(streakActOf({ operationKey: 'tool.post_reaction' })).toBeNull();
  });

  it('ne range aucun autre geste', () => {
    expect(streakActOf({ operationKey: 'tool.reaction', conversationId: 'c1' })).toBeNull();
    expect(streakActOf({ operationKey: 'streak.bonus' })).toBeNull();
  });
});

describe('nextActStreak', () => {
  it('démarre à un jour', () => {
    expect(nextActStreak(null, '2026-10-12')).toEqual({ currentDays: 1, longestDays: 1, lastDay: '2026-10-12', advanced: true });
  });

  it('ne compte le même jour qu’une fois', () => {
    const prev = { currentDays: 3, longestDays: 5, lastDay: '2026-10-12' };
    expect(nextActStreak(prev, '2026-10-12')).toEqual({ ...prev, advanced: false });
  });

  it('prolonge la série le lendemain, y compris au passage d’un mois', () => {
    expect(nextActStreak({ currentDays: 5, longestDays: 5, lastDay: '2026-09-30' }, '2026-10-01')).toEqual({
      currentDays: 6,
      longestDays: 6,
      lastDay: '2026-10-01',
      advanced: true,
    });
  });

  it('remet la série à un après un jour sauté, en gardant la plus longue', () => {
    expect(nextActStreak({ currentDays: 9, longestDays: 9, lastDay: '2026-10-10' }, '2026-10-12')).toEqual({
      currentDays: 1,
      longestDays: 9,
      lastDay: '2026-10-12',
      advanced: true,
    });
  });

  it('ne touche à rien quand le jour recule', () => {
    const prev = { currentDays: 4, longestDays: 4, lastDay: '2026-10-12' };
    expect(nextActStreak(prev, '2026-10-11')).toEqual({ ...prev, advanced: false });
  });
});

describe('les paliers franchis', () => {
  const tiers = [{ days: 7, points: 50 }, { days: 30, points: 300 }, { days: 365, points: 100_000 }];

  it('rend ceux que le passage d’un jour franchit, et eux seuls', () => {
    expect(crossedStreakTiers(tiers, 6, 7)).toEqual([{ days: 7, points: 50 }]);
    expect(crossedStreakTiers(tiers, 7, 8)).toEqual([]);
    expect(crossedStreakTiers(tiers, 364, 365)).toEqual([{ days: 365, points: 100_000 }]);
  });

  it('rend chaque palier de fidélité que l’ancienneté atteint', () => {
    expect(reachedLoyaltyTiers(tiers, 40)).toEqual([{ days: 7, points: 50 }, { days: 30, points: 300 }]);
    expect(civilDaysBetween('2025-10-12', '2026-10-12')).toBe(365);
  });
});

describe('le plafond des points', () => {
  it('monte à dix millions', () => {
    expect(ENGAGEMENT_SCALE_POINTS_CEILING).toBe(10_000_000);
    expect(LEGACY_STREAK_BONUS_POINTS_CEILING).toBe(1000);
  });
});

describe('parseEngagementScale — séries et fidélité', () => {
  it('relit un ancien barème : la série globale vient de streakBonuses, les actes n’ont aucun palier, pas de fidélité', () => {
    const parsed = parseEngagementScale(legacyBody({ streakBonuses: [{ days: 3, points: 9 }] }));
    expect(parsed?.streaks?.global).toEqual([{ days: 3, points: 9 }]);
    expect(Object.keys(parsed?.streaks?.acts ?? {})).toEqual([...ENGAGEMENT_STREAK_ACTS]);
    expect(Object.values(parsed?.streaks?.acts ?? {}).every((tiers) => tiers.length === 0)).toBe(true);
    expect(parsed?.loyalty).toEqual([]);
  });

  it('accepte un palier de 100 000 points et projette streakBonuses à 1000', () => {
    const parsed = parseEngagementScale(withStreaks({ global: [{ days: 365, points: 100_000, label: 'Un an' }] }));
    expect(parsed?.streaks?.global).toEqual([{ days: 365, points: 100_000, label: 'Un an' }]);
    expect(parsed?.streakBonuses).toEqual([{ days: 365, points: 1000 }]);
  });

  it('lit les paliers de chaque acte, triés', () => {
    const parsed = parseEngagementScale(
      withStreaks({ global: [], acts: { reel: [{ days: 30, points: 500 }, { days: 7, points: 50 }] } }),
    );
    expect(parsed?.streaks?.acts.reel).toEqual([{ days: 7, points: 50 }, { days: 30, points: 500 }]);
    expect(parsed?.streaks?.acts.story).toEqual([]);
  });

  it('lit les paliers de fidélité', () => {
    const parsed = parseEngagementScale(withStreaks(undefined, { loyalty: [{ days: 365, points: 100_000 }] }));
    expect(parsed?.loyalty).toEqual([{ days: 365, points: 100_000 }]);
  });

  it('refuse un palier hors bornes, un jour répété, un libellé trop long ou un acte inconnu', () => {
    expect(parseEngagementScale(withStreaks({ global: [{ days: 365, points: 10_000_001 }] }))).toBeNull();
    expect(parseEngagementScale(withStreaks({ global: [{ days: 10_001, points: 1 }] }))).toBeNull();
    expect(parseEngagementScale(withStreaks({ global: [{ days: 0, points: 1 }] }))).toBeNull();
    expect(parseEngagementScale(withStreaks({ global: [{ days: 7, points: 1 }, { days: 7, points: 2 }] }))).toBeNull();
    expect(parseEngagementScale(withStreaks({ global: [{ days: 7, points: 1, label: 'x'.repeat(41) }] }))).toBeNull();
    expect(parseEngagementScale(withStreaks({ global: [], acts: { dance: [] } }))).toBeNull();
    expect(parseEngagementScale(withStreaks(undefined, { loyalty: [{ days: 1.5, points: 1 }] }))).toBeNull();
  });

  it('relit à l’identique ce qu’il a lu', () => {
    const parsed = parseEngagementScale(
      withStreaks({ global: [{ days: 365, points: 100_000 }], acts: { story: [{ days: 7, points: 50 }] } }, { loyalty: [{ days: 30, points: 5 }] }),
    );
    expect(parseEngagementScale(asJson(parsed))).toEqual(parsed);
  });
});

describe('la somme des paliers tient dans le score', () => {
  const tiers = (count: number, points: number) => Array.from({ length: count }, (_, index) => ({ days: index + 1, points }));

  it("refuse un barème dont un compte toucherait plus d'un milliard de points de paliers : le score est un entier 32 bits", () => {
    const loyalty = tiers(101, ENGAGEMENT_SCALE_POINTS_CEILING);
    expect(parseEngagementScale(withStreaks({ global: [] }, { loyalty }))).toBeNull();
  });

  it('compte ensemble la série globale, chaque acte et la fidélité', () => {
    const half = tiers(50, ENGAGEMENT_SCALE_POINTS_CEILING);
    expect(parseEngagementScale(withStreaks({ global: half, acts: { post: half } }, { loyalty: [{ days: 365, points: 1 }] }))).toBeNull();
    expect(parseEngagementScale(withStreaks({ global: half, acts: { post: half } }))).not.toBeNull();
  });

  it(`borne chaque liste à ${100} paliers`, () => {
    expect(ENGAGEMENT_STREAK_TIERS_MAX).toBe(100);
    expect(parseEngagementScale(withStreaks({ global: tiers(ENGAGEMENT_STREAK_TIERS_MAX + 1, 1) }))).toBeNull();
    expect(parseEngagementScale(withStreaks({ global: tiers(ENGAGEMENT_STREAK_TIERS_MAX, 1) }))).not.toBeNull();
  });

  it("garde l'année de fidélité à 100 000 points et un palier à dix millions", () => {
    expect(ENGAGEMENT_SCALE_TIER_POINTS_TOTAL_CEILING).toBe(1_000_000_000);
    const scale = parseEngagementScale(withStreaks({ global: [{ days: 365, points: ENGAGEMENT_SCALE_POINTS_CEILING }] }, { loyalty: [{ days: 365, points: 100_000 }] }));
    expect(scale?.loyalty).toEqual([{ days: 365, points: 100_000 }]);
  });
});

describe('mergeEngagementScaleBody', () => {
  const stored = asJson({
    ...DEFAULT_ENGAGEMENT_SCALE,
    streaks: { global: [{ days: 365, points: 100_000 }], acts: { ...DEFAULT_ENGAGEMENT_SCALE.streaks?.acts, reel: [{ days: 7, points: 50 }] } },
    loyalty: [{ days: 365, points: 100_000 }],
    pathCaps: { comment: { original: 9, repost: 3 }, reaction: { original: 8, repost: 2 } },
  } satisfies EngagementScale);

  it('garde les séries, la fidélité et les limites qu’un ancien écran n’envoie pas', () => {
    const { pathCaps: _caps, ...body } = legacyBody({ streakBonuses: [{ days: 365, points: 1000 }] });
    const merged = parseEngagementScale(mergeEngagementScaleBody(stored, body));
    expect(merged?.streaks?.global).toEqual([{ days: 365, points: 100_000 }]);
    expect(merged?.streaks?.acts.reel).toEqual([{ days: 7, points: 50 }]);
    expect(merged?.loyalty).toEqual([{ days: 365, points: 100_000 }]);
    expect(merged?.pathCaps).toEqual({ comment: { original: 9, repost: 3 }, reaction: { original: 8, repost: 2 } });
  });

  it('laisse streakBonuses régler la série globale tant que le stocké ne déclare pas de séries', () => {
    const merged = parseEngagementScale(mergeEngagementScaleBody(legacyBody(), legacyBody({ streakBonuses: [{ days: 3, points: 9 }] })));
    expect(merged?.streaks?.global).toEqual([{ days: 3, points: 9 }]);
  });

  it('remplace ce que le corps déclare', () => {
    const merged = parseEngagementScale(
      mergeEngagementScaleBody(stored, withStreaks({ global: [{ days: 30, points: 7 }] }, { loyalty: [] })),
    );
    expect(merged?.streaks?.global).toEqual([{ days: 30, points: 7 }]);
    expect(merged?.streaks?.acts.reel).toEqual([]);
    expect(merged?.loyalty).toEqual([]);
  });

  it('n’a rien à garder d’un stocké illisible', () => {
    const body = legacyBody();
    expect(mergeEngagementScaleBody(null, body)).toBe(body);
  });
});
