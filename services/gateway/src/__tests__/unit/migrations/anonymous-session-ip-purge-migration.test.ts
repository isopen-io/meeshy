/**
 * #9342 — **l'IP qu'une session anonyme conservait avant #9342 se purge une
 * fois pour toutes, et rien d'autre ne quitte la ligne.**
 *
 * Le témoin exécute le FICHIER mongosh lui-même (celui que le porteur rejouera
 * en staging puis en production), dans un contexte isolé, contre une
 * collection simulée : c'est le script qui est jugé, jamais une copie.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';

const SCRIPT = resolve(
  __dirname,
  '../../../../../../packages/shared/prisma/migrations/2026-10-04-anonymous-session-ip-purge.mongodb.js',
);

type Doc = Record<string, unknown>;
type Filter = Record<string, unknown>;
type Update = { readonly $unset?: Record<string, unknown>; readonly $set?: Doc };

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const segments = (path: string): readonly string[] => path.split('.');

const readPath = (doc: Doc, path: string): { readonly present: boolean; readonly value: unknown } =>
  segments(path).reduce<{ present: boolean; value: unknown }>(
    (cursor, key) =>
      cursor.present && isPlainObject(cursor.value) && key in cursor.value
        ? { present: true, value: cursor.value[key] }
        : { present: false, value: undefined },
    { present: true, value: doc },
  );

const unsetPath = (doc: Doc, path: string): boolean => {
  const keys = segments(path);
  const parent = readPath(doc, keys.slice(0, -1).join('.'));
  const leaf = keys[keys.length - 1];
  if (!parent.present || !isPlainObject(parent.value) || !(leaf in parent.value)) return false;
  delete parent.value[leaf];
  return true;
};

const matchesOperator = (field: { present: boolean; value: unknown }, op: string, arg: unknown): boolean => {
  switch (op) {
    case '$exists':
      return field.present === arg;
    case '$gt':
      return field.present && String(field.value) > String(arg);
    case '$in':
      return Array.isArray(arg) && arg.includes(field.value);
    default:
      throw new Error(`opérateur non simulé : ${op}`);
  }
};

const matches = (doc: Doc, filter: Filter): boolean =>
  Object.entries(filter).every(([path, condition]) => {
    const field = readPath(doc, path);
    return isPlainObject(condition)
      ? Object.entries(condition).every(([op, arg]) => matchesOperator(field, op, arg))
      : field.present && field.value === condition;
  });

const project = (doc: Doc, projection: Record<string, number> | undefined): Doc =>
  projection ? Object.fromEntries(Object.entries(doc).filter(([field]) => projection[field] === 1)) : structuredClone(doc);

/** La seule chose mutable du témoin : la collection qu'une migration modifie. */
const fakeDatabase = (seed: readonly Doc[]) => {
  const docs: Doc[] = seed.map((doc) => structuredClone(doc));
  const writes: Array<{ readonly filter: Filter; readonly update: Update }> = [];
  let finds = 0;

  const participants = {
    find: (filter: Filter, projection?: Record<string, number>) => {
      finds += 1;
      const found = docs.filter((doc) => matches(doc, filter)).sort((a, b) => String(a._id).localeCompare(String(b._id)));
      const cursor = (rows: Doc[]) => ({
        sort: () => cursor(rows),
        limit: (n: number) => cursor(rows.slice(0, n)),
        toArray: () => rows.map((doc) => project(doc, projection)),
      });
      return cursor(found);
    },
    updateMany: (filter: Filter, update: Update) => {
      writes.push({ filter, update });
      if (update.$set) throw new Error('la purge ne doit rien POSER, seulement retirer');
      const modifiedCount = docs
        .filter((doc) => matches(doc, filter))
        .filter((doc) => Object.keys(update.$unset ?? {}).map((path) => unsetPath(doc, path)).some(Boolean)).length;
      return { matchedCount: modifiedCount, modifiedCount };
    },
  };

  return {
    db: {
      getCollection: (name: string) => {
        if (name !== 'Participant') throw new Error(`collection inattendue : ${name}`);
        return participants;
      },
    },
    rows: (): readonly Doc[] => docs,
    writes,
    finds: () => finds,
  };
};

type FakeDatabase = ReturnType<typeof fakeDatabase>;

const runScript = (database: FakeDatabase, env: Record<string, string> = {}) => {
  const printed: string[] = [];
  const context = vm.createContext({
    db: database.db,
    print: (line: unknown) => printed.push(String(line)),
    process: { env },
  });
  vm.runInContext(readFileSync(SCRIPT, 'utf8'), context, { filename: SCRIPT });
  return { printed, report: journalReport(printed) };
};

/** Le rapport tel que le JOURNAL le dit — c'est lui que le porteur lit. */
const journalReport = (printed: readonly string[]) => {
  const count = (pattern: RegExp): number => {
    const line = printed.find((candidate) => pattern.test(candidate));
    if (!line) throw new Error(`ligne absente du journal : ${pattern}`);
    return Number(line.replace(pattern, '').trim());
  };
  return {
    toPurge: count(/^À purger\s*:/),
    purged: count(/^Purgées\s*:/),
    batches: count(/^Lots de \d+\s*:/),
  };
};

const hex = (n: number): string => n.toString(16).padStart(24, '0');

const anonymousRow = (n: number, session: Doc): Doc => ({
  _id: hex(1000 + n),
  conversationId: hex(9000),
  type: 'anonymous',
  displayName: `ano_${n}`,
  sessionTokenHash: `token-${n}`,
  anonymousSession: {
    shareLinkId: hex(7000),
    session: {
      sessionTokenHash: `token-${n}`,
      country: 'FR',
      deviceFingerprint: `fp-${n}`,
      connectedAt: '2026-09-01T00:00:00.000Z',
      ...session,
    },
    profile: { firstName: 'Nova', lastName: '', username: `ano_${n}`, email: null, birthday: null },
    rights: { canSendFiles: true },
  },
});

const ip = (n: number): string => `203.0.113.${n}`;
const withoutIp = (row: Doc): Doc => {
  const copy = structuredClone(row);
  unsetPath(copy, 'anonymousSession.session.ipAddress');
  return copy;
};

const seed = (): readonly Doc[] => [
  anonymousRow(1, { ipAddress: ip(1) }),
  anonymousRow(2, {}),
  anonymousRow(3, { ipAddress: ip(3) }),
  anonymousRow(4, { ipAddress: null }),
  { _id: hex(1005), type: 'user', userId: hex(5), displayName: 'Ada' },
];

describe('#9342 — purge de l’IP des sessions anonymes', () => {
  it('à blanc par défaut : compte, n’écrit rien', () => {
    const database = fakeDatabase(seed());

    const { report, printed } = runScript(database);

    expect(report).toEqual({ toPurge: 3, purged: 0, batches: 1 });
    expect(database.writes).toEqual([]);
    expect(database.rows()).toEqual(seed());
    expect(printed.join('\n')).toContain('À BLANC');
  });

  it('APPLY=1 retire la seule clé `ipAddress`, et laisse le reste de chaque ligne intact', () => {
    const database = fakeDatabase(seed());

    const { report } = runScript(database, { APPLY: '1' });

    expect(report).toEqual({ toPurge: 3, purged: 3, batches: 1 });
    expect(database.rows()).toEqual(seed().map(withoutIp));
    expect(JSON.stringify(database.rows())).not.toMatch(/203\.0\.113\./);
  });

  it('ne fait que RETIRER : chaque écriture est un `$unset` du seul chemin de l’IP, conditionné à sa présence', () => {
    const database = fakeDatabase(seed());

    runScript(database, { APPLY: '1' });

    expect(database.writes).toHaveLength(1);
    expect(database.writes[0].update).toEqual({ $unset: { 'anonymousSession.session.ipAddress': '' } });
    expect(database.writes[0].filter).toMatchObject({ 'anonymousSession.session.ipAddress': { $exists: true } });
  });

  it('idempotent : une seconde exécution ne trouve rien à purger et n’écrit rien', () => {
    const database = fakeDatabase(seed());
    runScript(database, { APPLY: '1' });
    const writesAfterFirstRun = database.writes.length;

    const { report } = runScript(database, { APPLY: '1' });

    expect(report).toEqual({ toPurge: 0, purged: 0, batches: 0 });
    expect(database.writes).toHaveLength(writesAfterFirstRun);
  });

  it('par lots bornés : `BATCH_SIZE` découpe la collection, chaque ligne est purgée une fois', () => {
    const rows = Array.from({ length: 7 }, (_, i) => anonymousRow(i + 1, { ipAddress: ip(i + 1) }));
    const database = fakeDatabase(rows);

    const { report } = runScript(database, { APPLY: '1', BATCH_SIZE: '3' });

    expect(report).toEqual({ toPurge: 7, purged: 7, batches: 3 });
    expect(database.writes).toHaveLength(3);
    expect(database.rows()).toEqual(rows.map(withoutIp));
  });

  it.each([
    ['0', 500],
    ['abc', 500],
    ['99999', 5000],
  ])('un `BATCH_SIZE` de « %s » est ramené à %i', (raw, expected) => {
    const { printed } = runScript(fakeDatabase([]), { BATCH_SIZE: raw });

    expect(printed.join('\n')).toContain(`Lots de ${expected}`);
  });

  it('le journal compte et ne cite jamais une adresse', () => {
    const { printed } = runScript(fakeDatabase(seed()), { APPLY: '1' });

    expect(printed.join('\n')).not.toMatch(/203\.0\.113\./);
  });
});
