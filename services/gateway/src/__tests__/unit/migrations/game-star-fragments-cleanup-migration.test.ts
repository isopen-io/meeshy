/**
 * #10011 — **les fragments de Meesh de #10013 quittent la base ; aucune Meesh n'est supprimée, aucun solde
 * touché ; le fragment d'étoile gravé (`chestFragment`, tirage 1/6) n'est jamais réécrit ; tout se défait.**
 *
 * Le témoin exécute le FICHIER mongosh lui-même, contre des collections simulées : c'est le script qui est jugé,
 * jamais une copie.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';

const SCRIPT = resolve(
  __dirname,
  '../../../../../../packages/shared/prisma/migrations/2026-10-11-game-star-fragments-cleanup.mongodb.js',
);

type Doc = Record<string, unknown>;
type Filter = Record<string, unknown>;

const isObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const matches = (doc: Doc, filter: Filter): boolean =>
  Object.entries(filter).every(([key, condition]) => {
    if (key === '$or') return (condition as Filter[]).some((sub) => matches(doc, sub));
    if (key === '$and') return (condition as Filter[]).every((sub) => matches(doc, sub));
    const present = key in doc;
    if (!isObject(condition)) return present && doc[key] === condition;
    return Object.entries(condition).every(([op, arg]) => {
      if (op === '$exists') return present === arg;
      if (op === '$gt') return present && (typeof arg === 'number' ? Number(doc[key]) > arg : String(doc[key]) > String(arg));
      if (op === '$in') return Array.isArray(arg) && arg.includes(doc[key]);
      throw new Error(`opérateur non simulé : ${op}`);
    });
  });

const fakeDatabase = (seed: Readonly<Record<string, readonly Doc[]>>) => {
  const data: Record<string, Doc[]> = Object.fromEntries(
    Object.entries({ _migration_2026_10_11_star_fragments: [], ...seed }).map(([name, docs]) => [name, docs.map((doc) => structuredClone(doc))]),
  );
  const collection = (name: string) => {
    const docs = data[name];
    if (!docs) throw new Error(`collection inattendue : ${name}`);
    const apply = (doc: Doc, update: { $set?: Doc; $unset?: Doc; $setOnInsert?: Doc }) => {
      Object.entries(update.$set ?? {}).forEach(([field, value]) => { doc[field] = structuredClone(value); });
      Object.keys(update.$unset ?? {}).forEach((field) => { delete doc[field]; });
    };
    return {
      find: (filter: Filter) => {
        const found = docs.filter((doc) => matches(doc, filter)).sort((a, b) => String(a._id).localeCompare(String(b._id)));
        const cursor = (rows: Doc[]) => ({
          sort: () => cursor(rows),
          limit: (n: number) => cursor(rows.slice(0, n)),
          toArray: () => rows.map((row) => structuredClone(row)),
        });
        return cursor(found);
      },
      updateMany: (filter: Filter, update: { $set?: Doc; $unset?: Doc }) => {
        const hit = docs.filter((doc) => matches(doc, filter));
        hit.forEach((doc) => apply(doc, update));
        return { matchedCount: hit.length, modifiedCount: hit.length };
      },
      updateOne: (filter: Filter, update: { $setOnInsert?: Doc }, options: { upsert?: boolean } = {}) => {
        const hit = docs.find((doc) => matches(doc, filter));
        if (hit) return { matchedCount: 1, modifiedCount: 0 };
        if (!options.upsert) return { matchedCount: 0, modifiedCount: 0 };
        docs.push({ ...(filter as Doc), ...structuredClone(update.$setOnInsert ?? {}) });
        return { matchedCount: 0, modifiedCount: 0, upsertedCount: 1 };
      },
      deleteMany: (filter: Filter) => {
        const kept = docs.filter((doc) => !matches(doc, filter));
        const removed = docs.length - kept.length;
        docs.splice(0, docs.length, ...kept);
        return { deletedCount: removed };
      },
    };
  };
  return { db: { getCollection: collection }, data };
};

const run = (database: ReturnType<typeof fakeDatabase>, env: Record<string, string> = {}) => {
  const printed: string[] = [];
  vm.runInContext(readFileSync(SCRIPT, 'utf8'), vm.createContext({
    db: database.db,
    print: (line: unknown) => printed.push(String(line)),
    process: { env },
  }), { filename: SCRIPT });
  return printed;
};

const seed = () => ({
  MeeshLedger: [
    { _id: 'l1', userId: 'u1', delta: 1, reason: 'mint', requestId: 'f-1', fragmentsSpent: 5, meta: { paidWith: 'fragments', price: 0 } },
    { _id: 'l2', userId: 'u1', delta: 1, reason: 'mint', requestId: 'p-1', meta: { price: 1221 } },
    { _id: 'l3', userId: 'u2', delta: -1, reason: 'spend', requestId: 's-1' },
  ],
  GameDay: [
    { _id: 'd1', userId: 'u1', dayKey: '2026-10-10', chestClaimedAt: 'x', chestFragment: false, chestMeeshFragments: 1 },
    { _id: 'd2', userId: 'u1', dayKey: '2026-10-11', chestClaimedAt: 'x', chestFragment: true, chestMeeshFragments: 2 },
    { _id: 'd3', userId: 'u2', dayKey: '2026-10-09', chestClaimedAt: 'x', chestFragment: true },
    { _id: 'd4', userId: 'u2', dayKey: '2026-10-08', chestClaimedAt: 'x', chestMeeshFragments: 3 },
  ],
});

describe('2026-10-11-game-star-fragments-cleanup', () => {
  it('à blanc : compte les frappes par fragments et ce qui changerait, sans rien écrire', () => {
    const database = fakeDatabase(seed());
    const before = structuredClone(database.data);

    const printed = run(database).join('\n');

    expect(database.data).toEqual(before);
    expect(printed).toContain('frappes payées en fragments : 1');
    expect(printed).toContain('lignes : l1');
    expect(printed).toContain('dont fragment d\'étoile déjà gravé (chestFragment, inchangé) : 1');
    expect(printed).not.toContain('u1');
  });

  it('écrit : retire les deux champs, ne réécrit jamais chestFragment, ne supprime aucune Meesh', () => {
    const database = fakeDatabase(seed());

    run(database, { APPLY: '1' });

    expect(database.data.MeeshLedger).toHaveLength(3);
    expect(database.data.MeeshLedger!.every((row) => !('fragmentsSpent' in row))).toBe(true);
    expect(database.data.MeeshLedger![0]).toMatchObject({ delta: 1, reason: 'mint', meta: { paidWith: 'fragments' } });
    expect(database.data.GameDay!.every((row) => !('chestMeeshFragments' in row))).toBe(true);
    expect(database.data.GameDay!.map((row) => [row._id, 'chestFragment' in row ? row.chestFragment : 'absent'])).toEqual([
      ['d1', false],
      ['d2', true],
      ['d3', true],
      ['d4', 'absent'],
    ]);
  });

  it('est idempotent : une seconde exécution ne trouve rien', () => {
    const database = fakeDatabase(seed());
    run(database, { APPLY: '1' });
    const after = structuredClone(database.data);

    const printed = run(database, { APPLY: '1' }).join('\n');

    expect(database.data).toEqual(after);
    expect(printed).toContain('frappes payées en fragments : 0');
    expect(printed).toContain('lignes portant chestMeeshFragments : 0');
  });

  it('se défait : ROLLBACK=1 remet chaque ligne dans son état d\'origine', () => {
    const database = fakeDatabase(seed());
    const before = structuredClone(database.data);
    run(database, { APPLY: '1' });

    run(database, { ROLLBACK: '1' });

    const sorted = (rows: readonly Doc[]) => [...rows].sort((a, b) => String(a._id).localeCompare(String(b._id)));
    expect(sorted(database.data.MeeshLedger!)).toEqual(sorted(before.MeeshLedger!));
    expect(sorted(database.data.GameDay!)).toEqual(sorted(before.GameDay!));
    expect(database.data._migration_2026_10_11_star_fragments).toEqual([]);
  });
});
