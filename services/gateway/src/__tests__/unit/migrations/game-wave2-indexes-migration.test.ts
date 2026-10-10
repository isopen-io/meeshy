/**
 * #9384, #7742 — **la migration d'index de la vague 2 du jeu pose ses index
 * TTL pour de bon, et se rejoue sans rien changer.**
 *
 * Le témoin exécute le FICHIER mongosh lui-même (celui que le porteur rejouera
 * en staging puis en production), dans un contexte isolé, contre des index
 * simulés : c'est le script qui est jugé, jamais une copie.
 *
 * Le cas qui compte : un index ORDINAIRE déjà posé sur la clé d'un index TTL
 * (`@@index([expiresAt])` du schéma, qu'un `prisma db push` aurait créé) se
 * reconnaissait à sa clé et passait pour « déjà présent » — la conservation de
 * 30 jours (conformité H-9) n'aurait jamais été appliquée, sans rien signaler.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';

const SCRIPT = resolve(
  __dirname,
  '../../../../../../packages/shared/prisma/migrations/2026-10-06-game-wave2-indexes.mongodb.js',
);

type Index = { readonly name: string; readonly key: Record<string, number>; readonly unique?: boolean; readonly expireAfterSeconds?: number };

const fakeDatabase = (seed: Readonly<Record<string, readonly Index[]>>) => {
  const indexes = new Map<string, Index[]>(Object.entries(seed).map(([collection, list]) => [collection, [...list]]));
  const collectionOf = (name: string) => ({
    getIndexes: () => [...(indexes.get(name) ?? [])],
    dropIndex: (indexName: string) => indexes.set(name, (indexes.get(name) ?? []).filter((index) => index.name !== indexName)),
    createIndex: (key: Record<string, number>, options: { name: string; unique?: boolean; expireAfterSeconds?: number }) =>
      indexes.set(name, [...(indexes.get(name) ?? []), { key, ...options }]),
    aggregate: () => ({ toArray: () => [] }),
  });
  return {
    indexes,
    db: { getCollectionNames: () => [...indexes.keys()], getCollection: collectionOf },
  };
};

const run = (database: ReturnType<typeof fakeDatabase>) => {
  const printed: string[] = [];
  vm.runInNewContext(readFileSync(SCRIPT, 'utf8'), {
    db: database.db,
    process: { env: {} },
    print: (line: string) => printed.push(line),
    quit: (code: number) => printed.push(`quit ${code}`),
  });
  return printed;
};

const ttlOn = (database: ReturnType<typeof fakeDatabase>) =>
  (database.indexes.get('AffiliateVisitSession') ?? []).filter((index) => JSON.stringify(index.key) === '{"expiresAt":1}');

describe('2026-10-06-game-wave2-indexes.mongodb.js', () => {
  it('remplace un index ORDINAIRE posé sur la clé d’un index TTL : la conservation s’applique pour de bon', () => {
    const database = fakeDatabase({
      AffiliateVisitSession: [{ name: 'AffiliateVisitSession_expiresAt_idx', key: { expiresAt: 1 } }],
    });

    run(database);

    expect(ttlOn(database)).toEqual([expect.objectContaining({ expireAfterSeconds: 0 })]);
  });

  it('se rejoue sans rien changer : le second passage ne crée ni ne remplace aucun index', () => {
    const database = fakeDatabase({ AffiliateVisitSession: [] });
    run(database);
    const after = JSON.stringify([...database.indexes.entries()]);

    const printed = run(database);

    expect(JSON.stringify([...database.indexes.entries()])).toBe(after);
    expect(printed).toContain('Créés (0) :');
  });
});
