import { describe, expect, test } from 'bun:test';

import { dailyMissionClock, endOfGameDay } from './mission-clock';

/**
 * LE MINUTEUR D'UNE MISSION DU JOUR (#9539) — « chaque carte de mission porte un minuteur jusqu'à la fin de sa
 * plage ; passé la fin, la carte dit Terminée ou Manquée et l'action disparaît ». La plage d'une mission du jour
 * est son JOUR : elle se ferme à minuit local du lendemain (iOS : `GameMissionClock.endOfDay`).
 */
const local = (hour: number, minute = 0, day = 5): Date => new Date(2026, 9, day, hour, minute);

describe('la fin du jour', () => {
  test('minuit LOCAL du lendemain, y compris au passage de mois', () => {
    expect(endOfGameDay('2026-10-05')?.getTime()).toBe(new Date(2026, 9, 6).getTime());
    expect(endOfGameDay('2026-10-31')?.getTime()).toBe(new Date(2026, 10, 1).getTime());
  });

  test('une clé qui n’est pas un jour : pas de fin, donc pas de minuteur', () => {
    for (const key of ['', 'demain', '2026-10', '2026-13-40', '2026-02-30']) expect(endOfGameDay(key)).toBeNull();
    expect(dailyMissionClock({ dayKey: 'demain', completed: false, now: local(12) })).toBeNull();
  });
});

describe('avant et après la fin du jour', () => {
  test('en cours : le décompte court jusqu’à minuit, l’action est ouverte', () => {
    expect(dailyMissionClock({ dayKey: '2026-10-05', completed: false, now: local(22, 30) })).toEqual({ phase: 'active', remainingMs: 90 * 60_000, actionable: true });
  });

  test('faite avant la fin : plus de décompte, plus d’action', () => {
    expect(dailyMissionClock({ dayKey: '2026-10-05', completed: true, now: local(12) })).toEqual({ phase: 'done', remainingMs: null, actionable: false });
  });

  test('à minuit pile (fin exclue) : manquée si elle ne l’était pas, terminée si elle l’était — l’action a disparu', () => {
    expect(dailyMissionClock({ dayKey: '2026-10-05', completed: false, now: local(0, 0, 6) })).toEqual({ phase: 'missed', remainingMs: null, actionable: false });
    expect(dailyMissionClock({ dayKey: '2026-10-05', completed: true, now: local(0, 0, 6) })).toEqual({ phase: 'finished', remainingMs: null, actionable: false });
  });

  test('une horloge illisible ne laisse aucune action ouverte', () => {
    expect(dailyMissionClock({ dayKey: '2026-10-05', completed: false, now: new Date(Number.NaN) })?.actionable).toBe(false);
  });
});
