/**
 * #9706 — **le niveau record se recalcule sur la courbe 100 × N² et ses étapes, une fois par compte.**
 *
 * Le témoin exécute le FICHIER mongosh lui-même (celui que le coordinateur rejouera, staging puis production
 * avec le feu vert du porteur), contre des collections simulées : c'est le script qui est jugé. Sa copie de la
 * loi (courbe, rangs, plafonds, étapes) est confrontée, cas par cas, à la loi partagée TypeScript.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';
import { gloryStanding } from '@meeshy/shared/utils/game/glory';
import { levelCapWithSteps } from '@meeshy/shared/utils/game/level-steps';
import { levelFromScore } from '@meeshy/shared/utils/game/levels';

const SCRIPT = resolve(__dirname, '../../../../../../packages/shared/prisma/migrations/2026-10-08-game-level-record-curve.mongodb.js');

type Doc = Record<string, unknown>;
type Filter = Record<string, unknown>;

const isObject = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);

const matches = (doc: Doc, filter: Filter): boolean =>
  Object.entries(filter).every(([field, condition]) => {
    if (field === '$and') return (condition as Filter[]).every((sub) => matches(doc, sub));
    const value = doc[field];
    if (!isObject(condition)) return value === condition;
    return Object.entries(condition).every(([op, arg]) => {
      if (op === '$gt') return typeof value === 'number' && typeof arg === 'number' ? value > arg : value !== undefined && String(value) > String(arg);
      if (op === '$in') return Array.isArray(arg) && arg.includes(value);
      if (op === '$ne') return arg === null ? value !== null && value !== undefined : value !== arg;
      throw new Error(`opérateur non simulé : ${op}`);
    });
  });

const fakeDatabase = (seed: Readonly<Record<string, readonly Doc[]>>) => {
  const data: Record<string, Doc[]> = Object.fromEntries(Object.entries(seed).map(([name, docs]) => [name, docs.map((doc) => ({ ...doc }))]));
  const writes: string[] = [];
  const collection = (name: string) => {
    const docs = (data[name] ??= []);
    return {
      find: (filter: Filter) => {
        const cursor = (rows: Doc[]) => ({
          sort: () => cursor([...rows].sort((a, b) => String(a._id).localeCompare(String(b._id)))),
          limit: (n: number) => cursor(rows.slice(0, n)),
          toArray: () => rows.map((row) => ({ ...row })),
        });
        return cursor(docs.filter((doc) => matches(doc, filter)));
      },
      updateOne: (filter: Filter, update: { $set: Doc }) => {
        writes.push(`${name}.updateOne`);
        const hit = docs.find((doc) => matches(doc, filter));
        if (hit) Object.assign(hit, update.$set);
        return { matchedCount: hit ? 1 : 0, modifiedCount: hit ? 1 : 0 };
      },
      insertMany: (rows: Doc[]) => {
        writes.push(`${name}.insertMany`);
        docs.push(...rows.map((row) => ({ ...row })));
        return { insertedCount: rows.length };
      },
    };
  };
  return { db: { getCollection: collection }, data, writes };
};

const run = (database: ReturnType<typeof fakeDatabase>, env: Record<string, string> = {}) => {
  const printed: string[] = [];
  const context = vm.createContext({ db: database.db, print: (line: unknown) => printed.push(String(line)), process: { env } });
  vm.runInContext(readFileSync(SCRIPT, 'utf8'), context, { filename: SCRIPT });
  return { printed: printed.join('\n'), context: context as unknown as { convertedRecord: (account: Doc) => number } };
};

const hex = (n: number) => n.toString(16).padStart(24, '0');

/** Le record d'après selon la loi partagée : le plus haut du score en poche et de l'ancien record relu, sous le plafond servi. */
const lawRecord = (account: {
  readonly score: number;
  readonly levelRecord: number;
  readonly minted: number;
  readonly missionsDone: number;
  readonly flameRecord: number;
  readonly glory: number;
  readonly mythic?: boolean;
}): number => {
  const standing = gloryStanding({ glory: account.glory, mythic: account.mythic === true });
  const cap = levelCapWithSteps({ rank: standing.rank, steps: { ...account, glory: standing.glory, rank: standing.rank } });
  const now = levelFromScore(account.score, cap);
  const before = levelFromScore(10 * account.levelRecord * account.levelRecord, cap);
  return Math.min(account.levelRecord, Math.max(now, before));
};

const seed = () => ({
  User: [
    // Le meilleur compte de production : 93 730 points, record 96, toutes les étapes basses faites.
    { _id: hex(1), engagementScore: 93_730, levelRecord: 96, meeshMintedLifetime: 3, longestStreakDays: 12 },
    // Des points, mais jamais de Meesh frappée : le record attend à 9.
    { _id: hex(2), engagementScore: 40_000, levelRecord: 63 },
    // Un record d'hier plus haut que le score d'aujourd'hui (une frappe a débité) : il se relit sur la courbe.
    { _id: hex(3), engagementScore: 100, levelRecord: 40, meeshMintedLifetime: 1 },
    // Déjà converti : jamais relu.
    { _id: hex(4), engagementScore: 50_000, levelRecord: 22, meeshMintedLifetime: 1 },
    // Sans record : rien à faire.
    { _id: hex(5), engagementScore: 9000 },
  ],
  GloryLedger: [
    { userId: hex(1), delta: 9000 },
    { userId: hex(1), delta: 7000 },
    { userId: hex(3), delta: 500 },
  ],
  DailyMission: [
    { userId: hex(1), completedAt: new Date('2026-10-01T00:00:00Z') },
    { userId: hex(1), completedAt: null },
    { userId: hex(3), completedAt: new Date('2026-10-02T00:00:00Z') },
  ],
  MythicSeat: [],
  GameLevelRecordCurve: [{ userId: hex(4), previousRecord: 70, record: 22 }],
});

describe('#9706 — le niveau record sur la courbe 100 × N²', () => {
  it('DRY_RUN=1 simule : compte, n’écrit rien', () => {
    const database = fakeDatabase(seed());

    const { printed } = run(database, { DRY_RUN: '1' });

    expect(database.writes).toEqual([]);
    expect(printed).toContain('SIMULATION');
    expect(printed).toContain('Records examinés : 3 — abaissés : 3, inchangés : 0');
    expect(printed).toContain('Déjà convertis (journal GameLevelRecordCurve) : 1');
    expect(printed).toContain('Plus haut record : 96 avant, 30 après');
  });

  it('écrit le record d’après et le journal : 96 → 30, un compte sans Meesh attend à 9', () => {
    const database = fakeDatabase(seed());

    run(database);

    const records = Object.fromEntries(database.data.User!.map((user) => [user._id, user.levelRecord]));
    expect(records).toEqual({ [hex(1)]: 30, [hex(2)]: 9, [hex(3)]: 12, [hex(4)]: 22, [hex(5)]: undefined });
    expect(database.data.GameLevelRecordCurve!.map((row) => [row.userId, row.previousRecord, row.record])).toEqual([
      [hex(4), 70, 22],
      [hex(1), 96, 30],
      [hex(2), 63, 9],
      [hex(3), 40, 12],
    ]);
  });

  it('est idempotent : une seconde exécution ne convertit plus rien', () => {
    const database = fakeDatabase(seed());
    run(database);
    const after = database.data.User!.map((user) => user.levelRecord);

    const { printed } = run(database);

    expect(printed).toContain('Records examinés : 0');
    expect(printed).toContain('Déjà convertis (journal GameLevelRecordCurve) : 4');
    expect(database.data.User!.map((user) => user.levelRecord)).toEqual(after);
  });

  it('n’écrase pas un record qu’un crédit a déjà réécrit sous la nouvelle loi entre la lecture et l’écriture', () => {
    const database = fakeDatabase(seed());
    const base = database.db.getCollection;
    database.db.getCollection = ((name: string) => {
      const collection = base(name);
      if (name !== 'User') return collection;
      return {
        ...collection,
        updateOne: (filter: Filter, update: { $set: Doc }) =>
          filter._id === hex(2) ? { matchedCount: 0, modifiedCount: 0 } : collection.updateOne(filter, update),
      };
    }) as typeof database.db.getCollection;

    const { printed } = run(database);

    expect(printed).toContain('laissés (record bougé entre-temps) : 1');
    expect(database.data.GameLevelRecordCurve!.some((row) => row.userId === hex(2))).toBe(false);
  });

  it('sa copie de la loi rend le record de la loi partagée, cas par cas', () => {
    const { context } = run(fakeDatabase({ User: [] }), { DRY_RUN: '1' });
    const accounts = [
      { score: 93_730, levelRecord: 96, minted: 3, missionsDone: 1, flameRecord: 12, glory: 16_000 },
      { score: 40_000, levelRecord: 63, minted: 0, missionsDone: 0, flameRecord: 0, glory: 0 },
      { score: 100, levelRecord: 40, minted: 1, missionsDone: 1, flameRecord: 0, glory: 500 },
      { score: 1_000_000, levelRecord: 100, minted: 5, missionsDone: 10, flameRecord: 30, glory: 35_000 },
      { score: 1_000_000, levelRecord: 100, minted: 5, missionsDone: 10, flameRecord: 30, glory: 34_999 },
      { score: 30_000_000, levelRecord: 1000, minted: 9, missionsDone: 10, flameRecord: 60, glory: 129_999 },
      { score: 30_000_000, levelRecord: 1000, minted: 9, missionsDone: 10, flameRecord: 60, glory: 130_000 },
      { score: 300_000_000, levelRecord: 3000, minted: 9, missionsDone: 10, flameRecord: 60, glory: 380_000 },
      { score: 300_000_000, levelRecord: 3000, minted: 0, missionsDone: 0, flameRecord: 0, glory: 0, mythic: true },
      { score: 250_000, levelRecord: 70, minted: 4, missionsDone: 10, flameRecord: 7, glory: 6000 },
      { score: 250_000, levelRecord: 70, minted: 5, missionsDone: 9, flameRecord: 7, glory: 6000 },
      // Chaque frontière de rang et de Flamme, de part et d'autre.
      ...[1999, 2000, 5999, 6000, 14_999, 15_000, 34_999, 35_000].map((glory) => ({
        score: 1_000_000, levelRecord: 100, minted: 5, missionsDone: 10, flameRecord: 30, glory,
      })),
      ...[6, 7, 29, 30].map((flameRecord) => ({ score: 1_000_000, levelRecord: 100, minted: 5, missionsDone: 10, flameRecord, glory: 35_000 })),
      ...[0, 1, 4, 5].map((minted) => ({ score: 1_000_000, levelRecord: 100, minted, missionsDone: 10, flameRecord: 30, glory: 35_000 })),
      ...[0, 1, 9, 10].map((missionsDone) => ({ score: 1_000_000, levelRecord: 100, minted: 5, missionsDone, flameRecord: 30, glory: 35_000 })),
    ];
    for (const account of accounts) expect([account, context.convertedRecord(account)]).toEqual([account, lawRecord(account)]);
  });
});
