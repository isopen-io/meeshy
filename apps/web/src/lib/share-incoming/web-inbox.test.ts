import { describe, expect, test } from 'bun:test';

import { fakeIndexedDb } from './idb-double';
import { SHARE_DB_NAME, SHARE_KEY, SHARE_MAX_AGE_MS, SHARE_STORE_NAME, takeWebShare } from './web-inbox';

/**
 * LA BOÎTE DE RÉCEPTION DU WEB (#8884) — ce que `sw-share-target.js` a rangé
 * est lu UNE fois par la page, puis purgé : un partage ne se rejoue pas, et
 * aucun fichier d'un tiers ne reste sur l'appareil au-delà de son usage.
 * Le jumeau avec le worker est prouvé dans `sw-share-target.test.ts`.
 */
const NOW = 1_800_000_000_000;

const seed = (receivedAt: number, extra: Record<string, unknown> = {}) => {
  const store = fakeIndexedDb();
  const open = store.factory.open(SHARE_DB_NAME, 1);
  open.onupgradeneeded = () => open.result.createObjectStore(SHARE_STORE_NAME);
  open.onsuccess = () => {
    open.result.transaction(SHARE_STORE_NAME, 'readwrite').objectStore(SHARE_STORE_NAME).put(
      { receivedAt, files: [], text: 'Bonjour', title: '', url: '', ...extra },
      SHARE_KEY,
    );
  };
  return store;
};

const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe('takeWebShare — lire le partage reçu, puis le purger', () => {
  test('rend le partage reçu et le retire du magasin', async () => {
    const store = seed(NOW - 1000);
    await settle();
    expect(await takeWebShare({ indexedDB: store.factory, now: () => NOW })).toMatchObject({ text: 'Bonjour', files: [] });
    expect(store.rowsOf(SHARE_DB_NAME, SHARE_STORE_NAME).has(SHARE_KEY)).toBe(false);
  });

  test('rien de reçu : null', async () => {
    expect(await takeWebShare({ indexedDB: fakeIndexedDb().factory, now: () => NOW })).toBeNull();
  });

  test('un partage plus vieux que l’heure est purgé et jamais rendu', async () => {
    const store = seed(NOW - SHARE_MAX_AGE_MS - 1);
    await settle();
    expect(await takeWebShare({ indexedDB: store.factory, now: () => NOW })).toBeNull();
    expect(store.rowsOf(SHARE_DB_NAME, SHARE_STORE_NAME).has(SHARE_KEY)).toBe(false);
  });

  test('une entrée malformée est purgée et rend null', async () => {
    const store = seed(NOW, { files: 'pas-une-liste' });
    await settle();
    expect(await takeWebShare({ indexedDB: store.factory, now: () => NOW })).toBeNull();
    expect(store.rowsOf(SHARE_DB_NAME, SHARE_STORE_NAME).has(SHARE_KEY)).toBe(false);
  });

  test('un stockage indisponible rend null, sans lever', async () => {
    const store = fakeIndexedDb();
    store.failOpen();
    expect(await takeWebShare({ indexedDB: store.factory, now: () => NOW })).toBeNull();
    expect(await takeWebShare({ indexedDB: undefined, now: () => NOW })).toBeNull();
  });
});
