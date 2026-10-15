import { describe, expect, test } from 'bun:test';

import type { SeasonSchedule } from '@meeshy/shared/utils/game/season-schedule';

import { loadLeagueWeekArchive, loadSeasonArchive } from './game-archive';
import type { HttpTransport } from './http';

/**
 * LE BANC LIT LE CALENDRIER SERVI (#10232) — le chemin local de `game-archive.ts` (source `fixtures`) ne calcule plus
 * une saison avec la seule constante : il suit le calendrier (saison décalée, saison en pause).
 */
const transport = (async () => ({ ok: false, status: 0, error: 'jamais appelé' })) as unknown as HttpTransport;

const SHIFTED: SeasonSchedule = {
  revision: 3,
  seasons: [
    { number: 1, startDay: '2027-01-04', status: 'scheduled', themeKey: 'language:ja', stepPoints: 120, copy: null },
    { number: 2, startDay: '2027-04-26', status: 'paused', themeKey: 'language:hi', stepPoints: 100, copy: null },
  ],
};

describe('loadSeasonArchive (banc) selon le calendrier servi', () => {
  test('une saison décalée ouvre à son lundi et porte son thème', async () => {
    const result = await loadSeasonArchive({ source: 'fixtures', transport, number: 1, schedule: SHIFTED });
    expect(result.ok && [result.data.startDay, result.data.endDay, result.data.themeKey]).toEqual(['2027-01-04', '2027-02-28', 'language:ja']);
  });

  test('une saison en pause n’a pas de dates : un refus nommé, pas des dates inventées', async () => {
    const result = await loadSeasonArchive({ source: 'fixtures', transport, number: 2, schedule: SHIFTED });
    expect(result).toMatchObject({ ok: false, status: 404, code: 'SEASON_PAUSED' });
  });

  test('un numéro invalide reste inconnu', async () => {
    const result = await loadSeasonArchive({ source: 'fixtures', transport, number: 0, schedule: SHIFTED });
    expect(result).toMatchObject({ ok: false, status: 404, code: 'SEASON_NOT_FOUND' });
  });

  test('sans calendrier passé : la dérivation de la loi (saison 1 au 2026-12-21)', async () => {
    const result = await loadSeasonArchive({ source: 'fixtures', transport, number: 1 });
    expect(result.ok && result.data.startDay).toBe('2026-12-21');
  });
});

describe('loadLeagueWeekArchive (banc) : la saison d’une semaine suit le calendrier', () => {
  test('une semaine dans la saison décalée en porte le numéro, une semaine hors saison aucun', async () => {
    const inside = await loadLeagueWeekArchive({ source: 'fixtures', transport, weekKey: '2027-01-11', schedule: SHIFTED });
    const before = await loadLeagueWeekArchive({ source: 'fixtures', transport, weekKey: '2026-12-21', schedule: SHIFTED });
    expect(inside.ok && inside.data.season).toBe(1);
    expect(before.ok && before.data.season).toBeNull();
  });
});
