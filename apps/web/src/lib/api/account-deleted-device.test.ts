import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'bun:test';

import { notebookDbName } from '@/lib/game-photo/notebook';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { PENDING_RETIREMENTS_KEY } from './account-deleted';
import { retireDeletedAccount, tidyDeviceAfterBoot } from './account-deleted-retire';
import { heldAccountOf, sessionStore, type SessionUser } from './session';

/**
 * **SUPPRIMER SON COMPTE EFFACE AUSSI SON CARNET SUR L'APPAREIL WEB** (#10237) —
 * sur les vrais modules de l'appareil : vrai coffre (`device-accounts.ts`),
 * vrai magasin de session, vrai `localStorage`, et un `indexedDB` en mémoire
 * qui porte un carnet par compte (`meeshy-game-notebook-<id>`).
 *
 * Le compte supprimé est celui que le signal NOMME : un autre compte ouvert
 * entre-temps garde sa session, sa place au sélecteur et son carnet.
 */

const ADA: SessionUser = { id: 'u-ada', username: 'ada', displayName: 'Ada' };
const BOB: SessionUser = { id: 'u-bob', username: 'bob', displayName: 'Bob' };

/** Un `IDBFactory` réduit : des bases nommées, la suppression, et l'ouverture d'une base absente qui abandonne sa création. */
function memoryIndexedDb(names: readonly string[]) {
  const bases = new Set(names);
  const later = (run: () => void) => setTimeout(run, 0);
  const factory = {
    databases: async () => [...bases].map((name) => ({ name, version: 1 })),
    deleteDatabase: (name: string) => {
      const request: { onsuccess: (() => void) | null; onerror: (() => void) | null; result: undefined; error: null } = { onsuccess: null, onerror: null, result: undefined, error: null };
      later(() => {
        bases.delete(name);
        request.onsuccess?.();
      });
      return request;
    },
    open: (name: string) => {
      const request: {
        result: unknown;
        error: unknown;
        transaction: { abort: () => void } | null;
        onsuccess: (() => void) | null;
        onerror: (() => void) | null;
        onupgradeneeded: ((event: { oldVersion: number }) => void) | null;
      } = { result: undefined, error: null, transaction: null, onsuccess: null, onerror: null, onupgradeneeded: null };
      later(() => {
        if (bases.has(name)) {
          request.result = { objectStoreNames: { contains: () => false }, close: () => undefined };
          request.onsuccess?.();
          return;
        }
        let aborted = false;
        request.transaction = { abort: () => void (aborted = true) };
        request.onupgradeneeded?.({ oldVersion: 0 });
        if (aborted) {
          request.error = new DOMException('abort', 'AbortError');
          request.onerror?.();
        }
      });
      return request;
    },
  };
  return { factory: factory as unknown as IDBFactory, bases };
}

let original: IDBFactory | undefined;

beforeAll(() => {
  ensureHappyDomRegistered({ url: 'http://localhost/' });
  original = (globalThis as { indexedDB?: IDBFactory | undefined }).indexedDB;
});

afterAll(async () => {
  (globalThis as { indexedDB?: IDBFactory | undefined }).indexedDB = original;
  await releaseHappyDomIfRegistered();
});

/* Le coffre garde le `localStorage` trouvé à son chargement : on le vide par son API. */
const resetDevice = async () => {
  const { accountVault } = await import('./device-accounts');
  accountVault.list().forEach((account) => accountVault.forget(account.user.id));
  sessionStore.getState().clearSession();
  globalThis.localStorage.clear();
};

beforeEach(resetDevice);
afterEach(resetDevice);

async function deviceWithAdaAndBob() {
  const { accountVault } = await import('./device-accounts');
  const idb = memoryIndexedDb([notebookDbName(ADA.id), notebookDbName(BOB.id)]);
  (globalThis as { indexedDB?: IDBFactory | undefined }).indexedDB = idb.factory;
  accountVault.noteActive(ADA);
  accountVault.noteActive(BOB);
  return { accountVault, bases: idb.bases };
}

const settled = async (done: () => boolean) => {
  for (let tick = 0; tick < 100 && !done(); tick += 1) await new Promise((resolve) => setTimeout(resolve, 5));
};

describe('le compte supprimé NOMMÉ quitte l’appareil, carnet compris', () => {
  test('Ada supprimée pendant que Bob est ouvert : Ada et son carnet partent, Bob reste ouvert avec son carnet', async () => {
    const { accountVault, bases } = await deviceWithAdaAndBob();
    sessionStore.getState().establish({ user: BOB, token: 'jwt-bob', sessionToken: 'sess-bob', expiresIn: 3_600 });

    await retireDeletedAccount(ADA.id);
    await settled(() => !bases.has(notebookDbName(ADA.id)));

    expect(accountVault.list().map((account) => account.user.id)).toEqual([BOB.id]);
    expect(bases.has(notebookDbName(ADA.id))).toBe(false);
    expect(bases.has(notebookDbName(BOB.id))).toBe(true);
    expect(heldAccountOf(sessionStore.getState().session)?.user.id).toBe(BOB.id);
  });

  test('le compte ouvert est le compte supprimé : sa session finit, son carnet et sa ligne partent', async () => {
    const { accountVault, bases } = await deviceWithAdaAndBob();
    sessionStore.getState().establish({ user: ADA, token: 'jwt-ada', sessionToken: 'sess-ada', expiresIn: 3_600 });

    await retireDeletedAccount(ADA.id);
    await settled(() => !bases.has(notebookDbName(ADA.id)));

    expect(sessionStore.getState().session.status).toBe('anonymous');
    expect(accountVault.list().map((account) => account.user.id)).toEqual([BOB.id]);
    expect(bases.has(notebookDbName(ADA.id))).toBe(false);
    expect(bases.has(notebookDbName(BOB.id))).toBe(true);
  });
});

describe('au démarrage suivant, l’appareil finit ce qu’un retrait raté a laissé (audit #10237)', () => {
  test('le retrait noté est rejoué et le carnet d’un compte qui n’est plus au coffre part ; Bob garde tout', async () => {
    const { accountVault, bases } = await deviceWithAdaAndBob();
    bases.add(notebookDbName('u-old'));
    sessionStore.getState().establish({ user: BOB, token: 'jwt-bob', sessionToken: 'sess-bob', expiresIn: 3_600 });
    globalThis.localStorage.setItem(PENDING_RETIREMENTS_KEY, ADA.id);

    await tidyDeviceAfterBoot();
    await settled(() => !bases.has(notebookDbName(ADA.id)) && !bases.has(notebookDbName('u-old')));

    expect(accountVault.list().map((account) => account.user.id)).toEqual([BOB.id]);
    expect(globalThis.localStorage.getItem(PENDING_RETIREMENTS_KEY)).toBeNull();
    expect([...bases]).toEqual([notebookDbName(BOB.id)]);
    expect(heldAccountOf(sessionStore.getState().session)?.user.id).toBe(BOB.id);
  });
});
