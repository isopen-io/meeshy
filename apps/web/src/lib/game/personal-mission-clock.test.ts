import { describe, expect, test } from 'bun:test';

import { personalMissionClock } from './personal-mission-clock';

const at = (hhmm: string): Date => new Date(`2026-10-06T${hhmm}:00.000Z`);
const window = { startsAt: '2026-10-06T18:00:00.000Z', endsAt: '2026-10-06T20:00:00.000Z' } as const;

/**
 * LE MINUTEUR DE LA MISSION PERSONNELLE (#9539) — la plage décide, PAS l'état servi au moment du chargement :
 * l'écran reste ouvert et la fin arrive. Passé `endsAt`, la mission n'est plus réalisable (loi partagée,
 * `isPersonalMissionOpen` : début inclus, fin exclue).
 */
describe('avant, pendant, après la plage', () => {
  test('avant : à venir, le décompte court jusqu’au DÉBUT, rien à faire encore', () => {
    expect(personalMissionClock({ ...window, completedAt: null, now: at('17:30') })).toEqual({ phase: 'upcoming', remainingMs: 30 * 60_000, actionable: false });
  });

  test('pendant : en cours, le décompte court jusqu’à la FIN, l’action est ouverte', () => {
    expect(personalMissionClock({ ...window, completedAt: null, now: at('18:00') })).toEqual({ phase: 'active', remainingMs: 120 * 60_000, actionable: true });
    expect(personalMissionClock({ ...window, completedAt: null, now: at('19:59') })).toEqual({ phase: 'active', remainingMs: 60_000, actionable: true });
  });

  test('à la minute de fin : manquée, l’action a disparu (fin exclue)', () => {
    expect(personalMissionClock({ ...window, completedAt: null, now: at('20:00') })).toEqual({ phase: 'missed', remainingMs: null, actionable: false });
  });

  test('faite dans la plage : terminée, sans décompte, sans action', () => {
    expect(personalMissionClock({ ...window, completedAt: '2026-10-06T18:40:00.000Z', now: at('19:00') })).toEqual({ phase: 'completed', remainingMs: null, actionable: false });
  });

  test('faite PUIS la fin passe : elle reste terminée, jamais manquée', () => {
    expect(personalMissionClock({ ...window, completedAt: '2026-10-06T18:40:00.000Z', now: at('23:00') }).phase).toBe('completed');
  });

  test('une date illisible ne fabrique pas de décompte : manquée, sans action', () => {
    expect(personalMissionClock({ startsAt: 'oups', endsAt: 'oups', completedAt: null, now: at('19:00') })).toEqual({ phase: 'missed', remainingMs: null, actionable: false });
  });
});
