/**
 * LES POINTS DE LA SEMAINE (#9384, #9385) — un incrément atomique par gain, dans
 * la semaine LOCALE du compte ; la fermeture du dimanche 20 h bascule sur la
 * semaine suivante.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { GameWeekPointsRecorder, weekKeyOfInstant } from '../GameWeekPoints';
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
  it('additionne les gains de la semaine dans UN document', async () => {
    const db = fakeGameDb();
    seedUser(db);
    const recorder = new GameWeekPointsRecorder(db.prisma);

    await recorder.record(USER, 10, new Date('2026-10-13T10:00:00Z'));
    await recorder.record(USER, 5, new Date('2026-10-15T10:00:00Z'));

    expect(db.gameWeekPoints.rows).toHaveLength(1);
    expect(db.gameWeekPoints.rows[0]).toMatchObject({ userId: USER, weekKey: '2026-10-12', points: 15 });
  });

  it('une semaine nouvelle ouvre un document nouveau', async () => {
    const db = fakeGameDb();
    seedUser(db);
    const recorder = new GameWeekPointsRecorder(db.prisma);

    await recorder.record(USER, 10, new Date('2026-10-17T10:00:00Z'));
    await recorder.record(USER, 7, new Date('2026-10-19T10:00:00Z'));

    expect(db.gameWeekPoints.rows.map((r) => [r.weekKey, r.points])).toEqual([
      ['2026-10-12', 10],
      ['2026-10-19', 7],
    ]);
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
