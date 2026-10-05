import { describe, expect, test } from 'bun:test';

import { resolveEngagementProgress } from '@meeshy/shared/utils/engagement-progress';
import { ONBOARDING_STEPS, ONBOARDING_STEP_KEYS } from '@meeshy/shared/utils/game/guide';

import { ENGAGEMENT_PROGRESS_FIXTURE } from '@/lib/api/engagement-fixture';
import type { EngagementWithGame } from '@/lib/api/engagement';
import { gameBlockFixture } from '@/lib/api/game-fixture';

import { awaitingGesture, openingStep, stepGesture } from './gesture';

/**
 * LE GESTE QUE RÉCLAME UNE ÉTAPE (#9379) — trois étapes de l'intégration
 * demandent un geste au joueur : le premier (envoyer un message), la mission
 * facile, et revenir le lendemain pour la Flamme. Elles n'avancent pas par une
 * simple carte : elles avancent quand le bloc `game` (ou la charge
 * d'engagement) montre que le geste a eu lieu — ou que le joueur passe.
 */

const empty = resolveEngagementProgress({ ...ENGAGEMENT_PROGRESS_FIXTURE, axes: [], milestones: [] });

const view = (patch: Parameters<typeof gameBlockFixture>[0] = {}, base: EngagementWithGame = resolveEngagementProgress(ENGAGEMENT_PROGRESS_FIXTURE)): EngagementWithGame => ({
  ...base,
  game: gameBlockFixture(patch),
});

const noPoints = (patch: Parameters<typeof gameBlockFixture>[0] = {}): EngagementWithGame =>
  view({ score: 0, debitablePoints: 0, glory: 0, balance: 0, mintedLifetime: 0, streak: 0, lastActiveDay: null, missions: [], ...patch }, { ...empty, isEmpty: true });

const missionsDone = (done: boolean) =>
  view({
    score: 800,
    missions: [
      { id: 'm-easy', difficulty: 'easy', templateKey: 'send-texts', signal: 'axis:content.text_message', prism: false, target: 5, progress: done ? 5 : 1, reward: 36, glory: 0, completedAt: done ? '2026-10-05T08:00:00.000Z' : null },
    ],
  });

describe('les étapes qui demandent un geste', () => {
  test('trois étapes : la bienvenue, les missions, la Flamme — les autres s’expliquent', () => {
    const withGesture = ONBOARDING_STEP_KEYS.filter((key) => stepGesture(key) !== null);
    expect(withGesture).toEqual(['welcome', 'missions', 'flame']);
  });

  test('chaque geste mène à l’endroit où il se fait', () => {
    expect(stepGesture('welcome')?.action).toBe('earn-first-points');
    expect(stepGesture('missions')?.action).toBe('see-missions');
    expect(stepGesture('flame')?.action).toBe('see-flame');
  });
});

describe('le premier geste', () => {
  test('aucun point, aucune activité : l’étape attend', () => {
    expect(awaitingGesture('welcome', noPoints())).toBe(true);
  });

  test('des points au bloc du jeu : le geste a eu lieu', () => {
    expect(awaitingGesture('welcome', noPoints({ score: 5 }))).toBe(false);
  });

  test('de l’activité comptée par la charge d’engagement suffit aussi', () => {
    expect(awaitingGesture('welcome', { ...noPoints(), isEmpty: false })).toBe(false);
  });
});

describe('la mission facile', () => {
  test('missions fermées (niveau 5 pas atteint) : rien à attendre, l’étape ne bloque pas', () => {
    expect(awaitingGesture('missions', noPoints({ score: 30 }))).toBe(false);
  });

  test('missions ouvertes, la facile pas faite : l’étape attend', () => {
    expect(awaitingGesture('missions', missionsDone(false))).toBe(true);
  });

  test('la facile faite : le geste a eu lieu', () => {
    expect(awaitingGesture('missions', missionsDone(true))).toBe(false);
  });
});

describe('revenir le lendemain pour la Flamme', () => {
  const today = '2026-10-05';
  test('une série d’un jour : l’étape attend le lendemain', () => {
    expect(awaitingGesture('flame', view({ streak: 1, lastActiveDay: today }))).toBe(true);
  });

  test('deux jours de série : il est revenu', () => {
    expect(awaitingGesture('flame', view({ streak: 2, lastActiveDay: today }))).toBe(false);
  });

  test('pas de Flamme du tout : rien à garder vivant, l’étape ne bloque pas', () => {
    expect(awaitingGesture('flame', noPoints())).toBe(false);
  });
});

describe('une étape sans geste n’attend jamais', () => {
  test('levels, first-points, mint, rank', () => {
    for (const key of ['first-points', 'levels', 'mint', 'rank'] as const) expect(awaitingGesture(key, noPoints())).toBe(false);
  });

  test('un ancien serveur (aucun bloc game) n’attend rien', () => {
    expect(awaitingGesture('welcome', empty)).toBe(false);
  });
});

describe('quelle étape à l’ouverture', () => {
  const step = (key: (typeof ONBOARDING_STEP_KEYS)[number]) => ONBOARDING_STEPS.find((s) => s.key === key)?.key;
  const seen = (...keys: (typeof ONBOARDING_STEP_KEYS)[number][]) => keys.map((key) => `onboarding.${key}`);

  test('rien de vu : la bienvenue', () => {
    expect(openingStep(noPoints(), [])?.key).toBe('welcome');
  });

  test('la bienvenue vue, le geste pas fait : on la RE-dit, on ne passe pas à la suite', () => {
    expect(openingStep(noPoints(), seen('welcome'))?.key).toBe(step('welcome'));
  });

  test('la bienvenue vue, le geste fait : la suite', () => {
    expect(openingStep(noPoints({ score: 12 }), seen('welcome'))?.key).toBe('first-points');
  });

  test('passer l’étape l’a laissée derrière : la suivante est la dernière vue, et on ne revient pas en arrière', () => {
    expect(openingStep(noPoints(), seen('welcome', 'first-points'))?.key).toBe('levels');
  });

  test('la mission facile attendue : on la re-dit tant qu’elle n’est pas faite', () => {
    expect(openingStep(missionsDone(false), seen('welcome', 'first-points', 'levels', 'missions'))?.key).toBe('missions');
    expect(openingStep(missionsDone(true), seen('welcome', 'first-points', 'levels', 'missions'))?.key).toBe('flame');
  });

  test('l’intégration finie : plus rien', () => {
    expect(openingStep(view(), seen(...ONBOARDING_STEP_KEYS))).toBeNull();
  });
});
