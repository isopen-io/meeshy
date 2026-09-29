import { afterEach, describe, expect, test } from 'bun:test';

import {
  ACCOUNT_CACHE_PREFIX,
  MAX_SHELVED_ACCOUNTS,
  createAccountCacheShelf,
  endRevokedSession,
  forgetAccountCaches,
} from './account-caches';
import { createAppQueryClient, type StorageLike } from './query-client';
import { reactionStore } from './reaction-store';
import { createSessionStore, type SessionStoreApi } from './session';

/**
 * CHANGER DE COMPTE GARDE LE CACHE DE CHAQUE COMPTE (#8674).
 *
 * Revenir sur un compte repeint ses écrans À L'INSTANT, depuis son cache
 * rangé, puis le réseau ne resynchronise que l'écart (les requêtes restaurées
 * sont périmées : TanStack les relit au montage). Et, à aucun instant, un
 * compte ne lit la donnée d'un autre.
 */

function fakeStorage(): StorageLike & { readonly raw: Map<string, string> } {
  const raw = new Map<string, string>();
  return {
    raw,
    getItem: (key) => raw.get(key) ?? null,
    setItem: (key, value) => {
      raw.set(key, value);
    },
    removeItem: (key) => {
      raw.delete(key);
    },
  };
}

const busterOf = (userId: string | null): string => `0.0.0-test:3:https://gate.test:${userId ?? 'anonymous'}`;

function signIn(session: SessionStoreApi, id: string): void {
  session.getState().establish({ user: { id, username: id }, token: `jwt-${id}`, sessionToken: `s-${id}`, expiresIn: 86_400 });
}

function appWith(storage: ReturnType<typeof fakeStorage>, firstAccount: string) {
  const session = createSessionStore({ storage: fakeStorage() });
  signIn(session, firstAccount);
  const client = createAppQueryClient({ storage, buster: busterOf(firstAccount), busterOf, session });
  return { session, client };
}

const everything = (storage: ReturnType<typeof fakeStorage>): string => [...storage.raw.values()].join('\n');

afterEach(() => {
  reactionStore.setState({ mine: {} });
});

describe('A → B : B ne voit rien de A, à aucun instant', () => {
  test('dès l’établissement de B, le cache en mémoire ne porte plus la donnée d’A', () => {
    const storage = fakeStorage();
    const { session, client } = appWith(storage, 'a');
    client.setQueryData(['conversations'], [{ id: 'c-a', title: 'secret de A' }]);

    signIn(session, 'b');

    expect(client.getQueryData(['conversations'])).toBeUndefined();
  });

  test('le cache ACTIF persisté après la bascule ne contient rien d’A', () => {
    const storage = fakeStorage();
    const { session, client } = appWith(storage, 'a');
    client.setQueryData(['conversations'], [{ id: 'c-a', title: 'secret de A' }]);
    client.persist();

    signIn(session, 'b');
    client.setQueryData(['conversations'], [{ id: 'c-b', title: 'liste de B' }]);
    client.persist();

    const active = storage.raw.get('meeshy.query-cache') ?? '';
    expect(active).toContain('liste de B');
    expect(active).not.toContain('secret de A');
  });

  test('« mes réactions » d’A ne passent pas à B', () => {
    const storage = fakeStorage();
    const { session } = appWith(storage, 'a');
    reactionStore.setState({ mine: { m1: ['😂'] } });

    signIn(session, 'b');

    expect(reactionStore.getState().mine).toEqual({});
  });

  test('un rechargement sous B ne réhydrate jamais le cache d’A', () => {
    const storage = fakeStorage();
    const { session, client } = appWith(storage, 'a');
    client.setQueryData(['conversations'], [{ id: 'c-a', title: 'secret de A' }]);
    signIn(session, 'b');
    client.persist();

    const reloaded = createAppQueryClient({ storage, buster: busterOf('b'), busterOf });

    expect(reloaded.getQueryData(['conversations'])).toBeUndefined();
  });
});

describe('A revient : son cache est servi à l’instant', () => {
  test('A → B → A ⇒ la liste d’A est là dès l’établissement, sans réseau', () => {
    const storage = fakeStorage();
    const { session, client } = appWith(storage, 'a');
    client.setQueryData(['conversations'], [{ id: 'c-a', title: 'liste de A' }]);

    signIn(session, 'b');
    client.setQueryData(['conversations'], [{ id: 'c-b', title: 'liste de B' }]);
    signIn(session, 'a');

    expect(client.getQueryData(['conversations'])).toEqual([{ id: 'c-a', title: 'liste de A' }]);
  });

  test('… et B, quitté à son tour, est rangé et revient intact', () => {
    const storage = fakeStorage();
    const { session, client } = appWith(storage, 'a');
    signIn(session, 'b');
    client.setQueryData(['conversations'], [{ id: 'c-b', title: 'liste de B' }]);
    signIn(session, 'a');
    signIn(session, 'b');

    expect(client.getQueryData(['conversations'])).toEqual([{ id: 'c-b', title: 'liste de B' }]);
  });

  test('le cache servi au retour est PÉRIMÉ : le réseau le resynchronise au montage', () => {
    const storage = fakeStorage();
    const { session, client } = appWith(storage, 'a');
    client.setQueryData(['conversations'], [{ id: 'c-a' }], { updatedAt: Date.now() - 60_000 });
    signIn(session, 'b');
    signIn(session, 'a');

    const query = client.getQueryCache().find({ queryKey: ['conversations'] });
    expect(query?.isStaleByTime(30_000) ?? false).toBe(true);
  });

  test('« mes réactions » d’A reviennent avec son cache', () => {
    const storage = fakeStorage();
    const { session } = appWith(storage, 'a');
    reactionStore.setState({ mine: { m1: ['😂'] } });
    signIn(session, 'b');
    signIn(session, 'a');

    expect(reactionStore.getState().mine).toEqual({ m1: ['😂'] });
  });

  test('reconnexion du même compte après « quitter » (suspend) ⇒ son cache revient', () => {
    const storage = fakeStorage();
    const { session, client } = appWith(storage, 'a');
    client.setQueryData(['conversations'], [{ id: 'c-a' }]);

    session.getState().clearSession();
    expect(client.getQueryData(['conversations'])).toBeUndefined();
    signIn(session, 'a');

    expect(client.getQueryData(['conversations'])).toEqual([{ id: 'c-a' }]);
  });

  test('le cache repris quitte l’étagère : il redevient le cache ACTIF, persisté', () => {
    const storage = fakeStorage();
    const { session, client } = appWith(storage, 'a');
    client.setQueryData(['conversations'], [{ id: 'c-a', title: 'liste de A' }]);
    signIn(session, 'b');
    signIn(session, 'a');

    expect(storage.raw.has(`${ACCOUNT_CACHE_PREFIX}a`)).toBe(false);
    expect(storage.raw.get('meeshy.query-cache') ?? '').toContain('liste de A');
  });

  test('un cache rangé sous une AUTRE version (ou une autre API) n’est pas réhydraté', () => {
    const storage = fakeStorage();
    const { session, client } = appWith(storage, 'a');
    client.setQueryData(['conversations'], [{ id: 'c-a' }]);
    signIn(session, 'b');

    const other = createSessionStore({ storage: fakeStorage() });
    signIn(other, 'b');
    const upgraded = createAppQueryClient({
      storage,
      buster: `9.9.9:${busterOf('b')}`,
      busterOf: (id) => `9.9.9:${busterOf(id)}`,
      session: other,
    });
    signIn(other, 'a');

    expect(upgraded.getQueryData(['conversations'])).toBeUndefined();
    expect(storage.raw.has(`${ACCOUNT_CACHE_PREFIX}a`)).toBe(false);
  });
});

describe('l’étagère est bornée et se vide à la fin d’un compte', () => {
  test(`au-delà de ${MAX_SHELVED_ACCOUNTS} comptes quittés, le plus ancien part`, () => {
    const storage = fakeStorage();
    const { session, client } = appWith(storage, 'a');
    ['a', 'b', 'c', 'd', 'e'].forEach((id) => {
      signIn(session, id);
      client.setQueryData(['conversations'], [{ id: `c-${id}` }]);
    });

    const shelved = [...storage.raw.keys()].filter((key) => key.startsWith(ACCOUNT_CACHE_PREFIX));
    expect(shelved.sort()).toEqual([`${ACCOUNT_CACHE_PREFIX}b`, `${ACCOUNT_CACHE_PREFIX}c`, `${ACCOUNT_CACHE_PREFIX}d`]);
  });

  test('stockage plein : le compte quitté est rangé en retirant les plus anciens', () => {
    const raw = new Map<string, string>();
    const quota = 2;
    const storage = {
      raw,
      getItem: (key: string) => raw.get(key) ?? null,
      setItem: (key: string, value: string) => {
        const shelved = [...raw.keys()].filter((k) => k.startsWith(ACCOUNT_CACHE_PREFIX) && k !== key).length;
        if (key.startsWith(ACCOUNT_CACHE_PREFIX) && shelved >= quota) throw new DOMException('full', 'QuotaExceededError');
        raw.set(key, value);
      },
      removeItem: (key: string) => {
        raw.delete(key);
      },
    };
    const shelf = createAccountCacheShelf(storage);
    shelf.put('a', 'A');
    shelf.put('b', 'B');
    shelf.put('c', 'C');

    expect(shelf.list()).toEqual(['c', 'b']);
    expect(raw.has(`${ACCOUNT_CACHE_PREFIX}a`)).toBe(false);
  });

  test('déconnexion d’A (oubli) ⇒ A revenu ne retrouve rien, et les seaux du service worker partent', async () => {
    const storage = fakeStorage();
    const { session, client } = appWith(storage, 'a');
    client.setQueryData(['conversations'], [{ id: 'c-a', title: 'secret de A' }]);
    const remaining = new Set(['api', 'medias', 'workbox-precache-v2-x']);
    const cacheStorage = { keys: async () => [...remaining], delete: async (name: string) => remaining.delete(name) };

    session.getState().clearSession();
    forgetAccountCaches({ userId: 'a', storage, cacheStorage });
    await Promise.resolve();
    await Promise.resolve();
    signIn(session, 'a');

    expect(client.getQueryData(['conversations'])).toBeUndefined();
    expect(everything(storage)).not.toContain('secret de A');
    expect([...remaining]).toEqual(['workbox-precache-v2-x']);
  });

  test('session révoquée (401) ⇒ la session finit et le cache d’A part avec elle', () => {
    const storage = fakeStorage();
    const { session, client } = appWith(storage, 'a');
    client.setQueryData(['conversations'], [{ id: 'c-a', title: 'secret de A' }]);

    endRevokedSession(session, { storage, cacheStorage: { keys: async () => [], delete: async () => false } });

    expect(session.getState().session.status).toBe('anonymous');
    expect(everything(storage)).not.toContain('secret de A');
  });

  test('la mise à jour de l’application jette AUSSI l’étagère', () => {
    const storage = fakeStorage();
    const { session, client } = appWith(storage, 'a');
    client.setQueryData(['conversations'], [{ id: 'c-a', title: 'secret de A' }]);
    signIn(session, 'b');

    client.discardPersisted();

    expect([...storage.raw.keys()].filter((key) => key.startsWith('meeshy.query-cache'))).toEqual([]);
  });

  test('un invité quitté n’est jamais rangé', () => {
    const storage = fakeStorage();
    const session = createSessionStore({ storage: fakeStorage() });
    session.getState().establishGuest({
      sessionToken: 'anon-1',
      guest: { participantId: 'p1', nickname: 'Invité', conversationId: 'c1', link: 'lien', mayWrite: true },
    });
    const client = createAppQueryClient({ storage, buster: busterOf(null), busterOf, session });
    client.setQueryData(['link', 'lien'], { title: 'conversation du lien' });
    client.persist();

    signIn(session, 'b');

    expect(everything(storage)).not.toContain('conversation du lien');
    expect(client.getQueryData(['link', 'lien'])).toBeUndefined();
  });
});
