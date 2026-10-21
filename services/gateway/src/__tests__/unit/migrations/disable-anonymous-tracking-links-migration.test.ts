/**
 * #10291 — **les liens suivis fabriqués pour un invité anonyme cessent de
 * rediriger, sans jamais toucher au lien d'un compte inscrit.**
 *
 * Ce témoin exécute le FICHIER mongosh lui-même, dans un contexte isolé, contre
 * des collections simulées qui interprètent les filtres Mongo que le script
 * écrit : c'est le script que le coordinateur rejouera qui est jugé (même patron
 * que `world-wide-avatar-banner-migration.test.ts`).
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';

const SCRIPT = resolve(
  __dirname,
  '../../../../../../packages/shared/prisma/migrations/2026-10-12-disable-anonymous-tracking-links.mongodb.js',
);

type Doc = Record<string, unknown>;
type Filter = Record<string, unknown>;
type Update = { readonly $set?: Record<string, unknown> };

/** Le script tourne dans un AUTRE royaume (`vm`) : `instanceof RegExp` y est faux. */
const tagOf = (value: unknown) => Object.prototype.toString.call(value);
const isRegExp = (value: unknown): value is RegExp => tagOf(value) === '[object RegExp]';
const isDate = (value: unknown): value is Date => tagOf(value) === '[object Date]';

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value) && !isRegExp(value) && !isDate(value);

/** Les valeurs qu'un chemin pointé désigne, en traversant les tableaux comme Mongo. */
const valuesAt = (doc: unknown, path: readonly string[]): unknown[] => {
  if (path.length === 0) return [doc];
  if (Array.isArray(doc)) return doc.flatMap((item) => valuesAt(item, path));
  if (!isPlainObject(doc) || !(path[0] in doc)) return [];
  return valuesAt(doc[path[0]], path.slice(1));
};

const equals = (value: unknown, expected: unknown): boolean => {
  if (isRegExp(expected)) return typeof value === 'string' && expected.test(value);
  return value === expected;
};

const matchesField = (doc: Doc, key: string, condition: unknown): boolean => {
  const found = valuesAt(doc, key.split('.'));
  const candidates = found.length === 0 ? [null] : found;
  if (isPlainObject(condition)) {
    return Object.entries(condition).every(([op, arg]) => {
      if (op === '$in') return candidates.some((value) => (arg as unknown[]).some((item) => equals(value ?? null, item)));
      if (op === '$nin') return candidates.every((value) => !(arg as unknown[]).some((item) => equals(value ?? null, item)));
      if (op === '$ne') return candidates.every((value) => (value ?? null) !== arg);
      if (op === '$exists') return (found.length > 0) === arg;
      throw new Error(`opérateur non simulé : ${op}`);
    });
  }
  return candidates.some((value) => equals(value ?? null, condition));
};

const matches = (doc: Doc, filter: Filter): boolean =>
  Object.entries(filter).every(([key, condition]) => {
    if (key === '$or') return (condition as Filter[]).some((branch) => matches(doc, branch));
    return matchesField(doc, key, condition);
  });

const fakeDatabase = (seed: { readonly [collection: string]: readonly Doc[] }) => {
  const collections = new Map(Object.entries(seed).map(([name, docs]) => [name, docs.map((doc) => structuredClone(doc))]));
  const writes: Array<{ readonly filter: Filter; readonly update: Update }> = [];
  const collection = (name: string) => {
    const docs = collections.get(name);
    if (!docs) throw new Error(`collection inattendue : ${name}`);
    return {
      find: (filter: Filter) => ({ toArray: () => docs.filter((doc) => matches(doc, filter)).map((doc) => structuredClone(doc)) }),
      findOne: (filter: Filter) => {
        const found = docs.find((doc) => matches(doc, filter));
        return found ? structuredClone(found) : null;
      },
      updateOne: (filter: Filter, update: Update) => {
        if (name !== 'TrackingLink') throw new Error(`écriture inattendue sur ${name}`);
        if (Object.keys(update).some((op) => op !== '$set')) throw new Error('la migration ne fait que poser des champs');
        writes.push({ filter, update });
        const target = docs.find((doc) => matches(doc, filter));
        if (target) Object.assign(target, update.$set);
        return { matchedCount: target ? 1 : 0, modifiedCount: target ? 1 : 0 };
      },
      updateMany: () => { throw new Error('écriture ligne à ligne seulement'); },
      deleteOne: () => { throw new Error('aucune suppression'); },
      deleteMany: () => { throw new Error('aucune suppression'); },
    };
  };
  return {
    db: { getCollection: collection },
    rows: (name: string) => collections.get(name) ?? [],
    writes,
  };
};

const runScript = (database: ReturnType<typeof fakeDatabase>, env: Record<string, string> = {}) => {
  const printed: string[] = [];
  const context = vm.createContext({
    db: database.db,
    print: (line: unknown) => printed.push(String(line)),
    process: { env },
  });
  vm.runInContext(readFileSync(SCRIPT, 'utf8'), context, { filename: SCRIPT });
  return printed.join('\n');
};

const CONV = 'conv-1';
const USERS = [{ _id: 'user-alice' }];
const PARTICIPANTS = [
  { _id: 'p-alice', conversationId: CONV, type: 'user', userId: 'user-alice' },
  { _id: 'p-guest', conversationId: CONV, type: 'anonymous', userId: null },
  { _id: 'p-ghost', conversationId: CONV, type: 'user' },
];

const link = (token: string, extra: Doc = {}): Doc => ({
  _id: `link-${token}`,
  token,
  originalUrl: `https://example.com/${token}`,
  isActive: true,
  conversationId: CONV,
  ...extra,
});

const message = (id: string, senderId: string, extra: Doc = {}): Doc => ({
  _id: id,
  conversationId: CONV,
  senderId,
  content: '',
  ...extra,
});

const isActive = (database: ReturnType<typeof fakeDatabase>, token: string) =>
  database.rows('TrackingLink').find((row) => row.token === token)?.isActive;

const scenario = () => fakeDatabase({
  User: USERS,
  Participant: PARTICIPANTS,
  Message: [
    message('m-guest-explicit', 'p-guest', { content: 'regarde m+guest1 vite' }),
    message('m-guest-raw', 'p-guest', { content: 'https://example.com/raw', metadata: { trackingLinks: [{ url: 'https://example.com/raw', token: 'guest2' }] } }),
    message('m-guest-attached', 'p-guest', { content: 'texte réécrit' }),
    message('m-ghost', 'p-ghost', { content: 'm+ghost1' }),
    message('m-guest-cites-alice', 'p-guest', { content: 'm+alice1' }),
    message('m-alice-reuses', 'p-alice', { content: 'pareil m+shared1' }),
    message('m-guest-shared', 'p-guest', { content: 'm+shared1' }),
  ],
  TrackingLink: [
    link('guest1', { messageId: 'm-guest-explicit' }),
    link('guest2', { createdBy: 'p-guest' }),
    link('guest3', { createdBy: 'p-guest', messageId: 'm-guest-attached' }),
    link('ghost1', { messageId: 'm-ghost' }),
    link('guest4', { createdBy: 'p-ghost', conversationId: null }),
    link('route1', { conversationId: null, name: 'Campagne', campaign: 'rentree', totalClicks: 12 }),
    link('alice1', { createdBy: 'user-alice', messageId: 'm-guest-cites-alice' }),
    link('shared1', { messageId: 'm-guest-shared' }),
    link('old1', { createdBy: 'p-guest', isActive: false }),
    link('alice2', { createdBy: 'user-alice' }),
  ],
});

describe('migration 2026-10-12-disable-anonymous-tracking-links', () => {
  it('à blanc par défaut : compte et nomme ce qui serait désactivé, n’écrit rien', () => {
    const database = scenario();

    const printed = runScript(database);

    expect(database.writes).toEqual([]);
    expect(printed).toContain('À BLANC');
    expect(printed).toContain('Liens examinés : 8');
    expect(printed).toContain('Déjà inactifs : 1');
    expect(printed).toContain('Laissés — propriétaire inscrit : 1');
    expect(printed).toContain('Laissés — portés aussi par le message d’un inscrit : 1');
    expect(printed).toContain('À désactiver : 5');
    expect(printed).toContain('Désactivés : 0');
    expect(printed).toContain('guest1  https://example.com/guest1');
    expect(printed).toContain('Participants comptés anonymes : anonymous: 1, user: 1');
  });

  it('un lien sans propriétaire que rien ne prouve anonyme n’est PAS touché, il est signalé au porteur', () => {
    const database = scenario();

    const printed = runScript(database, { APPLY: '1' });

    expect(isActive(database, 'route1')).toBe(true);
    expect(printed).toContain('NON touchés, décision porteur : 1');
    expect(printed).toContain('? route1  Campagne / rentree  clics: 12');
  });

  it('APPLY=1 imprime chaque jeton désactivé — la liste du retour arrière', () => {
    const database = scenario();

    const printed = runScript(database, { APPLY: '1' });

    for (const token of ['guest1', 'guest2', 'guest3', 'guest4', 'ghost1']) {
      expect(printed).toContain(`  - ${token} link-${token}`);
    }
    expect(printed).not.toContain('  - alice1');
  });

  it('APPLY=1 désactive les liens d’invités anonymes par `isActive: false`, sans rien supprimer', () => {
    const database = scenario();

    const printed = runScript(database, { APPLY: '1' });

    for (const token of ['guest1', 'guest2', 'guest3', 'guest4', 'ghost1']) {
      expect(isActive(database, token)).toBe(false);
    }
    expect(database.rows('TrackingLink')).toHaveLength(10);
    expect(printed).toContain('Désactivés : 5');
    expect(database.writes.every((write) => write.update.$set?.isActive === false && isDate(write.update.$set?.updatedAt))).toBe(true);
  });

  it('ne touche jamais au lien d’un compte inscrit, même cité ou réutilisé par un invité', () => {
    const database = scenario();

    runScript(database, { APPLY: '1' });

    expect(isActive(database, 'alice1')).toBe(true);
    expect(isActive(database, 'alice2')).toBe(true);
  });

  it('laisse actif un lien que le message d’un inscrit de la conversation porte aussi', () => {
    const database = scenario();

    runScript(database, { APPLY: '1' });

    expect(isActive(database, 'shared1')).toBe(true);
  });

  it('idempotente : une seconde exécution n’a plus rien à désactiver', () => {
    const database = scenario();
    runScript(database, { APPLY: '1' });
    const writesAfterFirstRun = database.writes.length;

    const printed = runScript(database, { APPLY: '1' });

    expect(database.writes.length).toBe(writesAfterFirstRun);
    expect(printed).toContain('À désactiver : 0');
    expect(printed).toContain('Déjà inactifs : 6');
  });

  it('montre au plus cinq exemples, l’adresse tronquée', () => {
    const long = `https://example.com/${'x'.repeat(200)}`;
    const database = fakeDatabase({
      User: [],
      Participant: [{ _id: 'p-guest', conversationId: CONV, type: 'anonymous', userId: null }],
      Message: [],
      TrackingLink: Array.from({ length: 7 }, (_, index) => link(`anon${index}`, { createdBy: 'p-guest', conversationId: null, originalUrl: long })),
    });

    const printed = runScript(database);

    const examples = printed.split('\n').filter((line) => line.startsWith('  anon'));
    expect(examples).toHaveLength(5);
    expect(examples.every((line) => line.endsWith('…') && line.length < 100)).toBe(true);
  });
});
