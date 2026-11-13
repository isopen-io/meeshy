/**
 * #13977 — **la migration des index de `UserRelation` ne retire jamais l'index de paire qu'elle vient renforcer.**
 *
 * Quand un index NON unique de même clé `(userLowId, userHighId)` existe déjà, le script le supprimait puis créait
 * l'unique : entre les deux, la collection n'avait plus d'index de paire, et un doublon inséré par la passerelle en
 * marche entre le comptage et la création faisait échouer `createIndex` APRÈS le `dropIndex` — collection laissée
 * sans index, rejeu bloqué. Le témoin exécute le FICHIER mongosh lui-même, dans un contexte isolé, contre une base
 * simulée qui tient le verrou `prepareUnique` et la conversion `collMod` comme MongoDB (6.0+) : l'index se convertit
 * EN PLACE, le verrou précède le comptage des doublons, et un doublon laisse l'index où il était.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';

const SCRIPT = resolve(
  __dirname,
  '../../../../../../packages/shared/prisma/migrations/2026-10-31-user-relation-indexes.mongodb.js',
);

const PAIR = 'UserRelation_userLowId_userHighId_key';
const HIGH = 'UserRelation_userHighId_idx';
const ATOM = 'AtomLink_atomId_electronId_key';
const PAIR_KEY = { userLowId: 1, userHighId: 1 };

type Index = {
  readonly name: string;
  readonly key: Record<string, number>;
  readonly unique?: boolean;
  readonly prepareUnique?: boolean;
};

const ID_ONLY: readonly Index[] = [{ name: '_id_', key: { _id: 1 } }];

const sameKey = (a: Record<string, number>, b: Record<string, number>) => JSON.stringify(a) === JSON.stringify(b);

const fakeDatabase = (
  seed: Readonly<Record<string, readonly Index[]>>,
  options: { readonly duplicatesBefore?: number; readonly duplicatesAfterLock?: number } = {},
) => {
  const indexes = new Map<string, Index[]>(Object.entries(seed).map(([collection, list]) => [collection, [...list]]));
  const journal: string[] = [];
  const locked = (collection: string) =>
    (indexes.get(collection) ?? []).some((index) => index.prepareUnique === true);
  const duplicatesOf = (collection: string) =>
    locked(collection) ? options.duplicatesAfterLock ?? 0 : options.duplicatesBefore ?? 0;
  const collectionOf = (name: string) => ({
    getIndexes: () => [...(indexes.get(name) ?? [])],
    dropIndex: (indexName: string) => {
      journal.push(`drop ${name}.${indexName}`);
      indexes.set(name, (indexes.get(name) ?? []).filter((index) => index.name !== indexName));
    },
    createIndex: (key: Record<string, number>, createOptions: { name: string; unique?: boolean }) => {
      journal.push(`create ${name}.${createOptions.name}`);
      if (createOptions.unique && duplicatesOf(name) > 0) throw new Error('E11000 duplicate key error');
      indexes.set(name, [...(indexes.get(name) ?? []), { key, ...createOptions }]);
    },
    aggregate: () => {
      journal.push(`count ${name}`);
      const groups = duplicatesOf(name);
      return { toArray: () => (groups > 0 ? [{ groups }] : []) };
    },
  });
  const runCommand = (command: {
    collMod: string;
    index: { keyPattern: Record<string, number>; prepareUnique?: boolean; unique?: boolean };
  }) => {
    const { collMod: name, index } = command;
    const list = indexes.get(name) ?? [];
    const target = list.find((candidate) => sameKey(candidate.key, index.keyPattern));
    if (!target) return { ok: 0, errmsg: 'index not found' };
    if (index.prepareUnique) {
      journal.push(`lock ${name}.${target.name}`);
      indexes.set(name, list.map((candidate) => (candidate === target ? { ...candidate, prepareUnique: true } : candidate)));
      return { ok: 1 };
    }
    if (index.unique) {
      journal.push(`convert ${name}.${target.name}`);
      if (!target.prepareUnique) return { ok: 0, errmsg: 'prepareUnique required' };
      if (duplicatesOf(name) > 0) return { ok: 0, errmsg: 'Cannot convert the index to unique', violations: [] };
      indexes.set(name, list.map((candidate) => (candidate === target ? { ...candidate, unique: true } : candidate)));
      return { ok: 1 };
    }
    return { ok: 0, errmsg: 'unsupported' };
  };
  return {
    indexes,
    journal,
    db: { getCollectionNames: () => [...indexes.keys()], getCollection: collectionOf, runCommand },
  };
};

const run = (database: ReturnType<typeof fakeDatabase>, env: Record<string, string> = {}) => {
  const printed: string[] = [];
  const quits: number[] = [];
  vm.runInNewContext(readFileSync(SCRIPT, 'utf8'), {
    db: database.db,
    process: { env },
    print: (line: string) => printed.push(line),
    quit: (code: number) => quits.push(code),
  });
  return { quits, text: printed.join('\n') };
};

const pairIndexOf = (database: ReturnType<typeof fakeDatabase>) =>
  (database.indexes.get('UserRelation') ?? []).find((index) => sameKey(index.key, PAIR_KEY));

const withLegacyPairIndex = () => ({
  UserRelation: [...ID_ONLY, { name: 'paire_a_la_main', key: PAIR_KEY }, { name: HIGH, key: { userHighId: 1 } }],
  AtomLink: [...ID_ONLY, { name: ATOM, key: { atomId: 1, electronId: 1 }, unique: true }],
});

describe('2026-10-31-user-relation-indexes.mongodb.js', () => {
  it('pose les trois index sur des collections neuves, sous les noms que Prisma leur donnerait', () => {
    const database = fakeDatabase({ UserRelation: ID_ONLY, AtomLink: ID_ONLY });

    const { quits } = run(database);

    expect(pairIndexOf(database)).toMatchObject({ name: PAIR, unique: true });
    expect((database.indexes.get('UserRelation') ?? []).map((index) => index.name)).toContain(HIGH);
    expect((database.indexes.get('AtomLink') ?? []).find((index) => index.name === ATOM)?.unique).toBe(true);
    expect(quits).toEqual([]);
  });

  it('convertit EN PLACE un index de paire non unique : il n’est jamais supprimé', () => {
    const database = fakeDatabase(withLegacyPairIndex());

    const { text, quits } = run(database);

    expect(database.journal.filter((entry) => entry.startsWith('drop'))).toEqual([]);
    expect(pairIndexOf(database)).toMatchObject({ name: 'paire_a_la_main', unique: true });
    expect(text).toContain('UserRelation.paire_a_la_main');
    expect(quits).toEqual([]);
  });

  it('pose le verrou prepareUnique AVANT de compter les doublons, puis convertit', () => {
    const database = fakeDatabase(withLegacyPairIndex());

    run(database);

    const userRelation = database.journal.filter((entry) => entry.includes('UserRelation'));
    expect(userRelation).toEqual([
      'lock UserRelation.paire_a_la_main',
      'count UserRelation',
      'convert UserRelation.paire_a_la_main',
    ]);
  });

  it('des doublons déjà là : l’index de paire reste en place, verrouillé, et le script le signale (sortie 2)', () => {
    const database = fakeDatabase(withLegacyPairIndex(), { duplicatesBefore: 3, duplicatesAfterLock: 3 });

    const { text, quits } = run(database);

    expect(pairIndexOf(database)).toMatchObject({ name: 'paire_a_la_main', prepareUnique: true });
    expect(pairIndexOf(database)?.unique).toBeUndefined();
    expect(text).toContain('3 groupe(s) en doublon');
    expect(quits).toEqual([2]);
  });

  it('un doublon glissé pendant la conversion ne retire pas l’index : il est signalé, rien n’est perdu', () => {
    const database = fakeDatabase(withLegacyPairIndex());
    const convert = database.db.runCommand;
    const racing = {
      ...database,
      db: {
        ...database.db,
        runCommand: (command: Parameters<typeof convert>[0]) =>
          command.index.unique ? { ok: 0, errmsg: 'Cannot convert the index to unique', violations: [{ ids: [] }] } : convert(command),
      },
    };

    const { text, quits } = run(racing);

    expect(pairIndexOf(database)).toMatchObject({ name: 'paire_a_la_main' });
    expect(text).toContain('UserRelation');
    expect(quits).toEqual([2]);
  });

  it('en simulation (DRY_RUN=1), ne verrouille, ne convertit ni ne crée rien', () => {
    const database = fakeDatabase(withLegacyPairIndex());
    const before = JSON.stringify([...database.indexes.entries()]);

    const { text } = run(database, { DRY_RUN: '1' });

    expect(JSON.stringify([...database.indexes.entries()])).toBe(before);
    expect(database.journal.filter((entry) => !entry.startsWith('count'))).toEqual([]);
    expect(text).toContain('SIMULATION');
  });

  it('se rejoue sans rien changer', () => {
    const database = fakeDatabase(withLegacyPairIndex());
    run(database);
    const after = JSON.stringify([...database.indexes.entries()]);

    const { text, quits } = run(database);

    expect(JSON.stringify([...database.indexes.entries()])).toBe(after);
    expect(text).toContain('Déjà présents (3)');
    expect(quits).toEqual([]);
  });
});
