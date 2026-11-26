/**
 * LE SEAU QUOTIDIEN DES ÉTINCELLES (#20619, #17363) : chaque gain d'étincelles monte la somme du jour UTC, et le
 * premier gain du jour d'un compte compte un joueur de plus — sans aucune ligne par compte dans le seau. Écrit au
 * crédit (`EngagementGameHooks.onPointsGained`), isolé : une panne ne retient jamais le gain.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import { GameSparksDayRecorder } from '../GameSparksDay';
import { EngagementGameHooks } from '../EngagementGameHooks';
import { fakeGameDb, seedUser, USER, OTHER } from './fakeGameDb';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }) },
}));

const NOON = new Date('2026-11-26T12:00:00Z');
const LATE = new Date('2026-11-26T23:30:00Z');
const NEXT_DAY = new Date('2026-11-27T00:10:00Z');

const setup = () => {
  const db = fakeGameDb();
  seedUser(db, {}, USER);
  seedUser(db, {}, OTHER);
  return { db, recorder: new GameSparksDayRecorder(db.prisma) };
};

describe('GameSparksDayRecorder.record', () => {
  it('somme les gains du jour UTC et compte chaque joueur une fois', async () => {
    const { db, recorder } = setup();

    await recorder.record(USER, 10, NOON);
    await recorder.record(USER, 5, LATE);
    await recorder.record(OTHER, 7, LATE);

    expect(db.gameSparksDay.rows).toEqual([expect.objectContaining({ day: '2026-11-26', sparks: 22, earners: 2 })]);
  });

  it('ouvre un seau neuf au jour UTC suivant, où le joueur compte de nouveau', async () => {
    const { db, recorder } = setup();

    await recorder.record(USER, 10, LATE);
    await recorder.record(USER, 4, NEXT_DAY);

    expect(db.gameSparksDay.rows.map(({ day, sparks, earners }) => ({ day, sparks, earners }))).toEqual([
      { day: '2026-11-26', sparks: 10, earners: 1 },
      { day: '2026-11-27', sparks: 4, earners: 1 },
    ]);
  });

  it('compte le premier gain d’un compte dont le marqueur est ABSENT (compte d’avant le seau)', async () => {
    const { db, recorder } = setup();

    await recorder.record(USER, 3, NOON);

    expect(db.user.rows.find((row) => row.id === USER)?.sparksEarnedDay).toBe('2026-11-26');
    expect(db.gameSparksDay.rows[0]).toEqual(expect.objectContaining({ earners: 1 }));
  });

  it('n’écrit rien pour un gain nul, négatif ou non entier', async () => {
    const { db, recorder } = setup();

    for (const points of [0, -4, 2.5, Number.NaN]) await recorder.record(USER, points, NOON);

    expect(db.gameSparksDay.rows).toEqual([]);
    expect(db.user.rows.find((row) => row.id === USER)?.sparksEarnedDay).toBeUndefined();
  });

  it('ne garde aucun identifiant de compte dans le seau', async () => {
    const { db, recorder } = setup();

    await recorder.record(USER, 10, NOON);

    expect(JSON.stringify(db.gameSparksDay.rows)).not.toContain(USER);
  });

  it('rejoue l’upsert quand deux premiers gains du jour se croisent (P2002)', async () => {
    const { db, recorder } = setup();
    const upsert = db.prisma.gameSparksDay.upsert.bind(db.prisma.gameSparksDay);
    let collided = false;
    (db.prisma.gameSparksDay as unknown as { upsert: unknown }).upsert = async (args: never) => {
      if (!collided) {
        collided = true;
        throw Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
      }
      return upsert(args);
    };

    await recorder.record(USER, 6, NOON);

    expect(db.gameSparksDay.rows).toEqual([expect.objectContaining({ sparks: 6, earners: 1 })]);
  });
});

describe('EngagementGameHooks.onPointsGained — le seau du jour', () => {
  it('monte le seau du jour au gain', async () => {
    const db = fakeGameDb();
    seedUser(db, {}, USER);
    const hooks = new EngagementGameHooks(db.prisma, (async () => undefined) as never, { photoPushOn: () => false });

    await hooks.onPointsGained(USER, 12);

    expect(db.gameSparksDay.rows).toEqual([expect.objectContaining({ day: new Date().toISOString().slice(0, 10), sparks: 12, earners: 1 })]);
  });

  it('un seau qui tombe ne retient pas le gain', async () => {
    const db = fakeGameDb();
    seedUser(db, {}, USER);
    (db.prisma.gameSparksDay as unknown as { upsert: unknown }).upsert = async () => Promise.reject(new Error('mongo down'));
    const hooks = new EngagementGameHooks(db.prisma, (async () => undefined) as never, { photoPushOn: () => false });

    await expect(hooks.onPointsGained(USER, 12)).resolves.toBeUndefined();
    expect(db.gameWeekPoints.rows).toEqual([expect.objectContaining({ points: 12 })]);
  });
});
