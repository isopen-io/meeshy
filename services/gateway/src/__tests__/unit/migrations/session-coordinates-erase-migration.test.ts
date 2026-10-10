/**
 * #9609 — **les coordonnées tirées de l'adresse IP, écrites avant le lot,
 * s'effacent ; rien d'autre ne quitte les lignes.**
 *
 * Le témoin exécute le FICHIER mongosh lui-même (celui que le porteur rejouera,
 * staging puis production, avec son feu vert), contre des collections
 * simulées : c'est le script qui est jugé, jamais une copie.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';

const SCRIPT = resolve(
  __dirname,
  '../../../../../../packages/shared/prisma/migrations/2026-10-08-session-coordinates-erase.mongodb.js',
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
      if (op === '$gt') return present && String(doc[key]) > String(arg);
      if (op === '$in') return Array.isArray(arg) && arg.includes(doc[key]);
      throw new Error(`opérateur non simulé : ${op}`);
    });
  });

const fakeDatabase = (seed: Readonly<Record<string, readonly Doc[]>>) => {
  const data: Record<string, Doc[]> = Object.fromEntries(
    Object.entries(seed).map(([name, docs]) => [name, docs.map((doc) => structuredClone(doc))]),
  );
  const writes: Array<{ collection: string; update: Record<string, unknown> }> = [];
  const collection = (name: string) => {
    const docs = data[name];
    if (!docs) throw new Error(`collection inattendue : ${name}`);
    return {
      find: (filter: Filter) => {
        const found = docs.filter((doc) => matches(doc, filter)).sort((a, b) => String(a._id).localeCompare(String(b._id)));
        const cursor = (rows: Doc[]) => ({
          sort: () => cursor(rows),
          limit: (n: number) => cursor(rows.slice(0, n)),
          toArray: () => rows.map((row) => ({ _id: row._id })),
        });
        return cursor(found);
      },
      updateMany: (filter: Filter, update: { $unset?: Record<string, unknown>; $set?: unknown }) => {
        writes.push({ collection: name, update });
        if (update.$set) throw new Error('l’effacement ne doit rien POSER');
        const hit = docs.filter((doc) => matches(doc, filter));
        hit.forEach((doc) => Object.keys(update.$unset ?? {}).forEach((field) => { delete doc[field]; }));
        return { matchedCount: hit.length, modifiedCount: hit.length };
      },
    };
  };
  return { db: { getCollection: collection }, data, writes };
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

const hex = (n: number) => n.toString(16).padStart(24, '0');

const seed = () => ({
  UserSession: [
    { _id: hex(1), userId: hex(9), ipAddress: '81.2.69.160', country: 'FR', city: 'Paris', latitude: 48.85, longitude: 2.35 },
    { _id: hex(2), userId: hex(9), ipAddress: '81.2.69.161', country: 'FR', city: 'Lyon' },
    { _id: hex(3), userId: hex(9), latitude: null, longitude: null },
  ],
  MagicLinkToken: [{ _id: hex(4), geoLocation: 'Paris, France', geoCoordinates: '48.85,2.35' }],
  PasswordResetToken: [{ _id: hex(5), geoLocation: 'Lyon, France' }],
});

describe('#9609 — effacement des coordonnées', () => {
  it('à blanc par défaut : compte, n’écrit rien', () => {
    const database = fakeDatabase(seed());

    const printed = run(database);

    expect(database.writes).toEqual([]);
    expect(database.data).toEqual(seed());
    expect(printed.join('\n')).toContain('À BLANC');
    expect(printed.join('\n')).toContain('UserSession — lots de 500 : 1, à effacer : 2, effacées : 0');
  });

  it('APPLY=1 retire les seules coordonnées, et laisse adresse, pays, ville et lieu', () => {
    const database = fakeDatabase(seed());

    run(database, { APPLY: '1' });

    expect(database.data.UserSession).toEqual([
      { _id: hex(1), userId: hex(9), ipAddress: '81.2.69.160', country: 'FR', city: 'Paris' },
      { _id: hex(2), userId: hex(9), ipAddress: '81.2.69.161', country: 'FR', city: 'Lyon' },
      { _id: hex(3), userId: hex(9) },
    ]);
    expect(database.data.MagicLinkToken).toEqual([{ _id: hex(4), geoLocation: 'Paris, France' }]);
    expect(database.data.PasswordResetToken).toEqual([{ _id: hex(5), geoLocation: 'Lyon, France' }]);
    expect(database.writes.every((write) => Object.keys(write.update).join() === '$unset')).toBe(true);
  });

  it('est idempotent : une seconde exécution ne trouve rien', () => {
    const database = fakeDatabase(seed());
    run(database, { APPLY: '1' });
    database.writes.length = 0;

    const printed = run(database, { APPLY: '1' });

    expect(database.writes).toEqual([]);
    expect(printed.join('\n')).toContain('UserSession — lots de 500 : 0, à effacer : 0, effacées : 0');
  });

  it('le journal compte, et ne cite jamais une coordonnée', () => {
    const printed = run(fakeDatabase(seed()), { APPLY: '1' }).join('\n');
    expect(printed).not.toMatch(/48\.85|2\.35/);
  });
});
