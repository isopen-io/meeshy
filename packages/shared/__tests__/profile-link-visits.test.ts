/**
 * Les visites de mon lien de profil (#19206, chantier #18857).
 *
 * L'agrégat est une ligne par jour UTC et par propriétaire ; ce que le billet « Mon lien »
 * affiche (« 1 719 visites ce mois · 57 aujourd'hui ») et la série de trente jours se
 * déduisent de ces lignes, sans rien d'autre.
 */
import { describe, it, expect } from 'vitest';
import {
  PROFILE_LINK_VISIT_RETENTION_DAYS,
  PROFILE_LINK_VISIT_SERIES_DAYS,
  profileLinkVisitStats,
} from '../utils/profile-link-visits';

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const row = (iso: string, visits: number) => ({ day: day(iso), visits });

describe('profileLinkVisitStats — ce que le billet « Mon lien » affiche', () => {
  const now = new Date('2026-11-17T15:42:00.000Z');

  it('rend les visites du jour UTC, celles du mois calendaire UTC et une série de trente jours', () => {
    const stats = profileLinkVisitStats(
      [row('2026-11-17', 57), row('2026-11-16', 40), row('2026-11-01', 12), row('2026-10-31', 99), row('2026-10-19', 7)],
      now,
    );

    expect(stats.today).toBe(57);
    expect(stats.month).toBe(57 + 40 + 12);
    expect(stats.series).toHaveLength(PROFILE_LINK_VISIT_SERIES_DAYS);
    expect(stats.series[0]).toEqual({ day: '2026-10-19', visits: 7 });
    expect(stats.series[PROFILE_LINK_VISIT_SERIES_DAYS - 1]).toEqual({ day: '2026-11-17', visits: 57 });
    expect(stats.series.find((point) => point.day === '2026-10-31')).toEqual({ day: '2026-10-31', visits: 99 });
  });

  it('remplit de zéros les jours sans visite et ignore ce qui sort de la fenêtre', () => {
    const stats = profileLinkVisitStats([row('2026-10-18', 500), row('2026-11-18', 3)], now);

    expect(stats.today).toBe(0);
    expect(stats.month).toBe(0);
    expect(stats.series.every((point) => point.visits === 0)).toBe(true);
  });

  it('un compte sans aucune visite rend des zéros, jamais une absence', () => {
    expect(profileLinkVisitStats([], now)).toEqual({
      today: 0,
      month: 0,
      series: expect.arrayContaining([{ day: '2026-11-17', visits: 0 }]),
    });
  });

  it('la conservation couvre le mois calendaire le plus long et la série de trente jours', () => {
    expect(PROFILE_LINK_VISIT_RETENTION_DAYS).toBeGreaterThanOrEqual(Math.max(31, PROFILE_LINK_VISIT_SERIES_DAYS));
  });
});
