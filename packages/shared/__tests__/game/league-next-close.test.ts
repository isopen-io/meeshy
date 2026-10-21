import { describe, expect, it } from 'vitest';
import { leagueWeekOfMoment, nextLeagueWeekClose } from '../../utils/game/league.js';
import { seasonTenseAt } from '../../utils/game/season.js';

/**
 * LA PROCHAINE BASCULE (#10225) — une page Saison restée ouverte se repeint au dimanche 20 h : l'état d'une saison
 * ne change qu'à une fermeture de semaine, la prochaine est donc le seul instant où repeindre.
 */
describe('la prochaine fermeture de semaine (#10225)', () => {
  it('est le dimanche 20 h de la semaine du moment, toujours STRICTEMENT après lui', () => {
    expect(nextLeagueWeekClose({ dayKey: '2026-12-16', minuteOfDay: 600 })).toEqual({ dayKey: '2026-12-20', minuteOfDay: 1200 });
    expect(nextLeagueWeekClose({ dayKey: '2026-12-20', minuteOfDay: 1199 })).toEqual({ dayKey: '2026-12-20', minuteOfDay: 1200 });
    expect(nextLeagueWeekClose({ dayKey: '2026-12-20', minuteOfDay: 1200 })).toEqual({ dayKey: '2026-12-27', minuteOfDay: 1200 });
    expect(nextLeagueWeekClose({ dayKey: '2026-12-21', minuteOfDay: 0 })).toEqual({ dayKey: '2026-12-27', minuteOfDay: 1200 });
  });

  it('à cet instant, et pas avant, l\'état d\'une saison bascule', () => {
    const season1 = { startDay: '2026-12-21', endDay: '2027-02-14' };
    const before = { dayKey: '2026-12-20', minuteOfDay: 1199 };
    const flip = nextLeagueWeekClose(before);
    expect(seasonTenseAt(season1, before)).toBe('upcoming');
    expect(seasonTenseAt(season1, flip)).toBe('current');
    expect(leagueWeekOfMoment(flip)).not.toBe(leagueWeekOfMoment(before));
  });
});
