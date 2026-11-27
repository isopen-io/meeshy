/**
 * #20542 — **la migration qui fait expirer l'alerte de proximité entre Sangs pose un TTL qui ne vise
 * qu'elle, se rejoue sans rien changer, et ne remplace jamais un index de même clé.**
 *
 * Le témoin exécute le FICHIER mongosh lui-même (celui qui se joue sur le staging, puis en production après
 * feu vert), dans un contexte isolé, contre des index simulés : c'est le script qui est jugé, jamais une copie.
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';

const SCRIPT = resolve(
  __dirname,
  '../../../../../../packages/shared/prisma/migrations/2026-11-27-notification-blood-proximity-ttl.mongodb.js',
);

type Index = {
  readonly name: string;
  readonly key: Record<string, number>;
  readonly expireAfterSeconds?: number;
  readonly partialFilterExpression?: Record<string, unknown>;
};

const EXISTANTS: readonly Index[] = [
  { name: '_id_', key: { _id: 1 } },
  { name: 'Notification_userId_isRead_expiresAt_idx', key: { userId: 1, isRead: 1, expiresAt: 1 } },
];

const fakeDatabase = (seed: readonly Index[]) => {
  const indexes: Index[] = [...seed];
  const counted: unknown[] = [];
  const db = {
    getCollection: (name: string) => {
      if (name !== 'Notification') throw new Error(`collection inattendue : ${name}`);
      return {
        getIndexes: () => [...indexes],
        countDocuments: (filter: unknown) => {
          counted.push(filter);
          return 4;
        },
        createIndex: (key: Record<string, number>, options: Omit<Index, 'key'>) => indexes.push({ key, ...options }),
      };
    },
  };
  return { indexes, counted, db };
};

const run = (database: ReturnType<typeof fakeDatabase>, env: Record<string, string> = {}) => {
  const printed: unknown[] = [];
  const exits: number[] = [];
  vm.runInNewContext(readFileSync(SCRIPT, 'utf8'), {
    db: database.db,
    process: { env },
    Date,
    printjson: (value: unknown) => printed.push(value),
    quit: (code: number) => exits.push(code),
  });
  return { printed, exits };
};

describe('2026-11-27-notification-blood-proximity-ttl.mongodb.js', () => {
  it('pose un TTL 0 sur expiresAt, PARTIEL au seul type blood_proximity', () => {
    const database = fakeDatabase(EXISTANTS);
    const { printed } = run(database);
    expect(database.indexes.slice(EXISTANTS.length)).toEqual([
      { key: { expiresAt: 1 }, name: 'Notification_bloodProximity_expiresAt_ttl', expireAfterSeconds: 0, partialFilterExpression: { type: 'blood_proximity' } },
    ]);
    expect(printed).toEqual([{ dryRun: false, present: [], created: ['Notification_bloodProximity_expiresAt_ttl'], expiredRows: 4 }]);
  });

  it('ne compte que les lignes de proximité expirées', () => {
    const database = fakeDatabase(EXISTANTS);
    run(database, { DRY_RUN: '1' });
    expect(database.counted).toHaveLength(1);
    expect(database.counted[0]).toMatchObject({ type: 'blood_proximity', expiresAt: { $lte: expect.any(Date) } });
  });

  it('se rejoue sans rien changer', () => {
    const database = fakeDatabase(EXISTANTS);
    run(database);
    const after = JSON.stringify(database.indexes);
    const { printed, exits } = run(database);
    expect(JSON.stringify(database.indexes)).toBe(after);
    expect(printed).toEqual([{ dryRun: false, present: ['Notification_bloodProximity_expiresAt_ttl'], created: [], expiredRows: 4 }]);
    expect(exits).toEqual([]);
  });

  it('DRY_RUN=1 n’écrit rien', () => {
    const database = fakeDatabase(EXISTANTS);
    run(database, { DRY_RUN: '1' });
    expect(database.indexes).toEqual(EXISTANTS);
  });

  it('un index de même clé sous un autre régime (TTL plein) est signalé, jamais remplacé, et la sortie échoue', () => {
    const plein: Index = { name: 'Notification_expiresAt_ttl', key: { expiresAt: 1 }, expireAfterSeconds: 0 };
    const database = fakeDatabase([...EXISTANTS, plein]);
    const { printed, exits } = run(database);
    expect(database.indexes).toEqual([...EXISTANTS, plein]);
    expect(printed).toEqual([{ dryRun: false, conflict: ['Notification_expiresAt_ttl'], created: [] }]);
    expect(exits).toEqual([2]);
  });
});
