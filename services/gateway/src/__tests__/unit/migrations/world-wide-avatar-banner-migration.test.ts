/**
 * #10204 — **World Wide reçoit son avatar et sa bannière UNE fois, par
 * migration, sans jamais remplacer une image posée à la main.**
 *
 * Ce témoin exécute le FICHIER mongosh lui-même, dans un contexte isolé, contre
 * des collections simulées : c'est le script que le coordinateur rejouera qui
 * est jugé (même patron que `world-wide-history-open-migration.test.ts`).
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';

const SCRIPT = resolve(
  __dirname,
  '../../../../../../packages/shared/prisma/migrations/2026-10-11-world-wide-avatar-banner.mongodb.js',
);

type Doc = Record<string, unknown>;
type Filter = Record<string, unknown>;
type Update = { readonly $set?: Record<string, unknown> };

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

/** Le sens Mongo de `$in: [null, …]` : un champ ABSENT vaut `null`. */
const matches = (doc: Doc, filter: Filter): boolean =>
  Object.entries(filter).every(([key, condition]) => {
    const present = key in doc;
    const value = present ? doc[key] : null;
    if (isPlainObject(condition)) {
      return Object.entries(condition).every(([op, arg]) => {
        if (op === '$in') return (arg as unknown[]).includes(value);
        if (op === '$exists') return present === arg;
        throw new Error(`opérateur non simulé : ${op}`);
      });
    }
    return present && value === condition;
  });

const fakeDatabase = (conversations: readonly Doc[]) => {
  const docs = conversations.map((doc) => structuredClone(doc));
  const writes: Array<{ readonly filter: Filter; readonly update: Update }> = [];
  const collection = (name: string) => {
    if (name !== 'Conversation') throw new Error(`collection inattendue : ${name}`);
    return {
      findOne: (filter: Filter) => {
        const found = docs.find((doc) => matches(doc, filter));
        return found ? structuredClone(found) : null;
      },
      updateOne: (filter: Filter, update: Update) => {
        writes.push({ filter, update });
        if (Object.keys(update).some((op) => op !== '$set')) throw new Error('la migration ne fait que POSER un champ');
        const target = docs.find((doc) => matches(doc, filter));
        if (target) Object.assign(target, update.$set);
        return { matchedCount: target ? 1 : 0, modifiedCount: target ? 1 : 0 };
      },
      updateMany: () => { throw new Error('une seule conversation est visée'); },
      deleteOne: () => { throw new Error('aucune suppression'); },
      deleteMany: () => { throw new Error('aucune suppression'); },
    };
  };
  return { db: { getCollection: collection }, docs, writes };
};

const runScript = (database: ReturnType<typeof fakeDatabase>, env: Record<string, string> = {}) => {
  const printed: string[] = [];
  const context = vm.createContext({
    db: database.db,
    print: (line: unknown) => printed.push(String(line)),
    process: { env },
  });
  vm.runInContext(readFileSync(SCRIPT, 'utf8'), context, { filename: SCRIPT });
  return printed;
};

const STAGING = 'https://staging.meeshy.me';
const AVATAR = `${STAGING}/brand/world-wide/avatar.png`;
const BANNER = `${STAGING}/brand/world-wide/banner.png`;
const OTHER = { _id: 'conv-other', identifier: 'meeshy', title: 'Meeshy Global' };

const world = (extra: Doc = {}): Doc => ({ _id: 'conv-world', identifier: 'world', title: 'World Wide', ...extra });
const worldOf = (database: ReturnType<typeof fakeDatabase>) => database.docs.find((doc) => doc.identifier === 'world');

describe('migration 2026-10-11-world-wide-avatar-banner', () => {
  it('à blanc par défaut : dit ce qui serait posé, n’écrit rien', () => {
    const database = fakeDatabase([world(), OTHER]);

    const printed = runScript(database, { APP_ORIGIN: STAGING });

    expect(database.writes).toEqual([]);
    expect(printed.join('\n')).toContain('Images à poser : 2 (avatar, banner)');
  });

  it('APPLY=1 pose les deux adresses absolues sur World Wide, et sur elle seule', () => {
    const database = fakeDatabase([world(), OTHER]);

    runScript(database, { APP_ORIGIN: STAGING, APPLY: '1' });

    expect(worldOf(database)).toMatchObject({ avatar: AVATAR, banner: BANNER });
    expect(database.docs.find((doc) => doc._id === 'conv-other')).toEqual(OTHER);
  });

  it('un champ null ou vide compte comme absent', () => {
    const database = fakeDatabase([world({ avatar: null, banner: '' })]);

    runScript(database, { APP_ORIGIN: STAGING, APPLY: '1' });

    expect(worldOf(database)).toMatchObject({ avatar: AVATAR, banner: BANNER });
  });

  it('une image posée à la main n’est jamais remplacée', () => {
    const chosen = 'https://static.meeshy.me/choisi-a-la-main.png';
    const database = fakeDatabase([world({ avatar: chosen })]);

    const printed = runScript(database, { APP_ORIGIN: STAGING, APPLY: '1' });

    expect(worldOf(database)).toMatchObject({ avatar: chosen, banner: BANNER });
    expect(database.writes.every((write) => !('avatar' in (write.update.$set ?? {})))).toBe(true);
    expect(printed.join('\n')).toContain('laissées : 1 (avatar)');
  });

  it('idempotente : une seconde exécution n’a plus rien à poser', () => {
    const database = fakeDatabase([world()]);
    runScript(database, { APP_ORIGIN: STAGING, APPLY: '1' });
    const writesAfterFirstRun = database.writes.length;

    const printed = runScript(database, { APP_ORIGIN: STAGING, APPLY: '1' });

    expect(database.writes.length).toBe(writesAfterFirstRun);
    expect(printed.join('\n')).toContain('Images à poser : 0');
  });

  it('sans APP_ORIGIN valide, rien n’est lu ni écrit', () => {
    for (const env of [{ APPLY: '1' }, { APPLY: '1', APP_ORIGIN: 'staging.meeshy.me' }, { APPLY: '1', APP_ORIGIN: 'http://meeshy.me' }]) {
      const database = fakeDatabase([world()]);

      const printed = runScript(database, env);

      expect(database.writes).toEqual([]);
      expect(worldOf(database)).toEqual(world());
      expect(printed.join('\n')).toContain('APP_ORIGIN absente ou invalide');
    }
  });

  it('l’origine se lit sans barre finale', () => {
    const database = fakeDatabase([world()]);

    runScript(database, { APP_ORIGIN: 'https://meeshy.me/', APPLY: '1' });

    expect(worldOf(database)).toMatchObject({
      avatar: 'https://meeshy.me/brand/world-wide/avatar.png',
      banner: 'https://meeshy.me/brand/world-wide/banner.png',
    });
  });

  it('sans World Wide, ne fait rien', () => {
    const database = fakeDatabase([OTHER]);

    const printed = runScript(database, { APP_ORIGIN: STAGING, APPLY: '1' });

    expect(database.writes).toEqual([]);
    expect(printed.join('\n')).toContain('World Wide absente');
  });
});
