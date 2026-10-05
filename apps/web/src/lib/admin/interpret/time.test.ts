import { beforeAll, describe, expect, test } from 'bun:test';

import { loadAdminInterfaceCatalog } from '@/lib/i18n-admin-catalog';

import { adminDate, adminDayLabel, adminMomentOf, dayLabelsEndingToday, formatDuration, hourLabel, weekdayName } from './time';

const NOW = new Date('2026-09-30T14:03:00Z');
const UTC = { timeZone: 'UTC' } as const;

const plain = (value: string): string => value.replace(/\s/g, ' ');

beforeAll(async () => {
  await loadAdminInterfaceCatalog('fr');
});

describe('adminMomentOf — un instant dit en absolu ET en relatif', () => {
  test('le passé récent se dit « il y a … », l’absolu porte la date et l’heure', () => {
    const moment = adminMomentOf('2026-09-30T14:00:00Z', NOW, 'fr', UTC);
    expect(moment).toEqual({
      iso: '2026-09-30T14:00:00Z',
      absolute: '30 sept. 2026, 14:00',
      relative: 'il y a 3 minutes',
      date: '30 sept. 2026',
    });
  });

  test('hier, demain et le futur lointain se disent avec le bon sens', () => {
    expect(adminMomentOf('2026-09-29T14:03:00Z', NOW, 'fr', UTC)?.relative).toBe('hier');
    expect(adminMomentOf('2026-10-01T14:03:00Z', NOW, 'fr', UTC)?.relative).toBe('demain');
    expect(adminMomentOf('2026-10-03T14:03:00Z', NOW, 'fr', UTC)?.relative).toBe('dans 3 jours');
  });

  test('plus de trois mois : en mois, puis en années — jamais une date absolue en guise de relatif', () => {
    expect(adminMomentOf('2026-05-30T14:03:00Z', NOW, 'fr', UTC)?.relative).toBe('il y a 4 mois');
    expect(adminMomentOf('2024-09-30T14:03:00Z', NOW, 'fr', UTC)?.relative).toBe('il y a 2 ans');
  });

  test('à la seconde près : « maintenant »', () => {
    expect(adminMomentOf('2026-09-30T14:02:50Z', NOW, 'fr', UTC)?.relative).toBe('maintenant');
  });

  test('suit la langue d’interface', () => {
    expect(adminMomentOf('2026-09-30T14:00:00Z', NOW, 'en', UTC)?.relative).toBe('3 minutes ago');
    expect(plain(adminMomentOf('2026-09-30T14:00:00Z', NOW, 'en', UTC)?.absolute ?? '')).toBe('Sep 30, 2026, 2:00 PM');
  });

  test('une absence ou un horodatage illisible se dit par null, jamais « Invalid Date »', () => {
    expect(adminMomentOf(null, NOW, 'fr')).toBeNull();
    expect(adminMomentOf(undefined, NOW, 'fr')).toBeNull();
    expect(adminMomentOf('', NOW, 'fr')).toBeNull();
    expect(adminMomentOf('pas une date', NOW, 'fr')).toBeNull();
  });
});

describe('adminDate et les libellés de jours', () => {
  test('adminDate : la date seule, « — » quand elle manque', () => {
    expect(adminDate('2026-09-30T23:59:00Z', 'fr', UTC)).toBe('30 sept. 2026');
    expect(adminDate(null, 'fr')).toBe('—');
    expect(adminDate('x', 'fr')).toBe('—');
  });

  test('adminDayLabel lit le jour en UTC : le fuseau du lecteur ne le décale pas', () => {
    expect(adminDayLabel('2026-09-29', 'fr')).toBe('mar. 29 sept.');
    expect(adminDayLabel('2026-13-99', 'fr')).toBe('—');
    expect(adminDayLabel('hier', 'fr')).toBe('—');
  });

  test('dayLabelsEndingToday : les N derniers jours, le plus ancien d’abord, le dernier est aujourd’hui', () => {
    expect(dayLabelsEndingToday(3, NOW, 'fr')).toEqual(['lun. 28 sept.', 'mar. 29 sept.', 'mer. 30 sept.']);
    expect(dayLabelsEndingToday(0, NOW, 'fr')).toEqual([]);
  });

  test('hourLabel et weekdayName : 0 = dimanche, les heures hors bornes se disent « — »', () => {
    expect(hourLabel(14, 'fr')).toBe('14 h');
    expect(hourLabel(24, 'fr')).toBe('—');
    expect(weekdayName(0, 'fr')).toBe('dimanche');
    expect(weekdayName(2, 'fr')).toBe('mardi');
    expect(weekdayName(7, 'fr')).toBe('—');
  });
});

describe('formatDuration — la durée qui se lit d’un coup d’œil', () => {
  test('millisecondes et secondes', () => {
    expect(plain(formatDuration(850, 'ms', 'fr'))).toBe('850 ms');
    expect(plain(formatDuration(1250, 'ms', 'fr'))).toBe('1,3 s');
    expect(plain(formatDuration(12, 's', 'fr'))).toBe('12 s');
  });

  test('minutes, heures, jours — l’unité secondaire est omise quand elle vaut zéro', () => {
    expect(plain(formatDuration(185, 's', 'fr'))).toBe('3 min 05 s');
    expect(plain(formatDuration(180, 's', 'fr'))).toBe('3 min');
    expect(plain(formatDuration(2 * 3600 + 5 * 60, 's', 'fr'))).toBe('2 h 05 min');
    expect(plain(formatDuration(3 * 86_400 + 4 * 3600, 's', 'fr'))).toBe('3 j 4 h');
    expect(plain(formatDuration(86_400, 's', 'fr'))).toBe('1 j');
  });

  test('une unité de départ en millisecondes atteint les mêmes paliers', () => {
    expect(plain(formatDuration(185_000, 'ms', 'fr'))).toBe('3 min 05 s');
  });

  test('une absence, un négatif ou un non-nombre se disent « — »', () => {
    expect(plain(formatDuration(null, 's', 'fr'))).toBe('—');
    expect(plain(formatDuration(-1, 's', 'fr'))).toBe('—');
    expect(plain(formatDuration(Number.NaN, 'ms', 'fr'))).toBe('—');
  });
});
