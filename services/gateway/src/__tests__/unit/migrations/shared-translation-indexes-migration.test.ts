/**
 * #9899 — **la migration pose les index de `SharedTranslation` et se rejoue sans rien changer.**
 *
 * L'unique `(messageId, targetLanguage, sourceVersion)` est l'arbitre du « premier partage gagne » : la route
 * crée d'abord et ne relit que sur la violation d'unicité, or Prisma ne crée AUCUN index sur MongoDB. Sans le
 * script, la création ne lève jamais et deux partages simultanés sont rangés tous deux. Le témoin exécute le
 * FICHIER mongosh lui-même (celui que le porteur rejouera en staging puis en production), dans un contexte isolé,
 * contre des index simulés — il n'est joué nulle part ailleurs — et le confronte au `schema.prisma`, qui déclare
 * les mêmes index : le script et le schéma ne peuvent pas dériver l'un de l'autre sans qu'il tombe.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';

const MIGRATIONS = resolve(__dirname, '../../../../../../packages/shared/prisma');
const SCRIPT = resolve(MIGRATIONS, 'migrations/2026-10-10-shared-translation-indexes.mongodb.js');
const SCHEMA = resolve(MIGRATIONS, 'schema.prisma');

const UNIQUE = 'SharedTranslation_messageId_targetLanguage_sourceVersion_key';
const READING = 'SharedTranslation_conversationId_messageId_idx';

type Index = { readonly name: string; readonly key: Record<string, number>; readonly unique?: boolean };

const ID_ONLY: readonly Index[] = [{ name: '_id_', key: { _id: 1 } }];

const fakeDatabase = (seed: Readonly<Record<string, readonly Index[]>>, duplicateGroups = 0) => {
  const indexes = new Map<string, Index[]>(Object.entries(seed).map(([collection, list]) => [collection, [...list]]));
  const aggregated: string[] = [];
  const collectionOf = (name: string) => ({
    getIndexes: () => [...(indexes.get(name) ?? [])],
    dropIndex: (indexName: string) => indexes.set(name, (indexes.get(name) ?? []).filter((index) => index.name !== indexName)),
    createIndex: (key: Record<string, number>, options: { name: string; unique?: boolean }) =>
      indexes.set(name, [...(indexes.get(name) ?? []), { key, ...options }]),
    aggregate: () => {
      aggregated.push(name);
      return { toArray: () => (duplicateGroups > 0 ? [{ groups: duplicateGroups }] : []) };
    },
  });
  return { indexes, aggregated, db: { getCollectionNames: () => [...indexes.keys()], getCollection: collectionOf } };
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
  return { printed, quits, text: printed.join('\n') };
};

const indexesOf = (database: ReturnType<typeof fakeDatabase>): readonly Index[] => database.indexes.get('SharedTranslation') ?? [];
const named = (database: ReturnType<typeof fakeDatabase>, name: string) => indexesOf(database).find((index) => index.name === name);

describe('2026-10-10-shared-translation-indexes.mongodb.js', () => {
  it('pose l’unique (messageId, targetLanguage, sourceVersion) et l’index de lecture, sous les noms que Prisma leur donnerait', () => {
    const database = fakeDatabase({ SharedTranslation: ID_ONLY });

    run(database);

    const unique = named(database, UNIQUE);
    expect(unique?.unique).toBe(true);
    expect(Object.keys(unique?.key ?? {})).toEqual(['messageId', 'targetLanguage', 'sourceVersion']);
    const reading = named(database, READING);
    expect(reading?.unique).toBeUndefined();
    expect(Object.keys(reading?.key ?? {})).toEqual(['conversationId', 'messageId']);
  });

  it('pose les deux sur une collection qui n’existe pas encore, sans la lire', () => {
    const database = fakeDatabase({});

    const { quits } = run(database);

    expect(indexesOf(database).map((index) => index.name).sort()).toEqual([READING, UNIQUE]);
    expect(database.aggregated).toEqual([]);
    expect(quits).toEqual([]);
  });

  it('se rejoue sans rien changer : le second passage ne crée ni ne remplace aucun index', () => {
    const database = fakeDatabase({ SharedTranslation: ID_ONLY });
    run(database);
    const after = JSON.stringify([...database.indexes.entries()]);

    const { text, quits } = run(database);

    expect(JSON.stringify([...database.indexes.entries()])).toBe(after);
    expect(text).toContain('Créés (0) :');
    expect(text).toContain('Déjà présents (2)');
    expect(quits).toEqual([]);
  });

  it('reconnaît un index à sa CLÉ, quel que soit le nom qu’une main lui a donné', () => {
    const database = fakeDatabase({
      SharedTranslation: [
        ...ID_ONLY,
        { name: 'unique_a_la_main', key: { messageId: 1, targetLanguage: 1, sourceVersion: 1 }, unique: true },
        { name: 'lecture_a_la_main', key: { conversationId: 1, messageId: 1 } },
      ],
    });

    const { text } = run(database);

    expect(indexesOf(database)).toHaveLength(3);
    expect(text).toContain('Déjà présents (2)');
  });

  it('un index voisin (un préfixe, ou la même clé dans un autre ordre) ne remplace ni l’unique ni la lecture', () => {
    const database = fakeDatabase({
      SharedTranslation: [
        ...ID_ONLY,
        { name: 'a', key: { messageId: 1 } },
        { name: 'b', key: { messageId: 1, sourceVersion: 1, targetLanguage: 1 }, unique: true },
        { name: 'c', key: { messageId: 1, conversationId: 1 } },
      ],
    });

    run(database);

    expect(named(database, UNIQUE)?.unique).toBe(true);
    expect(named(database, READING)).toBeDefined();
    expect(named(database, 'b')?.unique).toBe(true);
  });

  it('remplace un index ORDINAIRE posé sur la clé de l’unique : sans unicité, « le premier gagne » ne tiendrait pas', () => {
    const database = fakeDatabase({
      SharedTranslation: [...ID_ONLY, { name: 'ordinaire', key: { messageId: 1, targetLanguage: 1, sourceVersion: 1 } }],
    });

    const { text } = run(database);

    expect(named(database, 'ordinaire')).toBeUndefined();
    expect(named(database, UNIQUE)?.unique).toBe(true);
    expect(text).toContain(`+ SharedTranslation.${UNIQUE} (remplace ordinaire, non unique)`);
  });

  describe('des doublons déjà rangés', () => {
    it('signale l’unique BLOQUÉ, sort en code 2, et ne force rien — l’index de lecture se pose quand même', () => {
      const database = fakeDatabase({ SharedTranslation: ID_ONLY }, 3);

      const { text, quits } = run(database);

      expect(named(database, UNIQUE)).toBeUndefined();
      expect(named(database, READING)).toBeDefined();
      expect(text).toContain('Bloqués par des doublons (1) :');
      expect(text).toContain(`! SharedTranslation.${UNIQUE} — 3 groupe(s) en doublon`);
      expect(quits).toEqual([2]);
    });

    it('ne supprime pas l’index ordinaire qu’il ne peut pas remplacer', () => {
      const database = fakeDatabase(
        { SharedTranslation: [...ID_ONLY, { name: 'ordinaire', key: { messageId: 1, targetLanguage: 1, sourceVersion: 1 } }] },
        1,
      );

      run(database);

      expect(named(database, 'ordinaire')).toBeDefined();
      expect(named(database, UNIQUE)).toBeUndefined();
    });
  });

  it('en simulation (DRY_RUN=1), n’écrit rien et dit ce qu’il aurait créé', () => {
    const database = fakeDatabase({ SharedTranslation: ID_ONLY });

    const { text } = run(database, { DRY_RUN: '1' });

    expect(indexesOf(database)).toHaveLength(1);
    expect(text).toContain('SIMULATION');
    expect(text).toContain(`+ SharedTranslation.${UNIQUE}`);
    expect(text).toContain(`+ SharedTranslation.${READING}`);
  });

  describe('contre schema.prisma', () => {
    const modelBlock = (): string => {
      const source = readFileSync(SCHEMA, 'utf8');
      const start = source.indexOf('model SharedTranslation {');
      return source.slice(start, source.indexOf('\n}', start));
    };
    const fieldLists = (directive: '@@unique' | '@@index'): readonly (readonly string[])[] =>
      [...modelBlock().matchAll(new RegExp(`${directive}\\(\\[([^\\]]+)\\]\\)`, 'g'))].map((match) =>
        match[1].split(',').map((field) => field.trim()),
      );

    it('pose exactement les index que le modèle déclare, dans l’ordre de ses champs', () => {
      const database = fakeDatabase({});

      run(database);

      const posed = indexesOf(database).map((index) => ({ fields: Object.keys(index.key), unique: index.unique === true }));
      const declared = [
        ...fieldLists('@@unique').map((fields) => ({ fields, unique: true })),
        ...fieldLists('@@index').map((fields) => ({ fields, unique: false })),
      ];
      expect(declared).toHaveLength(2);
      expect(posed).toEqual(expect.arrayContaining(declared));
      expect(posed).toHaveLength(declared.length);
    });

    it('nomme chaque index comme Prisme : <Modèle>_<champs>_key pour un unique, _idx sinon', () => {
      const database = fakeDatabase({});

      run(database);

      const expected = [
        ...fieldLists('@@unique').map((fields) => `SharedTranslation_${fields.join('_')}_key`),
        ...fieldLists('@@index').map((fields) => `SharedTranslation_${fields.join('_')}_idx`),
      ];
      expect(indexesOf(database).map((index) => index.name).sort()).toEqual([...expected].sort());
    });
  });
});
