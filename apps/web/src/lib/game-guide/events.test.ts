import { describe, expect, test } from 'bun:test';

import { resolveEngagementProgress } from '@meeshy/shared/utils/engagement-progress';

import type { EngagementWithGame } from '@/lib/api/engagement';
import { ENGAGEMENT_PROGRESS_FIXTURE } from '@/lib/api/engagement-fixture';
import { gameBlockFixture } from '@/lib/api/game-fixture';

import { standingGuideEvents, transitionGuideEvents } from './events';

/**
 * LES ÉVÉNEMENTS DU GUIDE (#9379) — la loi partagée choisit LE moment parmi
 * des événements ; quelqu'un doit les relever dans l'état du jeu. Deux sources :
 *
 *  - l'ÉTAT à l'ouverture de l'écran (« tu es au palier Lueur ») — chaque
 *    état ne se dit qu'UNE fois, tant que sa clé n'est pas vue ;
 *  - la TRANSITION observée pendant que l'écran est ouvert (« tu viens
 *    d'entrer dans Lueur ») — elle se dit chaque fois qu'elle arrive.
 *
 * Trois états se redisent à chaque ouverture, parce qu'ils sont des urgences
 * et non des découvertes : la Flamme en danger, la Flamme éteinte, le retour.
 */

const view = (patch: Parameters<typeof gameBlockFixture>[0] = {}, extra: Partial<EngagementWithGame> = {}): EngagementWithGame => ({
  ...resolveEngagementProgress(ENGAGEMENT_PROGRESS_FIXTURE),
  game: gameBlockFixture(patch),
  ...extra,
});
const gameOf = (v: EngagementWithGame) => {
  if (v.game === undefined) throw new Error('bloc game attendu');
  return v.game;
};
const kinds = (events: readonly { kind: string }[]): string[] => events.map((e) => e.kind);
const none = new Set<string>();

describe('l’état, à l’ouverture', () => {
  test('un compte neuf n’a rien à se faire dire', () => {
    const fresh = gameBlockFixture({ score: 0, debitablePoints: 0, glory: 0, balance: 0, mintedLifetime: 0, streak: 0, lastActiveDay: null, freezes: 0, missions: [] });
    expect(standingGuideEvents(fresh, none)).toEqual([]);
  });

  test('premier niveau : le niveau 2 et ce qu’il manque', () => {
    const game = gameBlockFixture({ score: 45, debitablePoints: 45, glory: 0, balance: 0, mintedLifetime: 0, missions: [] });
    expect(standingGuideEvents(game, none)).toContainEqual({ kind: 'first-level', level: 2, pointsToNext: game.level.pointsToNext });
  });

  test('un palier : le nom et le niveau du suivant', () => {
    const game = gameBlockFixture({ score: 10 * 11 * 11, debitablePoints: 0, mintedLifetime: 0, glory: 0, balance: 0 });
    expect(standingGuideEvents(game, none)).toContainEqual({ kind: 'new-tier', tier: 'lueur', nextTierLevel: 20 });
  });

  test('le dernier palier n’a pas de suivant', () => {
    const game = gameBlockFixture({ score: 10 * 95 * 95 });
    expect(standingGuideEvents(game, none)).toContainEqual({ kind: 'new-tier', tier: 'galaxie', nextTierLevel: null });
  });

  test('les missions débloquées', () => {
    expect(kinds(standingGuideEvents(gameBlockFixture(), none))).toContain('missions-unlocked');
    expect(kinds(standingGuideEvents(gameBlockFixture({ score: 100, missions: [] }), none))).not.toContain('missions-unlocked');
  });

  test('première frappe possible : seulement avant la toute première', () => {
    const first = gameBlockFixture({ mintedLifetime: 0 });
    const event = standingGuideEvents(first, none).find((e) => e.kind === 'first-mint-possible');
    expect(event).toEqual({ kind: 'first-mint-possible', price: first.mint.price, levelsLost: first.mint.levelsLost, gloryGain: first.mint.gloryGained });
    expect(kinds(standingGuideEvents(gameBlockFixture({ mintedLifetime: 2 }), none))).not.toContain('first-mint-possible');
  });

  test('un rang au-delà du premier', () => {
    const game = gameBlockFixture({ glory: 1700 });
    expect(standingGuideEvents(game, none)).toContainEqual({
      kind: 'new-rank',
      rank: 'voix',
      division: game.glory.division,
      glory: 1700,
      gloryMissing: game.glory.gloryMissing,
    });
  });

  test('le premier rang ne se célèbre pas', () => {
    expect(kinds(standingGuideEvents(gameBlockFixture({ glory: 100 }), none))).not.toContain('new-rank');
  });

  test('un palier du trésor', () => {
    const game = gameBlockFixture({ balance: 12 });
    expect(standingGuideEvents(game, none)).toContainEqual({ kind: 'treasury-tier', tier: 'escarcelle', nextTierMissing: game.treasury.next?.missing ?? null });
  });

  test('le niveau 100', () => {
    expect(standingGuideEvents(gameBlockFixture({ score: 10 * 100 * 100 }), none)).toContainEqual({ kind: 'level-100', canPrestige: true });
  });

  test('une clé déjà vue ne revient pas : la découverte se dit une fois', () => {
    const game = gameBlockFixture({ score: 10 * 11 * 11, mintedLifetime: 0 });
    const seen = new Set(['first-level', 'new-tier', 'missions-unlocked', 'first-mint-possible', 'treasury-tier', 'new-rank']);
    expect(standingGuideEvents(game, seen)).toEqual([]);
  });
});

describe('les urgences se redisent à chaque ouverture', () => {
  const seen = new Set(['flame-at-risk', 'flame-out', 'return-after-absence']);

  test('Flamme en danger : les jours de série à sauver', () => {
    const game = gameBlockFixture({ lastActiveDay: '2026-10-04' });
    expect(standingGuideEvents(game, seen)).toContainEqual({ kind: 'flame-at-risk', days: 6 });
  });

  test('Flamme éteinte : le prix du rallumage et s’il est possible', () => {
    const game = gameBlockFixture({ streak: 9, lastActiveDay: '2026-10-03', broken: { streak: 9, lastActiveDay: '2026-10-03' }, freezes: 0, balance: 5 });
    expect(standingGuideEvents(game, seen)).toContainEqual({ kind: 'flame-out', lostDays: 0, relightPrice: 3, canRelight: true });
  });

  test('retour après sept jours d’absence — pas avant', () => {
    expect(standingGuideEvents(gameBlockFixture(), seen, { daysAway: 9 })).toContainEqual({ kind: 'return-after-absence', daysAway: 9 });
    expect(kinds(standingGuideEvents(gameBlockFixture(), seen, { daysAway: 6 }))).not.toContain('return-after-absence');
    expect(kinds(standingGuideEvents(gameBlockFixture(), seen, { daysAway: null }))).not.toContain('return-after-absence');
  });
});

describe('les transitions, pendant que l’écran est ouvert', () => {
  test('rien n’a changé : rien à dire', () => {
    const v = view();
    expect(transitionGuideEvents(v, v)).toEqual([]);
  });

  test('un palier franchi', () => {
    const events = transitionGuideEvents(view({ score: 10 * 9 * 9 + 5 }), view({ score: 10 * 10 * 10 }));
    expect(kinds(events)).toContain('new-tier');
  });

  test('un niveau qui BAISSE ne fête rien', () => {
    expect(kinds(transitionGuideEvents(view({ score: 10 * 10 * 10 }), view({ score: 10 * 9 * 9 })))).not.toContain('new-tier');
  });

  test('un rang gagné, une division gagnée', () => {
    expect(kinds(transitionGuideEvents(view({ glory: 820 }), view({ glory: 840 })))).toContain('new-rank');
    expect(kinds(transitionGuideEvents(view({ glory: 100 }), view({ glory: 140 })))).not.toContain('new-rank');
  });

  test('un palier du trésor', () => {
    expect(kinds(transitionGuideEvents(view({ balance: 9 }), view({ balance: 10 })))).toContain('treasury-tier');
  });

  test('la première frappe : le niveau avant, après, et jusqu’où court le Vent arrière', () => {
    const before = view({ mintedLifetime: 0 });
    const after = view({ mintedLifetime: 1, score: gameOf(before).level.score - gameOf(before).mint.price, levelRecord: gameOf(before).level.level });
    const first = transitionGuideEvents(before, after).find((e) => e.kind === 'first-mint');
    expect(first).toEqual({
      kind: 'first-mint',
      levelBefore: gameOf(before).level.level,
      levelAfter: gameOf(after).level.level,
      tailwindUntilLevel: gameOf(after).level.record,
    });
  });

  test('le prix monte à la onzième', () => {
    const before = view({ mintedLifetime: 9, score: 3000, debitablePoints: 3000 });
    const after = view({ mintedLifetime: 10, score: 1700, debitablePoints: 1700 });
    expect(transitionGuideEvents(before, after)).toContainEqual({ kind: 'price-rises', nextPrice: gameOf(after).mint.price });
  });

  test('un badge qui s’éteint après une frappe, avec la distance annoncée AVANT le geste', () => {
    const before = view({ mintedLifetime: 3 }, { mintBadgeLoss: 2, mintBadgeRegain: 11 });
    const after = view({ mintedLifetime: 4, score: 23, debitablePoints: 23 });
    expect(transitionGuideEvents(before, after)).toContainEqual({ kind: 'badge-extinguished', missingActions: 11 });
  });

  test('aucun badge ne tombe : pas de moment', () => {
    const before = view({ mintedLifetime: 3 }, { mintBadgeLoss: 0, mintBadgeRegain: 0 });
    const after = view({ mintedLifetime: 4, score: 23, debitablePoints: 23 });
    expect(kinds(transitionGuideEvents(before, after))).not.toContain('badge-extinguished');
  });

  test('la Flamme qui s’éteint', () => {
    const before = view();
    const after = view({ streak: 9, lastActiveDay: '2026-10-02', freezes: 0, broken: { streak: 9, lastActiveDay: '2026-10-02' } });
    expect(kinds(transitionGuideEvents(before, after))).toContain('flame-out');
  });

  test('les missions qui s’ouvrent, le niveau 100', () => {
    expect(kinds(transitionGuideEvents(view({ score: 100, missions: [] }), view({ score: 10 * 5 * 5, missions: [] })))).toContain('missions-unlocked');
    expect(kinds(transitionGuideEvents(view({ score: 10 * 99 * 99 }), view({ score: 10 * 100 * 100 })))).toContain('level-100');
  });

  test('un ancien serveur (aucun bloc) : rien', () => {
    const legacy = resolveEngagementProgress(ENGAGEMENT_PROGRESS_FIXTURE);
    expect(transitionGuideEvents(legacy, view())).toEqual([]);
    expect(transitionGuideEvents(view(), legacy)).toEqual([]);
  });
});
