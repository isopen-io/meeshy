import { readFileSync } from 'node:fs';

import { describe, expect, test } from 'bun:test';

import { createAccountCacheShelf } from '@/lib/api/account-caches';
import { createAccountVault } from '@/lib/api/accounts';

import { achievementMoment, startMoment } from './moments';
import type { NotebookBackend, NotebookEntry } from './notebook';
import {
  forgetAccountNotebook,
  indexedDbLegacyStore,
  knownAccountsOf,
  LEGACY_NOTEBOOK_DB,
  settleLegacyNotebook,
  type KeyedStorage,
  type LegacyNotebookStore,
} from './notebook-legacy';

/**
 * L'ANCIEN CARNET PARTAGÉ (D-154, #10161) — avant le cloisonnement, l'appareil
 * gardait UNE base `meeshy-game-notebook`, sans identité de compte. L'adopter
 * « par le compte connecté » livrerait, sur un appareil partagé, les selfies
 * d'un compte à un autre : elle n'est adoptée que si l'appareil n'a connu
 * qu'UN compte ; sinon, et dans le doute, elle part en QUARANTAINE — illisible
 * par tous, et le carnet propose de la supprimer.
 */

const T0 = '2026-10-05T10:00:00.000Z';
const image = (name: string) => new Blob([name], { type: 'image/png' });

const entryOf = (moment: ReturnType<typeof startMoment>, status: 'kept' | 'pending' = 'kept'): NotebookEntry => ({
  id: moment.id,
  momentId: moment.id,
  emblem: moment.emblem,
  kicker: moment.kicker,
  title: moment.title,
  status,
  createdAt: T0,
  expiresAt: null,
  ...(status === 'kept' ? { mode: 'selfie' as const, story: image('s'), square: image('q') } : {}),
});

const memoryBackend = (): NotebookBackend & { readonly rows: Map<string, NotebookEntry> } => {
  const rows = new Map<string, NotebookEntry>();
  return {
    rows,
    put: async (entry) => void rows.set(entry.id, entry),
    get: async (id) => rows.get(id),
    all: async () => [...rows.values()],
    remove: async (id) => void rows.delete(id),
  };
};

const legacyOf = (state: 'absent' | 'present' | 'quarantined', entries: readonly NotebookEntry[] = []) => {
  const log = { quarantined: 0, discarded: 0, state };
  const store: LegacyNotebookStore = {
    probe: async () => log.state,
    readAll: async () => entries,
    quarantine: async () => {
      log.quarantined += 1;
      log.state = 'quarantined';
    },
    discard: async () => {
      log.discarded += 1;
      log.state = 'absent';
    },
  };
  return { store, log };
};

const storageOf = (rows: Record<string, string>): KeyedStorage => ({
  keys: () => Object.keys(rows),
  getItem: (key) => rows[key] ?? null,
});

describe('l’adoption de l’ancien carnet', () => {
  const legacyEntries = [entryOf(startMoment()), entryOf(achievementMoment('achievement.first_voice'), 'pending')];

  test('DEUX comptes connus ⇒ rien n’est adopté, la base est en quarantaine', async () => {
    const { store, log } = legacyOf('present', legacyEntries);
    const target = memoryBackend();
    const state = await settleLegacyNotebook({ legacy: store, userId: 'alice', known: new Set(['alice', 'bob']), target });
    expect(state).toBe('quarantined');
    expect(target.rows.size).toBe(0);
    expect(log.quarantined).toBe(1);
    expect(log.discarded).toBe(0);
  });

  test('un seul compte connu ⇒ adoption unique : ses entrées passent dans la base du compte, l’ancienne base disparaît', async () => {
    const { store, log } = legacyOf('present', legacyEntries);
    const target = memoryBackend();
    const state = await settleLegacyNotebook({ legacy: store, userId: 'alice', known: new Set(['alice']), target });
    expect(state).toBe('none');
    expect([...target.rows.keys()].sort()).toEqual(['achievement:achievement.first_voice', 'start']);
    expect(target.rows.get('start')?.square?.size).toBe(1);
    expect(log.discarded).toBe(1);
    expect(log.quarantined).toBe(0);
  });

  test('l’adoption n’écrase jamais une entrée que le compte a déjà', async () => {
    const { store } = legacyOf('present', legacyEntries);
    const target = memoryBackend();
    const mine = { ...entryOf(startMoment()), createdAt: '2026-10-09T10:00:00.000Z' };
    await target.put(mine);
    await settleLegacyNotebook({ legacy: store, userId: 'alice', known: new Set(['alice']), target });
    expect(target.rows.get('start')?.createdAt).toBe('2026-10-09T10:00:00.000Z');
  });

  test('une copie qui échoue garde l’ancienne base intacte : rien ne se perd', async () => {
    const { store, log } = legacyOf('present', legacyEntries);
    const target: NotebookBackend = {
      ...memoryBackend(),
      put: async () => {
        throw new DOMException('quota', 'QuotaExceededError');
      },
    };
    await settleLegacyNotebook({ legacy: store, userId: 'alice', known: new Set(['alice']), target });
    expect(log.discarded).toBe(0);
  });

  test('une quarantaine est DÉFINITIVE : même redevenu seul compte, l’appareil n’adopte pas', async () => {
    const { store, log } = legacyOf('quarantined', legacyEntries);
    const target = memoryBackend();
    expect(await settleLegacyNotebook({ legacy: store, userId: 'alice', known: new Set(['alice']), target })).toBe('quarantined');
    expect(target.rows.size).toBe(0);
    expect(log.discarded).toBe(0);
  });

  test('aucun ancien carnet ⇒ rien à faire', async () => {
    const { store, log } = legacyOf('absent');
    expect(await settleLegacyNotebook({ legacy: store, userId: 'alice', known: new Set(['alice']), target: memoryBackend() })).toBe('none');
    expect(log).toMatchObject({ quarantined: 0, discarded: 0 });
  });

  test('un ancien carnet illisible ⇒ quarantaine, jamais une exception', async () => {
    const store: LegacyNotebookStore = {
      probe: async () => 'present',
      readAll: async () => Promise.reject(new Error('fermé')),
      quarantine: async () => undefined,
      discard: async () => undefined,
    };
    expect(await settleLegacyNotebook({ legacy: store, userId: 'alice', known: new Set(['alice', 'bob']), target: memoryBackend() })).toBe('quarantined');
    expect(await settleLegacyNotebook({ legacy: store, userId: 'alice', known: new Set(['alice']), target: memoryBackend() })).toBe('none');
  });
});

describe('les comptes qu’a connus l’appareil', () => {
  test('le compte connecté, toujours', () => {
    expect([...knownAccountsOf(storageOf({}), 'alice')]).toEqual(['alice']);
  });

  test('le coffre des jetons : chaque compte listé', () => {
    const rows = new Map<string, string>();
    const storage = { getItem: (k: string) => rows.get(k) ?? null, setItem: (k: string, v: string) => void rows.set(k, v), removeItem: (k: string) => void rows.delete(k) };
    const vault = createAccountVault({ storage, now: () => 1 });
    vault.noteActive({ id: 'alice', username: 'alice' });
    vault.noteActive({ id: 'bob', username: 'bob' });
    const known = knownAccountsOf({ keys: () => [...rows.keys()], getItem: (k) => rows.get(k) ?? null }, 'alice');
    expect([...known].sort()).toEqual(['alice', 'bob']);
  });

  test('l’étagère des caches de compte : un compte quitté est un compte connu', () => {
    const rows = new Map<string, string>();
    const storage = { getItem: (k: string) => rows.get(k) ?? null, setItem: (k: string, v: string) => void rows.set(k, v), removeItem: (k: string) => void rows.delete(k) };
    createAccountCacheShelf(storage).put('bob', '{}');
    const known = knownAccountsOf({ keys: () => [...rows.keys()], getItem: (k) => rows.get(k) ?? null }, 'alice');
    expect([...known].sort()).toEqual(['alice', 'bob']);
  });

  test('un indice d’un autre compte (brouillon rangé sous son identité) compte', () => {
    const known = knownAccountsOf(storageOf({ 'meeshy.draft.u_bob.65f0c0ffee0000000000abcd': 'x', 'meeshy.draft.story.carol': 'y' }), 'alice');
    expect([...known].sort()).toEqual(['alice', 'bob', 'carol']);
  });

  test('l’identité d’une conversation dans une clé n’est pas un compte', () => {
    const known = knownAccountsOf(storageOf({ 'meeshy.draft.u_alice.65f0c0ffee0000000000abcd': 'x', 'meeshy.reading-mode.u_alice.65f0c0ffee0000000000abcd': 'y' }), 'alice');
    expect([...known]).toEqual(['alice']);
  });

  test('un coffre illisible : dans le doute, un autre compte est supposé', () => {
    const known = knownAccountsOf(storageOf({ 'meeshy.accounts': '{pas du json' }), 'alice');
    expect(known.size).toBeGreaterThan(1);
  });
});

/** Un `IDBFactory` en mémoire : bases versionnées, magasins, `onupgradeneeded` avec `oldVersion`, abandon, suppression. */
function fakeFactory() {
  type Base = { version: number; stores: Map<string, Map<string, unknown>> };
  const bases = new Map<string, Base>();
  const later = (run: () => void) => setTimeout(run, 0);
  const requestOf = <T,>(produce: () => T) => {
    const request: { result?: T; onsuccess: (() => void) | null; onerror: (() => void) | null; error: unknown } = { onsuccess: null, onerror: null, error: null };
    later(() => {
      request.result = produce();
      request.onsuccess?.();
    });
    return request;
  };
  const dbOf = (name: string, base: Base) => ({
    name,
    version: base.version,
    objectStoreNames: { contains: (store: string) => base.stores.has(store) },
    createObjectStore: (store: string) => void base.stores.set(store, new Map()),
    transaction: (store: string) => {
      const tx: { oncomplete: (() => void) | null; onabort: (() => void) | null; onerror: (() => void) | null; error: unknown; objectStore: () => unknown } = {
        oncomplete: null,
        onabort: null,
        onerror: null,
        error: null,
        objectStore: () => ({
          getAll: () => requestOf(() => [...(base.stores.get(store)?.values() ?? [])]),
        }),
      };
      later(() => later(() => tx.oncomplete?.()));
      return tx;
    },
    close: () => undefined,
  });
  const factory = {
    open: (name: string, version?: number) => {
      const request: {
        result: unknown;
        error: unknown;
        transaction: { abort: () => void } | null;
        onsuccess: (() => void) | null;
        onerror: (() => void) | null;
        onblocked: (() => void) | null;
        onupgradeneeded: ((event: { oldVersion: number }) => void) | null;
      } = { result: undefined, error: null, transaction: null, onsuccess: null, onerror: null, onblocked: null, onupgradeneeded: null };
      later(() => {
        const existing = bases.get(name);
        const oldVersion = existing?.version ?? 0;
        const target = version ?? (oldVersion === 0 ? 1 : oldVersion);
        if (target < oldVersion) {
          request.error = new DOMException('version', 'VersionError');
          request.onerror?.();
          return;
        }
        const working: Base = existing === undefined ? { version: target, stores: new Map() } : { version: target, stores: existing.stores };
        let aborted = false;
        request.transaction = { abort: () => void (aborted = true) };
        request.result = dbOf(name, working);
        if (target > oldVersion) request.onupgradeneeded?.({ oldVersion });
        if (aborted) {
          request.error = new DOMException('abort', 'AbortError');
          request.onerror?.();
          return;
        }
        bases.set(name, working);
        request.onsuccess?.();
      });
      return request;
    },
    deleteDatabase: (name: string) => requestOf(() => void bases.delete(name)),
  };
  return { factory: factory as unknown as IDBFactory, bases };
}

describe('l’ancien carnet sur IndexedDB', () => {
  const seed = (bases: ReturnType<typeof fakeFactory>['bases'], entries: readonly NotebookEntry[]) =>
    bases.set(LEGACY_NOTEBOOK_DB, { version: 1, stores: new Map([['entries', new Map(entries.map((e) => [e.id, e as unknown]))]]) });

  test('sonder une base absente ne la crée pas', async () => {
    const { factory, bases } = fakeFactory();
    expect(await indexedDbLegacyStore(factory).probe()).toBe('absent');
    expect(bases.has(LEGACY_NOTEBOOK_DB)).toBe(false);
  });

  test('une base présente se lit entière', async () => {
    const { factory, bases } = fakeFactory();
    seed(bases, [entryOf(startMoment())]);
    const store = indexedDbLegacyStore(factory);
    expect(await store.probe()).toBe('present');
    expect((await store.readAll()).map((e) => e.id)).toEqual(['start']);
  });

  test('la quarantaine monte la version de la base : les anciennes versions de l’app ne l’ouvrent plus, et la sonde la reconnaît', async () => {
    const { factory, bases } = fakeFactory();
    seed(bases, [entryOf(startMoment())]);
    const store = indexedDbLegacyStore(factory);
    await store.quarantine();
    expect(bases.get(LEGACY_NOTEBOOK_DB)?.version).toBe(2);
    expect(bases.get(LEGACY_NOTEBOOK_DB)?.stores.has('quarantine')).toBe(true);
    expect(await store.probe()).toBe('quarantined');
  });

  test('supprimer l’ancien carnet efface la base', async () => {
    const { factory, bases } = fakeFactory();
    seed(bases, [entryOf(startMoment())]);
    await indexedDbLegacyStore(factory).discard();
    expect(bases.has(LEGACY_NOTEBOOK_DB)).toBe(false);
  });

  test('« retirer ce compte » efface la base de CE compte, pas celle d’un autre', async () => {
    const { factory, bases } = fakeFactory();
    bases.set('meeshy-game-notebook-alice', { version: 1, stores: new Map() });
    bases.set('meeshy-game-notebook-bob', { version: 1, stores: new Map() });
    await forgetAccountNotebook(factory, 'alice');
    expect([...bases.keys()]).toEqual(['meeshy-game-notebook-bob']);
  });

  test('retirer un compte alors que l’ancienne base attend encore : elle part en QUARANTAINE — elle était peut-être la sienne, le compte restant ne l’adoptera pas', async () => {
    const { factory, bases } = fakeFactory();
    seed(bases, [entryOf(startMoment())]);
    await forgetAccountNotebook(factory, 'bob');
    expect(await indexedDbLegacyStore(factory).probe()).toBe('quarantined');
  });

  test('retirer un compte sans ancienne base n’en crée pas', async () => {
    const { factory, bases } = fakeFactory();
    await forgetAccountNotebook(factory, 'bob');
    expect(bases.has(LEGACY_NOTEBOOK_DB)).toBe(false);
  });

  test('sans IndexedDB, oublier un compte ne lève pas', async () => {
    await forgetAccountNotebook(undefined, 'alice');
  });
});

describe('le carnet part avec le compte RETIRÉ, jamais à la déconnexion', () => {
  const source = readFileSync(new URL('../api/device-accounts.ts', import.meta.url), 'utf8');

  test('« retirer ce compte » (le `forget` du coffre) efface sa base', () => {
    expect(source).toMatch(/forgettingLocalData\([^;]*retireAccountLocally\)/);
    expect(source).toMatch(/function retireAccountLocally[\s\S]*forgetAccountNotebook\(/);
  });

  test('la déconnexion n’efface pas le carnet', () => {
    const signOut = source.slice(source.indexOf('export async function signOutOfThisDevice'));
    expect(signOut).not.toContain('forgetAccountNotebook');
    expect(signOut).not.toContain('retireAccountLocally');
  });
});
