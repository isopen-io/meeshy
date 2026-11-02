/**
 * #14247 — la migration rattrape `snapshotAuthorId` sur les copies EXISTANTES d'un contenu éphémère encore reliées à
 * leur source, ne touche rien d'autre et se rejoue sans effet. Le témoin exécute le FICHIER mongosh, dans un contexte
 * isolé, contre une collection simulée.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';

const SCRIPT = resolve(__dirname, '../../../../../../packages/shared/prisma/migrations/2026-11-01-post-snapshot-author-backfill.mongodb.js');

type Doc = Record<string, unknown> & { _id: string };

const matches = (doc: Doc, filter: Record<string, unknown>): boolean =>
  Object.entries(filter).every(([key, cond]) => {
    if (key === '$or') return (cond as Record<string, unknown>[]).some((clause) => matches(doc, clause));
    const value = doc[key];
    if (cond === null) return value === null || value === undefined;
    if (typeof cond !== 'object') return value === cond;
    const op = cond as Record<string, unknown>;
    if ('$exists' in op) return (value !== undefined) === op.$exists;
    if ('$ne' in op) return value !== op.$ne && !(op.$ne === null && value === undefined);
    if ('$gt' in op) return String(value) > String(op.$gt);
    if ('$in' in op) return (op.$in as unknown[]).includes(value);
    return false;
  });

const fakeDatabase = (docs: Doc[]) => {
  const collection = {
    find: (filter: Record<string, unknown>) => {
      const rows = () => docs.filter((doc) => matches(doc, filter)).sort((a, b) => a._id.localeCompare(b._id));
      return {
        toArray: () => rows(),
        sort: () => ({ limit: (n: number) => ({ toArray: () => rows().slice(0, n) }) }),
      };
    },
    updateOne: (filter: Record<string, unknown>, update: { $set: Record<string, unknown> }) => {
      const doc = docs.find((row) => matches(row, filter));
      if (doc) Object.assign(doc, update.$set);
    },
  };
  return { docs, db: { getCollection: () => collection } };
};

const run = (database: ReturnType<typeof fakeDatabase>, env: Record<string, string> = {}) => {
  const printed: string[] = [];
  vm.runInNewContext(readFileSync(SCRIPT, 'utf8'), { db: database.db, process: { env }, print: (line: string) => printed.push(line) });
  return printed.join('\n');
};

const monde = (): Doc[] => [
  { _id: 'a1', type: 'STORY', authorId: 'origin', repostOfId: null },
  { _id: 'a2', type: 'STORY', authorId: 'relayeur', repostOfId: null, snapshotAuthorId: 'origine-premiere' },
  { _id: 'a3', type: 'POST', authorId: 'permanent', repostOfId: null },
  { _id: 'b1', type: 'POST', authorId: 'r1', repostOfId: 'a1' },
  { _id: 'b2', type: 'POST', authorId: 'r2', repostOfId: 'a2', snapshotAuthorId: null },
  { _id: 'b3', type: 'POST', authorId: 'r3', repostOfId: 'a3' },
  { _id: 'b4', type: 'POST', authorId: 'r4', repostOfId: 'a1', snapshotAuthorId: 'deja-pose' },
];

describe('2026-11-01-post-snapshot-author-backfill.mongodb.js', () => {
  it('rattrape les copies d’une source éphémère, auteur d’origine de la source d’abord, et rien d’autre', () => {
    const database = fakeDatabase(monde());

    run(database);

    const of = (id: string) => database.docs.find((doc) => doc._id === id)?.snapshotAuthorId;
    expect([of('b1'), of('b2'), of('b3'), of('b4'), of('a1')]).toEqual(['origin', 'origine-premiere', undefined, 'deja-pose', undefined]);
  });

  it('se rejoue sans rien changer', () => {
    const database = fakeDatabase(monde());
    run(database);
    const after = JSON.stringify(database.docs);

    const printed = run(database);

    expect(JSON.stringify(database.docs)).toBe(after);
    expect(printed).toContain('rattrapées : 0');
  });

  it('en simulation (DRY_RUN=1), n’écrit rien et dit ce qu’il aurait rattrapé', () => {
    const database = fakeDatabase(monde());
    const before = JSON.stringify(database.docs);

    const printed = run(database, { DRY_RUN: '1' });

    expect(JSON.stringify(database.docs)).toBe(before);
    expect(printed).toContain('SIMULATION');
    expect(printed).toContain('rattrapées : 2');
  });
});
