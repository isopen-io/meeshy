/**
 * #16274 (audit, constats 1 et 2) — **l'unicité des éditeurs ne dépend plus d'un index absent.**
 * La migration pose les index uniques de `PartnerProfile.userId` (un éditeur par compte), de `slug`
 * et de `nameKey` (PARTIELS : un profil d'avant les éditeurs n'en a pas), relève les doublons
 * AVANT d'écrire, se rejoue sans rien changer et n'écrit rien à blanc.
 *
 * Le témoin exécute le FICHIER mongosh lui-même (celui qui se joue sur le staging, puis en production
 * après feu vert et sauvegarde vérifiée), dans un contexte isolé, contre une collection simulée.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';

const SCRIPT = resolve(
  __dirname,
  '../../../../../../packages/shared/prisma/migrations/2026-11-05-partner-profile-publisher-indexes.mongodb.js',
);

type Doc = Record<string, unknown>;
type Index = { readonly name: string; readonly key: Record<string, number>; readonly unique?: boolean; readonly partialFilterExpression?: Record<string, unknown> };
type Stage = { $match?: Record<string, { $type: string }>; $group?: { _id: Record<string, string> }; $count?: string };

const matchesStage = (doc: Doc, match: Record<string, { $type: string }>) =>
  Object.entries(match).every(([field, { $type }]) => $type === 'string' && typeof doc[field] === 'string');

const fakeDatabase = (docs: readonly Doc[], seed: readonly Index[] = [{ name: '_id_', key: { _id: 1 } }]) => {
  const indexes: Index[] = [...seed];
  const collection = {
    getIndexes: () => [...indexes],
    dropIndex: (name: string) => indexes.splice(indexes.findIndex((index) => index.name === name), 1),
    createIndex: (key: Record<string, number>, options: Omit<Index, 'key'>) => indexes.push({ key, ...options }),
    countDocuments: (filter: { nameKey: null; displayName: { $ne: string } }) =>
      docs.filter((doc) => (doc.nameKey ?? null) === filter.nameKey && doc.displayName !== filter.displayName.$ne).length,
    aggregate: (pipeline: readonly Stage[]) => {
      const groupAt = pipeline.findIndex((stage) => stage.$group);
      const match = pipeline.slice(0, groupAt).find((stage) => stage.$match)?.$match;
      const group = pipeline[groupAt]?.$group;
      const field = Object.values(group?._id ?? {})[0]?.slice(1) ?? '';
      const counts = new Map<string, number>();
      docs.filter((doc) => match === undefined || matchesStage(doc, match)).forEach((doc) => {
        const key = JSON.stringify(doc[field] ?? null);
        counts.set(key, (counts.get(key) ?? 0) + 1);
      });
      const groups = [...counts.values()].filter((n) => n > 1).length;
      return { toArray: () => (groups > 0 ? [{ groups }] : []) };
    },
  };
  return { indexes, db: { getCollectionNames: () => ['PartnerProfile'], getCollection: () => collection } };
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

const shapeOf = (database: ReturnType<typeof fakeDatabase>) =>
  database.indexes
    .filter((index) => index.name !== '_id_')
    .map((index) => ({ key: index.key, unique: index.unique === true, partial: index.partialFilterExpression ?? null }));

const LEGACY: readonly Doc[] = [
  { userId: 'u1', displayName: 'Éditeur' },
  { userId: 'u2', displayName: 'Éditeur' },
  { userId: 'u3', slug: 'studio', nameKey: 'studio', displayName: 'Studio' },
];

describe('2026-11-05-partner-profile-publisher-indexes.mongodb.js', () => {
  it('pose l’unique de userId, et les uniques PARTIELS de slug et nameKey, que deux profils sans adresse ne bloquent pas', () => {
    const database = fakeDatabase(LEGACY);
    const printed = run(database);
    expect(shapeOf(database)).toEqual([
      { key: { userId: 1 }, unique: true, partial: null },
      { key: { slug: 1 }, unique: true, partial: { slug: { $type: 'string' } } },
      { key: { nameKey: 1 }, unique: true, partial: { nameKey: { $type: 'string' } } },
    ]);
    expect(printed).not.toContain('quit 2');
  });

  it('se rejoue sans rien changer', () => {
    const database = fakeDatabase(LEGACY);
    run(database);
    const after = JSON.stringify(database.indexes);
    const printed = run(database);
    expect(JSON.stringify(database.indexes)).toBe(after);
    expect(printed).toContain('Créés (0) :');
  });

  it('DRY_RUN=1 n’écrit rien', () => {
    const database = fakeDatabase(LEGACY);
    const printed = run(database, { DRY_RUN: '1' });
    expect(shapeOf(database)).toEqual([]);
    expect(printed[0]).toContain('SIMULATION');
  });

  it('relève les doublons et ne pose pas l’index qu’ils bloquent : deux éditeurs pour un compte, deux éditeurs à la même adresse', () => {
    const database = fakeDatabase([
      { userId: 'u1', slug: 'studio', nameKey: 'studio', displayName: 'Studio' },
      { userId: 'u1', slug: 'studio-ab12', nameKey: 'studiob', displayName: 'Studio B' },
      { userId: 'u2', slug: 'studio', nameKey: 'studioc', displayName: 'Studio C' },
    ]);
    const printed = run(database);
    expect(shapeOf(database)).toEqual([{ key: { nameKey: 1 }, unique: true, partial: { nameKey: { $type: 'string' } } }]);
    expect(printed.some((line) => line.includes('PartnerProfile_userId_key') && line.includes('doublon'))).toBe(true);
    expect(printed.some((line) => line.includes('PartnerProfile_slug_key') && line.includes('doublon'))).toBe(true);
    expect(printed).toContain('quit 2');
  });

  it('refuse de poser l’index de nameKey tant qu’un profil nommé n’a pas de clé : le rattrapage des clés passe AVANT', () => {
    const database = fakeDatabase([...LEGACY, { userId: 'u4', displayName: 'Lens Lab' }]);
    const printed = run(database);
    expect(shapeOf(database).map((index) => index.key)).toEqual([{ userId: 1 }, { slug: 1 }]);
    expect(printed.some((line) => line.includes('PartnerProfile_nameKey_key') && line.includes('backfill-pack-publishers'))).toBe(true);
    expect(printed).toContain('quit 2');
  });

  it('remplace un index unique NON partiel de slug (posé par un ancien `db push`) par le partiel', () => {
    const database = fakeDatabase(LEGACY, [
      { name: '_id_', key: { _id: 1 } },
      { name: 'PartnerProfile_userId_key', key: { userId: 1 }, unique: true },
      { name: 'PartnerProfile_slug_key', key: { slug: 1 }, unique: true },
    ]);
    run(database);
    expect(shapeOf(database)).toEqual([
      { key: { userId: 1 }, unique: true, partial: null },
      { key: { slug: 1 }, unique: true, partial: { slug: { $type: 'string' } } },
      { key: { nameKey: 1 }, unique: true, partial: { nameKey: { $type: 'string' } } },
    ]);
  });
});
