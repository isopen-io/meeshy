/**
 * #14227 — **les appartenances de communauté se lisent par index, jamais par un parcours complet de la collection.**
 *
 * `CommunityMember` ne portait qu'un index, `(communityId, isActive, joinedAt)` : « mes communautés »
 * (`{ userId, isActive }`), l'accès d'un post COMMUNITY, la co-appartenance de deux personnes et le contrôle
 * d'accès de chaque route (`{ communityId, userId }`) n'avaient pas d'index dont ils soient le préfixe — ou
 * parcouraient tout l'effectif de la communauté pour une seule personne.
 *
 * Le témoin exécute le FICHIER mongosh lui-même (celui qui se joue sur le staging, puis en production après feu
 * vert et sauvegarde vérifiée), dans un contexte isolé, contre une base simulée ; et il lit `schema.prisma`, pour
 * que le schéma et la migration ne déclarent pas deux index différents.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';

const ROOT = resolve(__dirname, '../../../../../../packages/shared/prisma');
const SCRIPT = resolve(ROOT, 'migrations/2026-11-19-community-member-lookup-indexes.mongodb.js');
const SCHEMA = resolve(ROOT, 'schema.prisma');

type Index = {
  readonly name: string;
  readonly key: Record<string, number>;
  readonly unique?: boolean;
  readonly sparse?: boolean;
  readonly partialFilterExpression?: Record<string, unknown>;
};

const PRESENT: Readonly<Record<string, readonly Index[]>> = {
  CommunityMember: [
    { name: '_id_', key: { _id: 1 } },
    { name: 'CommunityMember_communityId_isActive_joinedAt_idx', key: { communityId: 1, isActive: 1, joinedAt: 1 } },
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

const keysOf = (database: ReturnType<typeof fakeDatabase>) =>
  (database.indexes.get('CommunityMember') ?? []).map((index) => JSON.stringify(index.key));

const modelBlock = (model: string) => {
  const schema = readFileSync(SCHEMA, 'utf8');
  const start = schema.indexOf(`model ${model} {`);
  return schema.slice(start, schema.indexOf('\n}', start));
};

describe('2026-11-19-community-member-lookup-indexes.mongodb.js', () => {
  it('pose (userId, isActive) et (communityId, userId), sous les noms que Prisma leur donne', () => {
    const database = fakeDatabase(PRESENT);

    const printed = run(database);

    expect(database.indexes.get('CommunityMember')).toContainEqual({ name: 'CommunityMember_userId_isActive_idx', key: { userId: 1, isActive: 1 } });
    expect(database.indexes.get('CommunityMember')).toContainEqual({ name: 'CommunityMember_communityId_userId_idx', key: { communityId: 1, userId: 1 } });
    expect(printed).not.toContain('quit 2');
  });

  it('les lectures par personne ont un index dont userId est le préfixe, et la paire un index qui la couvre', () => {
    const database = fakeDatabase(PRESENT);
    run(database);

    const fieldsOf = (index: Index) => Object.keys(index.key);
    const list = database.indexes.get('CommunityMember') ?? [];

    expect(list.some((index) => fieldsOf(index)[0] === 'userId')).toBe(true);
    expect(list.some((index) => fieldsOf(index).slice(0, 2).join() === 'communityId,userId')).toBe(true);
  });

  it('ne touche à aucun index existant et ne pose aucun unique (#16696 tranche les doublons à part)', () => {
    const database = fakeDatabase(PRESENT);

    run(database);

    expect(database.journal.filter((entry) => entry.startsWith('drop'))).toEqual([]);
    expect(database.indexes.get('CommunityMember')).toEqual(expect.arrayContaining([...PRESENT.CommunityMember]));
    expect((database.indexes.get('CommunityMember') ?? []).filter((index) => index.unique)).toEqual([]);
  });

  it('un index de même clé posé à la main est reconnu par sa CLÉ, pas par son nom, et laissé en place', () => {
    const database = fakeDatabase({
      CommunityMember: [...PRESENT.CommunityMember, { name: 'a_la_main', key: { userId: 1, isActive: 1 } }],
    });

    const printed = run(database);

    expect(keysOf(database).filter((key) => key === '{"userId":1,"isActive":1}')).toHaveLength(1);
    expect(database.journal).not.toContain('create CommunityMember.CommunityMember_userId_isActive_idx');
    expect(printed.join('\n')).toContain('CommunityMember.a_la_main');
  });

  it('un index de même clé mais PARTIEL ou ÉPARS ne sert pas toutes les lectures : signalé (sortie 2), jamais remplacé', () => {
    const partial = { name: 'partiel', key: { communityId: 1, userId: 1 }, partialFilterExpression: { isActive: true } };
    const database = fakeDatabase({ CommunityMember: [...PRESENT.CommunityMember, partial] });

    const printed = run(database);

    expect(database.journal).not.toContain('create CommunityMember.CommunityMember_communityId_userId_idx');
    expect(database.journal.filter((entry) => entry.startsWith('drop'))).toEqual([]);
    expect(printed.join('\n')).toContain('CommunityMember.partiel');
    expect(printed).toContain('quit 2');
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
    expect(printed.join('\n')).toContain('CommunityMember_userId_isActive_idx');
  });

  it('sur une collection encore absente, la crée avec ses index (comme Prisma le ferait)', () => {
    const database = fakeDatabase({});

    run(database);

    expect(keysOf(database)).toEqual(expect.arrayContaining(['{"userId":1,"isActive":1}', '{"communityId":1,"userId":1}']));
  });

  it('schema.prisma déclare les mêmes index que la migration pose', () => {
    expect(modelBlock('CommunityMember')).toMatch(/@@index\(\[userId, isActive\]\)/);
    expect(modelBlock('CommunityMember')).toMatch(/@@index\(\[communityId, userId\]\)/);
  });
});
