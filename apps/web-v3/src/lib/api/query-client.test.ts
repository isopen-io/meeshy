import { afterEach, describe, expect, test } from 'bun:test';

import { ApiError } from './client';
import { createAppQueryClient, purgeReaderCaches, shouldRetry, type StorageLike } from './query-client';
import { reactionStore } from './reaction-store';
import { createSessionStore } from './session';

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

describe('shouldRetry — les deux moitiés', () => {
  test('ApiError 401/403/404 ⇒ false dès le 1er échec', () => {
    for (const status of [401, 403, 404]) {
      const error = new ApiError({ ok: false, status, error: 'refus' });
      expect(shouldRetry(1, error)).toBe(false);
    }
  });

  test('status 0 / 500 / TIMEOUT ⇒ true jusqu’à 2, false au 3e', () => {
    for (const error of [
      new ApiError({ ok: false, status: 0, error: 'réseau' }),
      new ApiError({ ok: false, status: 500, error: 'panne' }),
      new ApiError({ ok: false, status: 0, error: 'délai', code: 'TIMEOUT' }),
    ]) {
      expect(shouldRetry(1, error)).toBe(true);
      expect(shouldRetry(2, error)).toBe(true);
      expect(shouldRetry(3, error)).toBe(false);
    }
  });
});

describe('persistence — round trip', () => {
  test('même storage, même buster ⇒ getQueryData rend la donnée persistée', () => {
    const storage = fakeStorage();
    const a = createAppQueryClient({ storage, buster: '0.0.0-test:u1' });
    a.setQueryData(['conversations'], [{ id: 'c-1' }]);
    a.persist();

    const b = createAppQueryClient({ storage, buster: '0.0.0-test:u1' });
    expect(b.getQueryData(['conversations'])).toEqual([{ id: 'c-1' }]);
  });

  test('buster différent ⇒ undefined ET l’entrée est purgée', () => {
    const storage = fakeStorage();
    const a = createAppQueryClient({ storage, buster: '0.0.0-test:u1' });
    a.setQueryData(['conversations'], [{ id: 'c-1' }]);
    a.persist();

    const b = createAppQueryClient({ storage, buster: '0.0.0-test:u2' });
    expect(b.getQueryData(['conversations'])).toBeUndefined();
    expect(storage.raw.has('meeshy.query-cache')).toBe(false);
  });

  test('JSON corrompu ⇒ undefined, aucune exception', () => {
    const storage = fakeStorage();
    storage.setItem('meeshy.query-cache', '{ pas du json');
    expect(() => createAppQueryClient({ storage, buster: '0.0.0-test:u1' })).not.toThrow();
    const client = createAppQueryClient({ storage, buster: '0.0.0-test:u1' });
    expect(client.getQueryData(['conversations'])).toBeUndefined();
  });
});

describe('la session purge le cache', () => {
  test('clearSession() sur le magasin injecté ⇒ getQueryData undefined et le storage ne porte plus meeshy.query-cache', () => {
    const storage = fakeStorage();
    const session = createSessionStore({ storage: fakeStorage() });
    session.getState().establish({
      user: { id: 'u-1', username: 'ada' },
      token: 'jwt',
      sessionToken: 'sess',
      expiresIn: 86_400,
    });

    const client = createAppQueryClient({ storage, buster: '0.0.0-test:u-1', session });
    client.setQueryData(['conversations'], [{ id: 'c-1' }]);
    client.persist();
    expect(storage.raw.has('meeshy.query-cache')).toBe(true);

    session.getState().clearSession();

    expect(client.getQueryData(['conversations'])).toBeUndefined();
    expect(storage.raw.has('meeshy.query-cache')).toBe(false);
  });
});

/**
 * REVUE-CORRECTION (#5650) — CE QUI PART À CÔTÉ DU CACHE DE REQUÊTES.
 *
 * Le `buster` par identité protège le cache TanStack et son entrée de
 * `localStorage`. Mais câbler la passerelle a fait entrer, pour la PREMIÈRE
 * fois, des réponses `/api/**` dans le `runtimeCaching` du service worker
 * (`vite.config.ts` : seau `api`, NetworkFirst, 200 entrées, sept jours) et
 * des médias dans le seau `medias` — sur le DISQUE, et resservis dès que le
 * réseau dépasse trois secondes ou tombe. Sans cette purge, la liste du
 * compte PRÉCÉDENT restait servable au compte suivant sur le même appareil.
 *
 * Le témoin exige aussi que le seau de PRÉCACHE survive : purger le shell à
 * chaque déconnexion referait payer 400 Ko au lecteur pour rien.
 */
describe('la session purge AUSSI les seaux du service worker (D-6)', () => {
  function fakeCaches(names: readonly string[]) {
    const remaining = new Set(names);
    return {
      remaining,
      keys: async () => [...remaining],
      delete: async (name: string) => remaining.delete(name),
    };
  }

  test('changement d’identité ⇒ les seaux `api` et `medias` sont supprimés, le précache SURVIT', async () => {
    const storage = fakeStorage();
    const session = createSessionStore({ storage: fakeStorage() });
    session.getState().establish({
      user: { id: 'u-1', username: 'ada' },
      token: 'jwt',
      sessionToken: 'sess',
      expiresIn: 86_400,
    });
    const cacheStorage = fakeCaches(['api', 'medias', 'workbox-precache-v2-https://x/']);

    createAppQueryClient({ storage, buster: '0.0.0-test:u-1', session, cacheStorage });
    session.getState().clearSession();
    await Promise.resolve();
    await Promise.resolve();

    expect([...cacheStorage.remaining]).toEqual(['workbox-precache-v2-https://x/']);
  });

  test('purgeReaderCaches sans CacheStorage (coque, Node) ⇒ aucune exception', () => {
    expect(() => purgeReaderCaches(undefined)).not.toThrow();
  });
});

/**
 * « MES RÉACTIONS » SURVIT SUR LA MÊME HORLOGE QUE LE CACHE DES MESSAGES
 * (revue #5814, défaut majeur 5, BLOQUANT) — reproduit exactement la
 * séquence mesurée (`recette4.mjs`) : sans ce correctif, un rechargement
 * restaurait `reactionSummary` (persisté avec le reste du cache) mais PAS
 * `reactionStore.mine` (magasin séparé, jamais persisté) — un compte de
 * réactions affiché sans que « la vôtre » ne le reconnaisse plus, doublant
 * au tap suivant et rendant le RETRAIT définitivement inerte (loi 4).
 *
 * `reactionStore` est un singleton de MODULE (comme en production) — chaque
 * test le remet à `{}` pour ne pas polluer le suivant.
 */
describe('« mes réactions » (reactionStore) survit au rechargement, SUR LA MÊME HORLOGE que le cache (revue #5814, défaut majeur 5)', () => {
  afterEach(() => {
    reactionStore.setState({ mine: {} });
  });

  test('même storage, même buster ⇒ reactionStore.mine est restauré APRÈS un rechargement simulé', () => {
    const storage = fakeStorage();
    const a = createAppQueryClient({ storage, buster: '0.0.0-test:u1' });
    reactionStore.getState().add('m1', '😂');
    a.persist();

    // « rechargement » : un NOUVEAU client, sur le MÊME storage/buster —
    // le module `reactionStore` est un singleton, donc un vrai rechargement
    // de page le remettrait à `{}` avant l'hydratation ; on simule cette
    // remise à zéro ici pour isoler ce que l'hydratation restaure.
    reactionStore.setState({ mine: {} });
    expect(reactionStore.getState().mine.m1).toBeUndefined();

    createAppQueryClient({ storage, buster: '0.0.0-test:u1' });

    expect(reactionStore.getState().mine.m1).toEqual(['😂']);
  });

  test('buster différent (déconnexion/reconnexion) ⇒ reactionStore.mine ne fuit PAS vers la nouvelle identité (D-6)', () => {
    const storage = fakeStorage();
    createAppQueryClient({ storage, buster: '0.0.0-test:u1' });
    reactionStore.getState().add('m1', '😂');
    storage.setItem(
      'meeshy.query-cache',
      JSON.stringify({ buster: '0.0.0-test:u1', state: { queries: [], mutations: [] }, reactions: { m1: ['😂'] } }),
    );

    reactionStore.setState({ mine: {} });
    createAppQueryClient({ storage, buster: '0.0.0-test:u2' });

    expect(reactionStore.getState().mine.m1).toBeUndefined();
  });

  test('un cache écrit AVANT ce correctif (sans `reactions`) ⇒ hydratation SANS exception, `mine` reste vide', () => {
    const storage = fakeStorage();
    storage.setItem('meeshy.query-cache', JSON.stringify({ buster: '0.0.0-test:u1', state: { queries: [], mutations: [] } }));

    expect(() => createAppQueryClient({ storage, buster: '0.0.0-test:u1' })).not.toThrow();
    expect(reactionStore.getState().mine).toEqual({});
  });

  test('changement d’identité ⇒ reactionStore.mine est vidé, même sans nouvelle réaction pour l’écraser', () => {
    const storage = fakeStorage();
    const session = createSessionStore({ storage: fakeStorage() });
    session.getState().establish({ user: { id: 'u-1', username: 'ada' }, token: 'jwt', sessionToken: 'sess', expiresIn: 86_400 });
    createAppQueryClient({ storage, buster: '0.0.0-test:u-1', session });
    reactionStore.getState().add('m1', '😂');
    expect(reactionStore.getState().mine.m1).toEqual(['😂']);

    session.getState().clearSession();

    expect(reactionStore.getState().mine.m1).toBeUndefined();
  });
});
