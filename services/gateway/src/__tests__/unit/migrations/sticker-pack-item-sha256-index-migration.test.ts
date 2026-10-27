/**
 * #10188 — **la migration d'index de l'empreinte des fichiers de packs de stickers se rejoue sans rien
 * changer, et n'écrit rien à blanc.** Non unique : deux packs peuvent garder les mêmes octets, aucun doublon
 * ne la bloque.
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
  '../../../../../../packages/shared/prisma/migrations/2026-10-25-sticker-pack-item-sha256-index.mongodb.js',
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
  (database.indexes.get('StickerPackItem') ?? []).map((index) => ({ key: index.key, unique: index.unique === true }));

const EXISTING: readonly Index[] = [{ name: 'StickerPackItem_packId_key_key', key: { packId: 1, key: 1 }, unique: true }];

describe('2026-10-25-sticker-pack-item-sha256-index.mongodb.js', () => {
  it('pose l’index NON unique de l’empreinte, sans toucher les index déjà là', () => {
    const database = fakeDatabase({ StickerPackItem: EXISTING });
    run(database);
    expect(keysOf(database)).toEqual([
      { key: { packId: 1, key: 1 }, unique: true },
      { key: { sha256: 1 }, unique: false },
    ]);
  });

  it('se rejoue sans rien changer', () => {
    const database = fakeDatabase({ StickerPackItem: EXISTING });
    run(database);
    const after = JSON.stringify([...database.indexes.entries()]);
    const printed = run(database);
    expect(JSON.stringify([...database.indexes.entries()])).toBe(after);
    expect(printed).toContain('Créés (0) :');
  });

  it('DRY_RUN=1 n’écrit rien', () => {
    const database = fakeDatabase({ StickerPackItem: EXISTING });
    const printed = run(database, { DRY_RUN: '1' });
    expect(keysOf(database)).toEqual([{ key: { packId: 1, key: 1 }, unique: true }]);
    expect(printed[0]).toContain('SIMULATION');
  });
});
