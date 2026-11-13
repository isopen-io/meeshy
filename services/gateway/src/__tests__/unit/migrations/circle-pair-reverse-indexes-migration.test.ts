/**
 * #14529 — **la purge et l'export des cercles lisent leurs collections par index, dans les deux sens de la paire.**
 *
 * Un `$or` n'utilise un index que si CHACUNE de ses branches en a un. La purge d'un compte
 * (`AccountPurgeService` : `OR: [{ ownerId }, { otherId }]`, `OR: [{ userLowId }, { userHighId }]`), l'export
 * (`relationExport`) et le progrès de « Mes cercles » (`loadProgressByPartner`) avaient une branche servie par le
 * préfixe de l'unique et l'autre par RIEN : `RelationFeatureSetting.otherId` et `PairInteractionDay.userHighId` —
 * cette dernière collection compte toutes les paires de la plateforme sur 120 jours — se parcouraient en entier.
 *
 * Le témoin exécute le FICHIER mongosh lui-même (celui qui se joue sur le staging, puis en production après feu vert
 * et sauvegarde vérifiée), dans un contexte isolé, contre une base simulée ; et il lit `schema.prisma`, pour que le
 * schéma et la migration ne déclarent pas deux index différents.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';

const ROOT = resolve(__dirname, '../../../../../../packages/shared/prisma');
const SCRIPT = resolve(ROOT, 'migrations/2026-11-13-circle-pair-reverse-indexes.mongodb.js');
const SCHEMA = resolve(ROOT, 'schema.prisma');

type Index = { readonly name: string; readonly key: Record<string, number>; readonly unique?: boolean };

const ID_ONLY: readonly Index[] = [{ name: '_id_', key: { _id: 1 } }];

const PRESENT: Readonly<Record<string, readonly Index[]>> = {
  RelationFeatureSetting: [...ID_ONLY, { name: 'RelationFeatureSetting_ownerId_otherId_key', key: { ownerId: 1, otherId: 1 }, unique: true }],
  PairInteractionDay: [
    ...ID_ONLY,
    { name: 'PairInteractionDay_userLowId_userHighId_day_key', key: { userLowId: 1, userHighId: 1, day: 1 }, unique: true },
    { name: 'PairInteractionDay_day_idx', key: { day: 1 } },
  ],
};

const fakeDatabase = (seed: Readonly<Record<string, readonly Index[]>>) => {
  const indexes = new Map<string, Index[]>(Object.entries(seed).map(([collection, list]) => [collection, [...list]]));
  const journal: string[] = [];
  const collectionOf = (name: string) => ({
    getIndexes: () => [...(indexes.get(name) ?? [])],
    dropIndex: (indexName: string) => {
      journal.push(`drop ${name}.${indexName}`);
      indexes.set(name, (indexes.get(name) ?? []).filter((index) => index.name !== indexName));
    },
    createIndex: (key: Record<string, number>, options: { name: string; unique?: boolean }) => {
      journal.push(`create ${name}.${options.name}`);
      indexes.set(name, [...(indexes.get(name) ?? []), { key, ...options }]);
    },
  });
  return { indexes, journal, db: { getCollectionNames: () => [...indexes.keys()], getCollection: collectionOf } };
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

const keysOf = (database: ReturnType<typeof fakeDatabase>, collection: string) =>
  (database.indexes.get(collection) ?? []).map((index) => JSON.stringify(index.key));

const modelBlock = (model: string) => {
  const schema = readFileSync(SCHEMA, 'utf8');
  const start = schema.indexOf(`model ${model} {`);
  return schema.slice(start, schema.indexOf('\n}', start));
};

describe('2026-11-13-circle-pair-reverse-indexes.mongodb.js', () => {
  it('pose l’index de otherId et celui de (userHighId, day), sous les noms que Prisma leur donne', () => {
    const database = fakeDatabase(PRESENT);

    const printed = run(database);

    expect(database.indexes.get('RelationFeatureSetting')).toContainEqual({ name: 'RelationFeatureSetting_otherId_idx', key: { otherId: 1 } });
    expect(database.indexes.get('PairInteractionDay')).toContainEqual({ name: 'PairInteractionDay_userHighId_day_idx', key: { userHighId: 1, day: 1 } });
    expect(printed).not.toContain('quit 2');
  });

  it('chaque branche du $or de la purge a désormais un index dont elle est le préfixe', () => {
    const database = fakeDatabase(PRESENT);
    run(database);

    const servedBy = (collection: string, field: string) =>
      (database.indexes.get(collection) ?? []).some((index) => Object.keys(index.key)[0] === field);

    expect(['ownerId', 'otherId'].every((field) => servedBy('RelationFeatureSetting', field))).toBe(true);
    expect(['userLowId', 'userHighId'].every((field) => servedBy('PairInteractionDay', field))).toBe(true);
  });

  it('ne touche à aucun index existant : rien n’est supprimé, l’unique de paire reste unique', () => {
    const database = fakeDatabase(PRESENT);

    run(database);

    expect(database.journal.filter((entry) => entry.startsWith('drop'))).toEqual([]);
    expect(database.indexes.get('RelationFeatureSetting')).toContainEqual(PRESENT.RelationFeatureSetting[1]);
    expect(database.indexes.get('PairInteractionDay')).toEqual(expect.arrayContaining([...PRESENT.PairInteractionDay]));
  });

  it('un index de même clé posé à la main est reconnu par sa CLÉ, pas par son nom, et laissé en place', () => {
    const database = fakeDatabase({
      ...PRESENT,
      RelationFeatureSetting: [...PRESENT.RelationFeatureSetting, { name: 'autre_nom', key: { otherId: 1 } }],
    });

    const printed = run(database);

    expect(keysOf(database, 'RelationFeatureSetting').filter((key) => key === '{"otherId":1}')).toHaveLength(1);
    expect(database.journal).not.toContain('create RelationFeatureSetting.RelationFeatureSetting_otherId_idx');
    expect(printed.join('\n')).toContain('RelationFeatureSetting.autre_nom');
  });

  it('se rejoue sans rien changer', () => {
    const database = fakeDatabase(PRESENT);
    run(database);
    const after = JSON.stringify([...database.indexes.entries()]);

    const printed = run(database);

    expect(JSON.stringify([...database.indexes.entries()])).toBe(after);
    expect(printed).toContain('Créés (0) :');
  });

  it('DRY_RUN=1 n’écrit rien et le dit', () => {
    const database = fakeDatabase(PRESENT);

    const printed = run(database, { DRY_RUN: '1' });

    expect(database.journal).toEqual([]);
    expect(printed[0]).toContain('SIMULATION');
    expect(printed.join('\n')).toContain('RelationFeatureSetting_otherId_idx');
  });

  it('sur des collections encore absentes, les crée avec leur index (comme Prisma le ferait)', () => {
    const database = fakeDatabase({});

    run(database);

    expect(keysOf(database, 'RelationFeatureSetting')).toContain('{"otherId":1}');
    expect(keysOf(database, 'PairInteractionDay')).toContain('{"userHighId":1,"day":1}');
  });

  it('schema.prisma déclare les mêmes index que la migration pose', () => {
    expect(modelBlock('RelationFeatureSetting')).toMatch(/@@index\(\[otherId\]\)/);
    expect(modelBlock('PairInteractionDay')).toMatch(/@@index\(\[userHighId, day\]\)/);
  });
});
