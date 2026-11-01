/**
 * #14254 — **les chemins qui lient une `Notification` à une publication sont indexés**, par une migration
 * idempotente (#9035), et ce sont EXACTEMENT ceux que filtre le retrait (`POST_NOTIFICATION_LINK_PATHS`) : un chemin
 * ajouté au filtre sans son index rougit ici. Le témoin exécute le FICHIER mongosh, dans un contexte isolé, contre
 * des index simulés.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';
import { POST_NOTIFICATION_LINK_PATHS } from '../../../services/posts/retractPostNotifications';

const SCRIPT = resolve(__dirname, '../../../../../../packages/shared/prisma/migrations/2026-11-01-notification-post-link-indexes.mongodb.js');

type Index = { readonly name: string; readonly key: Record<string, number>; readonly sparse?: boolean };

const fakeDatabase = (seed: readonly Index[]) => {
  const indexes: Index[] = [...seed];
  const planOf = () =>
    indexes.some((index) => index.name !== '_id_')
      ? { stage: 'FETCH', inputStage: { stage: 'OR', inputStages: [{ stage: 'IXSCAN' }] } }
      : { stage: 'COLLSCAN' };
  const notification = {
    getIndexes: () => [...indexes],
    createIndex: (key: Record<string, number>, options: { name: string; sparse?: boolean }) => indexes.push({ key, ...options }),
    find: () => ({
      sort: () => ({ limit: () => ({ toArray: () => [{ context: { postId: 'p-1' } }] }) }),
      explain: () => ({ queryPlanner: { winningPlan: planOf() }, executionStats: { totalDocsExamined: 0, nReturned: 0, executionTimeMillis: 0 } }),
    }),
  };
  return {
    indexes,
    db: { getCollectionNames: () => ['Notification'], getCollection: () => notification, Notification: notification },
  };
};

const run = (database: ReturnType<typeof fakeDatabase>, env: Record<string, string> = {}) => {
  const printed: string[] = [];
  vm.runInNewContext(readFileSync(SCRIPT, 'utf8'), { db: database.db, process: { env }, print: (line: string) => printed.push(line) });
  return printed;
};

const ID_ONLY: readonly Index[] = [{ name: '_id_', key: { _id: 1 } }];

describe('2026-11-01-notification-post-link-indexes.mongodb.js', () => {
  it('indexe chaque chemin que filtre le retrait des notifications d’une publication, et seulement ceux-là', () => {
    const database = fakeDatabase(ID_ONLY);

    run(database);

    const created = database.indexes.filter((index) => index.name !== '_id_');
    expect(created.map((index) => Object.keys(index.key))).toEqual(POST_NOTIFICATION_LINK_PATHS.map((path) => [path]));
    expect(created.every((index) => index.sparse === true)).toBe(true);
  });

  it('se rejoue sans rien changer : un index déjà posé est reconnu à sa CLÉ, quel que soit son nom', () => {
    const database = fakeDatabase([...ID_ONLY, { name: 'pose_a_la_main', key: { 'context.postId': 1 } }]);

    run(database);
    const printed = run(database);

    expect(database.indexes).toHaveLength(1 + POST_NOTIFICATION_LINK_PATHS.length);
    expect(printed.join('\n')).toContain(`Déjà présents (${POST_NOTIFICATION_LINK_PATHS.length})`);
  });

  // Plan SIMULÉ, à la forme que rend MongoDB 8 pour le filtre du retrait (`$or` + `type: { $ne }`), relevée sur un mongod réel.
  it('mesure le plan du retrait avant et après', () => {
    const printed = run(fakeDatabase(ID_ONLY)).join('\n');

    expect(printed).toContain('Plan avant : COLLSCAN');
    expect(printed).toContain('Plan après : FETCH > OR > IXSCAN');
  });

  it('en simulation (DRY_RUN=1), n’écrit rien et dit ce qu’il aurait créé', () => {
    const database = fakeDatabase(ID_ONLY);

    const printed = run(database, { DRY_RUN: '1' }).join('\n');

    expect(database.indexes).toHaveLength(1);
    expect(printed).toContain('SIMULATION');
    expect(printed).toContain('+ Notification.Notification_metadata_originalPostId_idx');
    expect(printed).not.toContain('Plan après');
  });
});
