/**
 * LA LOI DE LA MASCOTTE (#8907) — quel moment elle vit, quelle humeur elle
 * porte, ce qu'elle dit. Le personnage est un dessin (#8908) ; ce fichier tient
 * le COMPORTEMENT, que le web et iOS rejouent à l'identique.
 */

import { describe, it, expect } from 'vitest';
import type { EngagementProgressPayload } from '../types/engagement.js';
import { resolveEngagementProgress } from '../utils/engagement-progress.js';
import { mascotEvent, mascotMoment } from '../utils/mascot.js';

const EMPTY: EngagementProgressPayload = {
  counters: [],
  milestones: [],
  streak: { currentStreakDays: 0, longestStreakDays: 0 },
  level: { engagementScore: 0 },
};

const meeshBlock = (extra: Partial<NonNullable<EngagementProgressPayload['meesh']>> = {}) => ({
  balance: 1,
  mintedLifetime: 1,
  debitablePoints: 400,
  floorPoints: 0,
  missingPoints: 821,
  mintCost: 1221,
  firstMintedAt: null,
  lastMintedAt: null,
  ...extra,
});

const progressOf = (overrides: Partial<EngagementProgressPayload>) =>
  resolveEngagementProgress({
    ...EMPTY,
    counters: [{ axisKey: 'content.text_message', count: 12, points: 12 }],
    level: { engagementScore: 60 },
    ...overrides,
  });

const achievement = (milestoneKey: string) => ({
  milestoneType: 'achievement' as const,
  milestoneKey,
  reachedAt: '2026-09-30T10:00:00.000Z',
});

describe('mascotEvent — ce qui vient de se passer entre deux lectures', () => {
  it("ne célèbre rien à la première lecture : un état n'est pas un événement", () => {
    expect(mascotEvent(null, progressOf({}))).toBeNull();
  });

  it('ne célèbre rien quand rien ne change', () => {
    expect(mascotEvent(progressOf({}), progressOf({}))).toBeNull();
  });

  it('voit une Meesh frappée quand le compteur à vie monte', () => {
    const before = progressOf({ meesh: meeshBlock({ balance: 1, mintedLifetime: 1 }) });
    const after = progressOf({ meesh: meeshBlock({ balance: 2, mintedLifetime: 2 }) });
    expect(mascotEvent(before, after)).toEqual({ kind: 'meesh-minted', balance: 2 });
  });

  it("ne prend pas un DON reçu pour une frappe : seul le compteur à vie compte", () => {
    const before = progressOf({ meesh: meeshBlock({ balance: 1, mintedLifetime: 1 }) });
    const after = progressOf({ meesh: meeshBlock({ balance: 2, mintedLifetime: 1 }) });
    expect(mascotEvent(before, after)).toBeNull();
  });

  it('voit un niveau franchi', () => {
    const before = progressOf({ level: { engagementScore: 40 } });
    const after = progressOf({ level: { engagementScore: 160 } });
    expect(mascotEvent(before, after)).toEqual({ kind: 'level-up', level: after.level.level });
  });

  it('voit un succès débloqué', () => {
    const after = progressOf({ milestones: [achievement('achievement.first_voice')] });
    expect(mascotEvent(progressOf({}), after)).toEqual({ kind: 'achievement', key: 'achievement.first_voice' });
  });

  it("préfère la frappe au niveau quand les deux tombent ensemble : c'est le geste qu'on vient de faire", () => {
    const before = progressOf({ level: { engagementScore: 40 }, meesh: meeshBlock({ mintedLifetime: 1 }) });
    const after = progressOf({ level: { engagementScore: 160 }, meesh: meeshBlock({ mintedLifetime: 2, balance: 2 }) });
    expect(mascotEvent(before, after)?.kind).toBe('meesh-minted');
  });
});

describe('mascotMoment — ce que la mascotte vit maintenant', () => {
  it("célèbre l'événement avant tout état", () => {
    const progress = progressOf({ meesh: meeshBlock({ missingPoints: 0, debitablePoints: 1221 }) });
    expect(mascotMoment(progress, { kind: 'meesh-minted', balance: 3 })).toEqual({
      mood: 'minting',
      line: { kind: 'meesh-minted', balance: 3 },
    });
    expect(mascotMoment(progress, { kind: 'level-up', level: 3 }).mood).toBe('cheer');
    expect(mascotMoment(progress, { kind: 'achievement', key: 'achievement.editor' }).mood).toBe('cheer');
  });

  it('invite à frapper quand les points le permettent', () => {
    const progress = progressOf({ meesh: meeshBlock({ missingPoints: 0, debitablePoints: 1221 }) });
    expect(mascotMoment(progress, null)).toEqual({ mood: 'ready', line: { kind: 'can-mint', mintCost: 1221 } });
  });

  it("guide le premier pas d'un compte sans activité", () => {
    expect(mascotMoment(resolveEngagementProgress(EMPTY), null)).toEqual({ mood: 'guide', line: { kind: 'first-step' } });
  });

  it('salue une série qui court depuis au moins deux jours', () => {
    const progress = progressOf({ streak: { currentStreakDays: 4, longestStreakDays: 6 } });
    expect(mascotMoment(progress, null)).toEqual({ mood: 'streak', line: { kind: 'streak', days: 4 } });
  });

  it('compte les points qui manquent avant la prochaine Meesh', () => {
    const progress = progressOf({ meesh: meeshBlock({ missingPoints: 821 }) });
    expect(mascotMoment(progress, null)).toEqual({ mood: 'counting', line: { kind: 'meesh-missing', missing: 821 } });
  });

  it('compte vers le niveau suivant quand la passerelle ne sert pas les Meeshes', () => {
    const progress = progressOf({ level: { engagementScore: 60 } });
    expect(mascotMoment(progress, null)).toEqual({
      mood: 'counting',
      line: { kind: 'level-missing', missing: (progress.level.nextThreshold ?? 0) - 60, nextLevel: progress.level.level + 1 },
    });
  });

  it('encourage au dernier niveau, où il ne reste rien à compter', () => {
    const progress = progressOf({ level: { engagementScore: 100_000 } });
    expect(mascotMoment(progress, null)).toEqual({ mood: 'cheer', line: { kind: 'top-level' } });
  });
});
