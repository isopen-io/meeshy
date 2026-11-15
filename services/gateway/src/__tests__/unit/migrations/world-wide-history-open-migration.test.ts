/**
 * #10099 — **le lien World Wide et ses entrants semés avec l'ancien terme
 * `allowViewHistory: false` s'ouvrent à l'historique UNE fois, par migration,
 * et rien d'autre ne bouge.**
 *
 * Le seed ne réaligne plus rien au démarrage (sans quoi il rouvrirait à chaque
 * redémarrage un historique qu'un administrateur a coupé). Ce témoin exécute le
 * FICHIER mongosh lui-même, dans un contexte isolé, contre des collections
 * simulées : c'est le script que le coordinateur rejouera qui est jugé.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';

const SCRIPT = resolve(
  __dirname,
  '../../../../../../packages/shared/prisma/migrations/2026-10-11-world-wide-history-open.mongodb.js',
);

type Doc = Record<string, unknown>;
type Filter = Record<string, unknown>;
type Update = { readonly $set?: Record<string, unknown> };

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const readPath = (doc: Doc, path: string): { readonly present: boolean; readonly value: unknown } =>
  path.split('.').reduce<{ present: boolean; value: unknown }>(
    (cursor, key) =>
      cursor.present && isPlainObject(cursor.value) && key in cursor.value
        ? { present: true, value: cursor.value[key] }
        : { present: false, value: undefined },
    { present: true, value: doc },
  );

const setPath = (doc: Doc, path: string, value: unknown): void => {
  const keys = path.split('.');
  const parent = keys.slice(0, -1).reduce<Record<string, unknown>>((node, key) => node[key] as Record<string, unknown>, doc);
  parent[keys[keys.length - 1]] = value;
};

const matches = (doc: Doc, filter: Filter): boolean =>
  Object.entries(filter).every(([path, condition]) => {
    const field = readPath(doc, path);
    if (isPlainObject(condition)) {
      return Object.entries(condition).every(([op, arg]) => {
        if (op === '$exists') return field.present === arg;
        throw new Error(`opérateur non simulé : ${op}`);
      });
    }
    return field.present && field.value === condition;
  });

const fakeDatabase = (seed: Record<string, readonly Doc[]>) => {
  const collections: Record<string, Doc[]> = Object.fromEntries(
    Object.entries(seed).map(([name, docs]) => [name, docs.map((doc) => structuredClone(doc))]),
  );
  const writes: Array<{ readonly collection: string; readonly filter: Filter; readonly update: Update }> = [];

  const collection = (name: string) => {
    const docs = collections[name];
    if (!docs) throw new Error(`collection inattendue : ${name}`);
    const apply = (filter: Filter, update: Update, limit: number) => {
      writes.push({ collection: name, filter, update });
      if (Object.keys(update).some((op) => op !== '$set')) throw new Error('la migration ne fait que POSER un champ');
      const targets = docs.filter((doc) => matches(doc, filter)).slice(0, limit);
      targets.forEach((doc) => Object.entries(update.$set ?? {}).forEach(([path, value]) => setPath(doc, path, value)));
      return { matchedCount: targets.length, modifiedCount: targets.length };
    };
    return {
      findOne: (filter: Filter) => {
        const found = docs.find((doc) => matches(doc, filter));
        return found ? structuredClone(found) : null;
      },
      countDocuments: (filter: Filter) => docs.filter((doc) => matches(doc, filter)).length,
      updateOne: (filter: Filter, update: Update) => apply(filter, update, 1),
      updateMany: (filter: Filter, update: Update) => apply(filter, update, Number.POSITIVE_INFINITY),
      deleteOne: () => { throw new Error('aucune suppression'); },
      deleteMany: () => { throw new Error('aucune suppression'); },
    };
  };

  return {
    db: { getCollection: collection },
    rows: (name: string): readonly Doc[] => collections[name],
    writes,
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
  return printed;
};

const journalCount = (printed: readonly string[], pattern: RegExp): number => {
  const line = printed.find((candidate) => pattern.test(candidate));
  if (!line) throw new Error(`ligne absente du journal : ${pattern}`);
  return Number(line.replace(pattern, '').trim());
};

const WORLD = 'conv-world';
const OTHER = 'conv-other';
const SENDING = { canSendMessages: true, canSendFiles: false, canSendImages: false, canSendVideos: false, canSendAudios: true, canSendLocations: false, canSendLinks: false };

const participant = (id: string, conversationId: string, canViewHistory: boolean | undefined, extra: Doc = {}): Doc => ({
  _id: id,
  conversationId,
  type: 'anonymous',
  permissions: canViewHistory === undefined ? { ...SENDING } : { ...SENDING, canViewHistory },
  ...extra,
});

const seed = (): Record<string, readonly Doc[]> => ({
  Conversation: [
    { _id: WORLD, identifier: 'world', title: 'World Wide' },
    { _id: OTHER, identifier: 'meeshy', title: 'Meeshy Global' },
  ],
  ConversationShareLink: [
    { _id: 'link-world', identifier: 'mshy_world', conversationId: WORLD, allowViewHistory: false, isActive: true },
    { _id: 'link-other', identifier: 'mshy_team', conversationId: OTHER, allowViewHistory: false, isActive: true },
  ],
  Participant: [
    participant('p-closed-1', WORLD, false),
    participant('p-closed-2', WORLD, false),
    participant('p-open', WORLD, true),
    participant('p-unset', WORLD, undefined),
    participant('p-host-restricted', WORLD, false, { anonymousSession: { rights: { canViewHistory: false } } }),
    participant('p-elsewhere', OTHER, false),
  ],
});

const viewHistoryOf = (database: FakeDatabase, id: string): unknown =>
  (database.rows('Participant').find((row) => row._id === id)?.permissions as Doc | undefined)?.canViewHistory;

describe('#10099 — migration : World Wide ouvre l’historique à ses entrants semés fermés', () => {
  it('à blanc par défaut : compte, n’écrit rien', () => {
    const database = fakeDatabase(seed());

    const printed = runScript(database);

    expect(database.writes).toEqual([]);
    expect(database.rows('ConversationShareLink')).toEqual(seed().ConversationShareLink);
    expect(database.rows('Participant')).toEqual(seed().Participant);
    expect(journalCount(printed, /^Participations à ouvrir \(avant\)\s*:/)).toBe(2);
    expect(printed.join('\n')).toContain('À BLANC');
  });

  it('APPLY=1 ouvre le lien mshy_world et les entrants fermés de World Wide, et journalise avant/après', () => {
    const database = fakeDatabase(seed());

    const printed = runScript(database, { APPLY: '1' });

    expect(database.rows('ConversationShareLink').find((row) => row._id === 'link-world')).toMatchObject({ allowViewHistory: true, isActive: true });
    expect(viewHistoryOf(database, 'p-closed-1')).toBe(true);
    expect(viewHistoryOf(database, 'p-closed-2')).toBe(true);
    expect(journalCount(printed, /^Participations à ouvrir \(avant\)\s*:/)).toBe(2);
    expect(journalCount(printed, /^Participations ouvertes\s*:/)).toBe(2);
    expect(journalCount(printed, /^Participations à ouvrir \(après\)\s*:/)).toBe(0);
  });

  it('ne touche que World Wide : l’autre lien et l’autre conversation restent fermés', () => {
    const database = fakeDatabase(seed());

    runScript(database, { APPLY: '1' });

    expect(database.rows('ConversationShareLink').find((row) => row._id === 'link-other')).toMatchObject({ allowViewHistory: false });
    expect(viewHistoryOf(database, 'p-elsewhere')).toBe(false);
  });

  it('laisse la restriction d’un hôte, un droit absent et les droits d’envoi tels quels', () => {
    const database = fakeDatabase(seed());

    runScript(database, { APPLY: '1' });

    expect(database.rows('Participant').find((row) => row._id === 'p-host-restricted')).toEqual(
      seed().Participant.find((row) => row._id === 'p-host-restricted'),
    );
    expect(viewHistoryOf(database, 'p-unset')).toBeUndefined();
    database.rows('Participant').forEach((row) => expect(row.permissions).toMatchObject(SENDING));
  });

  it('ne pose qu’un seul champ par écriture, sans suppression', () => {
    const database = fakeDatabase(seed());

    runScript(database, { APPLY: '1' });

    expect(database.writes.map((write) => write.update)).toEqual([
      { $set: { allowViewHistory: true } },
      { $set: { 'permissions.canViewHistory': true } },
    ]);
  });

  it('idempotent : une seconde exécution n’a plus rien à ouvrir et n’écrit rien', () => {
    const database = fakeDatabase(seed());
    runScript(database, { APPLY: '1' });
    const writesAfterFirstRun = database.writes.length;

    const printed = runScript(database, { APPLY: '1' });

    expect(database.writes).toHaveLength(writesAfterFirstRun);
    expect(journalCount(printed, /^Participations à ouvrir \(avant\)\s*:/)).toBe(0);
  });

  it('sans conversation World Wide, n’écrit rien', () => {
    const database = fakeDatabase({ ...seed(), Conversation: seed().Conversation.filter((row) => row._id !== WORLD) });

    const printed = runScript(database, { APPLY: '1' });

    expect(database.writes).toEqual([]);
    expect(printed.join('\n')).toContain('World Wide absente');
  });
});
