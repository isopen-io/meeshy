import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'bun:test';

import { fakeIndexedDb, type FakeIndexedDb } from '@/lib/share-incoming/idb-double';

import { TUS_BACKGROUND_ID_PREFIX, TUS_BACKGROUND_MESSAGE } from './tus-background';
import { TUS_CHECKPOINT_DB_NAME, TUS_CHECKPOINT_STORE_NAME, idbTusCheckpointStore, type TusCheckpoint } from './tus-checkpoint';

/**
 * LE RELAIS DU SERVICE WORKER POUR UN ENVOI DE FOND (#11311). Le script est
 * CLASSIQUE (`importScripts`), sans module : le témoin l'évalue tel quel avec un
 * `self` de substitution, sur le MÊME double d'IndexedDB que le module TS —
 * preuve qu'aucun littéral (base, magasin, préfixe, message) n'a dérivé.
 */
const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'public', 'sw-background-upload.js');

type BackgroundEvent = { readonly registration: unknown; waitUntil(work: Promise<unknown>): void };

function mount(idb: FakeIndexedDb) {
  const listeners = new Map<string, (event: BackgroundEvent) => void>();
  const messages: unknown[] = [];
  const self = {
    addEventListener: (type: string, listener: (event: BackgroundEvent) => void) => listeners.set(type, listener),
    clients: { matchAll: async () => [{ postMessage: (message: unknown) => messages.push(message) }] },
  };
  new Function('self', 'indexedDB', readFileSync(SCRIPT, 'utf8'))(self, idb.factory);
  return { listeners, messages };
}

const FINAL_BODY = JSON.stringify({ success: true, data: { attachment: { id: 'pm-7', fileUrl: '2026/10/u1/scene.png', mimeType: 'image/png', thumbHash: 'th' } } });

async function settle(
  idb: FakeIndexedDb,
  type: string,
  registration: { readonly id: string; readonly matchAll: () => Promise<unknown[]> },
) {
  const world = mount(idb);
  let work: Promise<unknown> = Promise.resolve();
  world.listeners.get(type)?.({ registration, waitUntil: (promise) => (work = promise) });
  await work;
  return world;
}

const successOf = (id: string, response: Response) => ({ id, matchAll: async () => [{ responseReady: Promise.resolve(response) }] });
const checkpoint = (overrides: Partial<TusCheckpoint> = {}): TusCheckpoint => ({
  location: 'https://gate.meeshy.me/api/v1/uploads/up-1',
  offset: 2,
  fileSize: 6,
  fingerprint: 'fp-1',
  savedAt: Date.now(),
  background: `${TUS_BACKGROUND_ID_PREFIX}fp-1`,
  ...overrides,
});
const row = (idb: FakeIndexedDb): TusCheckpoint | undefined => idb.rowsOf(TUS_CHECKPOINT_DB_NAME, TUS_CHECKPOINT_STORE_NAME).get('fp-1') as TusCheckpoint | undefined;

describe('sw-background-upload.js', () => {
  test('écoute la fin, l’échec et l’abandon d’un envoi de fond, et rien d’autre', () => {
    expect([...mount(fakeIndexedDb()).listeners.keys()].sort()).toEqual(['backgroundfetchabort', 'backgroundfetchfail', 'backgroundfetchsuccess']);
  });

  test('un envoi terminé inscrit le média sur le checkpoint, efface le marqueur de fond et prévient les pages', async () => {
    const idb = fakeIndexedDb();
    await idbTusCheckpointStore(idb.factory).save(checkpoint());

    const { messages } = await settle(idb, 'backgroundfetchsuccess', successOf(`${TUS_BACKGROUND_ID_PREFIX}fp-1`, new Response(FINAL_BODY, { status: 200 })));

    expect(row(idb)).toMatchObject({ offset: 6, finished: { postMediaId: 'pm-7', fileUrl: '2026/10/u1/scene.png', mimeType: 'image/png', thumbHash: 'th' } });
    expect(row(idb)?.background).toBeUndefined();
    expect(messages).toEqual([{ type: TUS_BACKGROUND_MESSAGE, fingerprint: 'fp-1' }]);
  });

  test('un « succès » dont la réponse est illisible ne fabrique AUCUN média : le marqueur part, le checkpoint reste', async () => {
    const idb = fakeIndexedDb();
    await idbTusCheckpointStore(idb.factory).save(checkpoint());

    await settle(idb, 'backgroundfetchsuccess', successOf(`${TUS_BACKGROUND_ID_PREFIX}fp-1`, new Response('{"success":true}', { status: 200 })));
    expect(row(idb)?.finished).toBeUndefined();
    expect(row(idb)?.background).toBeUndefined();
    expect(row(idb)?.offset).toBe(2);

    await idbTusCheckpointStore(idb.factory).save(checkpoint());
    await settle(idb, 'backgroundfetchsuccess', successOf(`${TUS_BACKGROUND_ID_PREFIX}fp-1`, new Response(null, { status: 204 })));
    expect(row(idb)?.finished).toBeUndefined();
  });

  test('un échec ou un abandon libère le marqueur : la page reprend au premier plan', async () => {
    for (const type of ['backgroundfetchfail', 'backgroundfetchabort']) {
      const idb = fakeIndexedDb();
      await idbTusCheckpointStore(idb.factory).save(checkpoint());

      const { messages } = await settle(idb, type, { id: `${TUS_BACKGROUND_ID_PREFIX}fp-1`, matchAll: async () => [] });

      expect(row(idb)).toMatchObject({ location: 'https://gate.meeshy.me/api/v1/uploads/up-1', offset: 2 });
      expect(row(idb)?.background).toBeUndefined();
      expect(messages).toHaveLength(1);
    }
  });

  test('un checkpoint annulé entre-temps n’est pas ressuscité', async () => {
    const idb = fakeIndexedDb();

    await settle(idb, 'backgroundfetchsuccess', successOf(`${TUS_BACKGROUND_ID_PREFIX}fp-1`, new Response(FINAL_BODY, { status: 200 })));

    expect(row(idb)).toBeUndefined();
  });

  test('un envoi de fond qui n’est pas le sien (autre préfixe) est ignoré', async () => {
    const idb = fakeIndexedDb();
    const { listeners, messages } = mount(idb);
    let waited = false;

    listeners.get('backgroundfetchsuccess')?.({ registration: { id: 'ailleurs:1', matchAll: async () => [] }, waitUntil: () => (waited = true) });

    expect(waited).toBe(false);
    expect(messages).toEqual([]);
  });

  test('IndexedDB en échec : aucune exception, les pages sont prévenues quand même', async () => {
    const idb = fakeIndexedDb();
    idb.failOpen();

    const { messages } = await settle(idb, 'backgroundfetchsuccess', successOf(`${TUS_BACKGROUND_ID_PREFIX}fp-1`, new Response(FINAL_BODY, { status: 200 })));

    expect(messages).toHaveLength(1);
  });
});
