import { beforeAll, describe, expect, test } from 'bun:test';

import { loadCirclesCatalog } from '@/lib/i18n-circles-catalog';

import { whereCaption, whereStampOf } from './where-stamp';

/**
 * L'HEURE DE LA DERNIÈRE POSITION CONNUE (#20242, iso `ProfileWhereStamp`) — « à l'instant » sous la minute, « il y a
 * N min » sous l'heure, puis l'heure (avec la date un autre jour). Une horloge en avance se lit « à l'instant » ; un
 * instant illisible ne se dit pas.
 */

beforeAll(async () => {
  await loadCirclesCatalog('fr');
  await loadCirclesCatalog('en');
});

const NOW = new Date(2026, 10, 21, 15, 30, 0).getTime();
const ago = (ms: number): string => new Date(NOW - ms).toISOString();

describe('whereStampOf', () => {
  test('sous la minute : à l’instant', () => {
    expect(whereStampOf(ago(59_000), NOW)).toEqual({ kind: 'just-now' });
  });

  test('une horloge en avance : à l’instant', () => {
    expect(whereStampOf(ago(-120_000), NOW)).toEqual({ kind: 'just-now' });
  });

  test('sous l’heure : il y a N min, arrondi vers le bas', () => {
    expect(whereStampOf(ago(60_000), NOW)).toEqual({ kind: 'minutes', minutes: 1 });
    expect(whereStampOf(ago(59 * 60_000 + 59_000), NOW)).toEqual({ kind: 'minutes', minutes: 59 });
  });

  test('au-delà : l’heure', () => {
    expect(whereStampOf(ago(3_600_000), NOW)).toEqual({ kind: 'at', at: NOW - 3_600_000 });
  });

  test('un instant illisible ne se dit pas', () => {
    expect(whereStampOf('n/a', NOW)).toBeNull();
  });
});

describe('whereCaption', () => {
  test('« Dernière position · à l’instant »', () => {
    expect(whereCaption('fr', whereStampOf(ago(5_000), NOW), NOW)).toBe('Dernière position · à l’instant');
  });

  test('« Dernière position · il y a 7 min »', () => {
    expect(whereCaption('fr', whereStampOf(ago(7 * 60_000), NOW), NOW)).toBe('Dernière position · il y a 7 min');
  });

  test('le même jour : l’heure seule', () => {
    expect(whereCaption('fr', whereStampOf(new Date(2026, 10, 21, 9, 5).toISOString(), NOW), NOW)).toBe('Dernière position · à 09:05');
  });

  test('un autre jour : la date avec l’heure', () => {
    const caption = whereCaption('fr', whereStampOf(new Date(2026, 10, 19, 9, 5).toISOString(), NOW), NOW);
    expect(caption.startsWith('Dernière position · à ')).toBe(true);
    expect(caption).toContain('19');
    expect(caption).toContain('09:05');
  });

  test('sans instant : le seul libellé', () => {
    expect(whereCaption('fr', null, NOW)).toBe('Dernière position');
  });

  test('en anglais', () => {
    expect(whereCaption('en', whereStampOf(ago(3 * 60_000), NOW), NOW)).toBe('Last known position · 3 min ago');
  });
});
