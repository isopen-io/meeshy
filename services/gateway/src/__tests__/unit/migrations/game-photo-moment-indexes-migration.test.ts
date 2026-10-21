/**
 * #10162 — **la migration d'index du registre des moments photo se rejoue sans rien changer, et un doublon
 * bloque l'unique sans être forcé.**
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
  '../../../../../../packages/shared/prisma/migrations/2026-10-11-game-photo-moment-indexes.mongodb.js',
);

type Index = { readonly name: string; readonly key: Record<string, number>; readonly unique?: boolean };

const fakeDatabase = (seed: Readonly<Record<string, readonly Index[]>>, duplicateGroups = 0) => {
  const indexes = new Map<string, Index[]>(Object.entries(seed).map(([collection, list]) => [collection, [...list]]));
  const collectionOf = (name: string) => ({
    getIndexes: () => [...(indexes.get(name) ?? [])],
    dropIndex: (indexName: string) => indexes.set(name, (indexes.get(name) ?? []).filter((index) => index.name !== indexName)),
    createIndex: (key: Record<string, number>, options: { name: string; unique?: boolean }) =>
      indexes.set(name, [...(indexes.get(name) ?? []), { key, ...options }]),
    aggregate: () => ({ toArray: () => (duplicateGroups > 0 ? [{ groups: duplicateGroups }] : []) }),
  });
  return { indexes, db: { getCollectionNames: () => [...indexes.keys()], getCollection: collectionOf } };
};

const run = (database: ReturnType<typeof fakeDatabase>, env: Record<string, string> = {}) => {
  const printed: string[] = [];
  vm.runInNewContext(readFileSync(SCRIPT, 'utf8'), {
    db: database.db,
    process: { env },
    print: (line: string) => printed.push(line),
    quit: (code: number) => printed.push(`quit ${code}`),
  });
  return printed;
};

const keysOf = (database: ReturnType<typeof fakeDatabase>) =>
  (database.indexes.get('GamePhotoMoment') ?? []).map((index) => ({ key: index.key, unique: index.unique === true }));

describe('2026-10-11-game-photo-moment-indexes.mongodb.js', () => {
  it('pose l’unique (userId, stepId) et l’index de lecture (userId, updatedAt)', () => {
    const database = fakeDatabase({ GamePhotoMoment: [] });
    run(database);
    expect(keysOf(database)).toEqual([
      { key: { userId: 1, stepId: 1 }, unique: true },
      { key: { userId: 1, updatedAt: 1 }, unique: false },
    ]);
  });

  it('se rejoue sans rien changer : le second passage ne crée ni ne remplace aucun index', () => {
    const database = fakeDatabase({ GamePhotoMoment: [] });
    run(database);
    const after = JSON.stringify([...database.indexes.entries()]);
    const printed = run(database);
    expect(JSON.stringify([...database.indexes.entries()])).toBe(after);
    expect(printed).toContain('Créés (0) :');
  });

  it('DRY_RUN=1 n’écrit rien', () => {
    const database = fakeDatabase({ GamePhotoMoment: [] });
    const printed = run(database, { DRY_RUN: '1' });
    expect(keysOf(database)).toEqual([]);
    expect(printed[0]).toContain('SIMULATION');
  });

  it('un doublon (userId, stepId) bloque l’unique : signalé, jamais forcé, et la sortie échoue', () => {
    const database = fakeDatabase({ GamePhotoMoment: [] }, 2);
    const printed = run(database);
    expect(keysOf(database)).toEqual([{ key: { userId: 1, updatedAt: 1 }, unique: false }]);
    expect(printed.some((line) => line.includes('GamePhotoMoment_userId_stepId_key — 2 groupe(s) en doublon'))).toBe(true);
    expect(printed).toContain('quit 2');
  });
});
