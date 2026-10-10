/**
 * LES POINTS DE LA SEMAINE (#9384, #9385) — un incrément atomique par gain, dans
 * la semaine LOCALE du compte ; la fermeture du dimanche 20 h bascule sur la
 * semaine suivante.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { GameWeekPointsRecorder, totalOfDays, weekKeyOfInstant } from '../GameWeekPoints';
import { instantOfLocal } from '../gameClock';
import { fakeGameDb, seedUser, USER, OTHER } from './fakeGameDb';

describe('weekKeyOfInstant', () => {
  it('rend le lundi local de la semaine', () => {
    expect(weekKeyOfInstant(new Date('2026-10-14T12:00:00Z'), 'UTC')).toBe('2026-10-12');
  });

  it('passé dimanche 20 h locale, le gain compte pour la semaine SUIVANTE', () => {
    expect(weekKeyOfInstant(new Date('2026-10-18T19:59:00Z'), 'UTC')).toBe('2026-10-12');
    expect(weekKeyOfInstant(new Date('2026-10-18T20:00:00Z'), 'UTC')).toBe('2026-10-19');
  });

  it('suit le fuseau du compte : 20 h à Paris (UTC+2 en octobre) = 18 h UTC', () => {
    expect(weekKeyOfInstant(new Date('2026-10-18T17:59:00Z'), 'Europe/Paris')).toBe('2026-10-12');
    expect(weekKeyOfInstant(new Date('2026-10-18T18:00:00Z'), 'Europe/Paris')).toBe('2026-10-19');
  });
});

describe('instantOfLocal', () => {
  it('convertit une heure murale en instant UTC, heure d’été comprise', () => {
    expect(instantOfLocal({ dayKey: '2026-10-18', minuteOfDay: 1200, timezone: 'Europe/Paris' }).toISOString()).toBe('2026-10-18T18:00:00.000Z');
    expect(instantOfLocal({ dayKey: '2026-12-13', minuteOfDay: 1200, timezone: 'Europe/Paris' }).toISOString()).toBe('2026-12-13T19:00:00.000Z');
    expect(instantOfLocal({ dayKey: '2026-10-18', minuteOfDay: 1200, timezone: 'America/New_York' }).toISOString()).toBe('2026-10-19T00:00:00.000Z');
  });

  it('un fuseau inconnu retombe sur UTC', () => {
    expect(instantOfLocal({ dayKey: '2026-10-18', minuteOfDay: 1200, timezone: 'Nope/Zone' }).toISOString()).toBe('2026-10-18T20:00:00.000Z');
  });
});

describe('GameWeekPointsRecorder.record', () => {
  it('deux premiers gains concurrents du même jour : l’upsert perdant (P2002 de MongoDB) se rejoue, aucun point ne se perd', async () => {
    const db = fakeGameDb();
    seedUser(db, { timezone: 'UTC' });
    const upsert = db.gameWeekPoints.upsert.bind(db.gameWeekPoints);
    let raced = false;
    db.gameWeekPoints.upsert = (async (args: Parameters<typeof upsert>[0]) => {
      if (!raced) {
        raced = true;
        db.gameWeekPoints.rows.push({ id: 'racer', userId: USER, weekKey: '2026-10-12', dayKey: '2026-10-14', points: 7 });
        throw Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
      }
      return upsert(args);
    }) as typeof upsert;

    await new GameWeekPointsRecorder(db.prisma).record(USER, 5, new Date('2026-10-14T12:00:00Z'));

    expect(db.gameWeekPoints.rows.map((r) => r.points)).toEqual([12]);
  });

  it('additionne les gains d’un jour dans UNE ligne, un jour nouveau en ouvre une autre', async () => {
    const db = fakeGameDb();
    seedUser(db);
    const recorder = new GameWeekPointsRecorder(db.prisma);

    await recorder.record(USER, 10, new Date('2026-10-13T10:00:00Z'));
    await recorder.record(USER, 5, new Date('2026-10-13T18:00:00Z'));
    await recorder.record(USER, 7, new Date('2026-10-15T10:00:00Z'));

    expect(db.gameWeekPoints.rows.map((r) => [r.weekKey, r.dayKey, r.points])).toEqual([
      ['2026-10-12', '2026-10-13', 15],
      ['2026-10-12', '2026-10-15', 7],
    ]);
    expect(await recorder.weekPoints('2026-10-12', [USER])).toEqual({ [USER]: 22 });
  });

  it('le dimanche passé 20 h tombe dans la semaine suivante : deux lignes ce jour-là', async () => {
    const db = fakeGameDb();
    seedUser(db);
    const recorder = new GameWeekPointsRecorder(db.prisma);

    await recorder.record(USER, 10, new Date('2026-10-18T19:00:00Z'));
    await recorder.record(USER, 4, new Date('2026-10-18T21:00:00Z'));

    expect(db.gameWeekPoints.rows.map((r) => [r.weekKey, r.dayKey, r.points])).toEqual([
      ['2026-10-12', '2026-10-18', 10],
      ['2026-10-19', '2026-10-18', 4],
    ]);
  });

  it('une semaine nouvelle ouvre un document nouveau', async () => {
    const db = fakeGameDb();
    seedUser(db);
    const recorder = new GameWeekPointsRecorder(db.prisma);

    await recorder.record(USER, 10, new Date('2026-10-17T10:00:00Z'));
    await recorder.record(USER, 7, new Date('2026-10-19T10:00:00Z'));

    expect(await recorder.weekPoints('2026-10-12', [USER])).toEqual({ [USER]: 10 });
    expect(await recorder.weekPoints('2026-10-19', [USER])).toEqual({ [USER]: 7 });
  });

  it('un gain nul, négatif ou fractionnaire n’écrit rien', async () => {
    const db = fakeGameDb();
    seedUser(db);
    const recorder = new GameWeekPointsRecorder(db.prisma);

    await recorder.record(USER, 0);
    await recorder.record(USER, -4);
    await recorder.record(USER, 1.5);

    expect(db.gameWeekPoints.rows).toHaveLength(0);
  });

  it('weekPoints rend 0 pour un compte sans gain, jamais undefined', async () => {
    const db = fakeGameDb();
    seedUser(db);
    seedUser(db, {}, OTHER);
    const recorder = new GameWeekPointsRecorder(db.prisma);
    await recorder.record(USER, 12, new Date('2026-10-13T10:00:00Z'));

    expect(await recorder.weekPoints('2026-10-12', [USER, OTHER])).toEqual({ [USER]: 12 });
  });
});

describe('totalOfDays — la granularité du jour', () => {
  const days = { '2026-10-12': 10, '2026-10-13': 20, '2026-10-14': 5 };

  it('sans coupe, le total vif', () => {
    expect(totalOfDays(days)).toBe(35);
  });

  it('avec `before`, la fin de la veille : le jour courant n’y est pas', () => {
    expect(totalOfDays(days, { before: '2026-10-14' })).toBe(30);
    expect(totalOfDays(days, { before: '2026-10-12' })).toBe(0);
  });

  it('un compte sans ligne vaut 0', () => {
    expect(totalOfDays(undefined)).toBe(0);
  });
});
