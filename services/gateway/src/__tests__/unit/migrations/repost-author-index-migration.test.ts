/**
 * #9727 — **la migration pose l'index `{ repostOfId, authorId }` de `Post` et se rejoue sans rien changer.**
 * La liste des vues compte les republications de CHAQUE personne d'une page sur UN contenu : sans cet index,
 * chaque page balaie la collection. Le témoin exécute le FICHIER mongosh lui-même, dans un contexte isolé,
 * contre des index simulés — il n'est joué nulle part ailleurs.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';

const SCRIPT = resolve(__dirname, '../../../../../../packages/shared/prisma/migrations/2026-10-09-post-repost-author-index.mongodb.js');

type Index = { readonly name: string; readonly key: Record<string, number> };

const fakeDatabase = (seed: Readonly<Record<string, readonly Index[]>>) => {
  const indexes = new Map<string, Index[]>(Object.entries(seed).map(([collection, list]) => [collection, [...list]]));
  const collectionOf = (name: string) => ({
    getIndexes: () => [...(indexes.get(name) ?? [])],
    createIndex: (key: Record<string, number>, options: { name: string }) => indexes.set(name, [...(indexes.get(name) ?? []), { key, ...options }]),
  });
  return { indexes, db: { getCollectionNames: () => [...indexes.keys()], getCollection: collectionOf } };
};

const run = (database: ReturnType<typeof fakeDatabase>, env: Record<string, string> = {}) => {
  const printed: string[] = [];
  vm.runInNewContext(readFileSync(SCRIPT, 'utf8'), { db: database.db, process: { env }, print: (line: string) => printed.push(line) });
  return printed;
};

const ID_ONLY: readonly Index[] = [{ name: '_id_', key: { _id: 1 } }];

describe('2026-10-09-post-repost-author-index.mongodb.js', () => {
  it("pose l'index { repostOfId, authorId } de Post, sous le nom que Prisma lui donnerait", () => {
    const database = fakeDatabase({ Post: ID_ONLY });

    run(database);

    const created = database.indexes.get('Post')?.find((index) => index.name === 'Post_repostOfId_authorId_idx');
    expect(created?.key).toEqual({ repostOfId: 1, authorId: 1 });
    expect(Object.keys(created?.key ?? {})).toEqual(['repostOfId', 'authorId']);
  });

  it("se rejoue sans rien changer : l'index déjà posé est reconnu à sa CLÉ, quel que soit son nom", () => {
    const database = fakeDatabase({ Post: [...ID_ONLY, { name: 'nom_pose_a_la_main', key: { repostOfId: 1, authorId: 1 } }] });

    const printed = run(database);

    expect(database.indexes.get('Post')).toHaveLength(2);
    expect(printed.join('\n')).toContain('Déjà présents (1)');
  });

  it("un index voisin (repostOfId seul, ou dans l'autre ordre) ne le remplace pas", () => {
    const database = fakeDatabase({
      Post: [...ID_ONLY, { name: 'a', key: { repostOfId: 1 } }, { name: 'b', key: { authorId: 1, repostOfId: 1 } }],
    });

    run(database);

    expect(database.indexes.get('Post')?.map((index) => index.name)).toContain('Post_repostOfId_authorId_idx');
  });

  it("en simulation (DRY_RUN=1), n'écrit rien et dit ce qu'il aurait créé", () => {
    const database = fakeDatabase({ Post: ID_ONLY });

    const printed = run(database, { DRY_RUN: '1' });

    expect(database.indexes.get('Post')).toHaveLength(1);
    expect(printed.join('\n')).toContain('SIMULATION');
    expect(printed.join('\n')).toContain('+ Post.Post_repostOfId_authorId_idx');
  });
});
