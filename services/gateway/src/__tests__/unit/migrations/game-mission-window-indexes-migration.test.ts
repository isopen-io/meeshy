/**
 * #9539 — **la migration d'index des missions personnelles pose son index `startsAt` et se rejoue sans rien
 * changer.** Le témoin exécute le FICHIER mongosh lui-même (celui que le porteur rejouera en staging), dans un
 * contexte isolé, contre des index simulés.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';

const SCRIPT = resolve(__dirname, '../../../../../../packages/shared/prisma/migrations/2026-10-06-game-mission-window-indexes.mongodb.js');

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

describe('2026-10-06-game-mission-window-indexes.mongodb.js', () => {
  it('pose l’index `startsAt` de DailyMission', () => {
    const database = fakeDatabase({ DailyMission: [{ name: '_id_', key: { _id: 1 } }] });

    run(database);

    expect(database.indexes.get('DailyMission')?.map((i) => i.key)).toContainEqual({ startsAt: 1 });
  });

  it('se rejoue sans rien changer : l’index déjà posé est reconnu à sa clé', () => {
    const database = fakeDatabase({ DailyMission: [{ name: 'DailyMission_startsAt_idx', key: { startsAt: 1 } }] });

    const printed = run(database);

    expect(database.indexes.get('DailyMission')).toHaveLength(1);
    expect(printed.join('\n')).toContain('Déjà présents (1)');
  });

  it('en simulation (DRY_RUN=1), n’écrit rien', () => {
    const database = fakeDatabase({ DailyMission: [{ name: '_id_', key: { _id: 1 } }] });

    run(database, { DRY_RUN: '1' });

    expect(database.indexes.get('DailyMission')).toHaveLength(1);
  });

  it('crée la collection absente sans lever (première pose)', () => {
    const database = fakeDatabase({});
    expect(() => run(database)).not.toThrow();
  });
});
