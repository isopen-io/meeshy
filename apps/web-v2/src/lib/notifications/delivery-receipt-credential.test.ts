import { describe, expect, test } from 'bun:test';
import { createStore } from 'zustand/vanilla';

import { createFakeIndexedDB } from '@/test-support/fake-indexed-db';
import { apiConfig } from '@/lib/api/config';
import type { SessionState } from '@/lib/api/session';
import {
  DELIVERY_RECEIPT_DB_NAME,
  DELIVERY_RECEIPT_DB_VERSION,
  DELIVERY_RECEIPT_KEY,
  DELIVERY_RECEIPT_STORE_NAME,
  deliveryReceiptCredentialOf,
  watchDeliveryReceiptCredential,
  writeDeliveryReceiptCredential,
} from './delivery-receipt-credential';

/**
 * **LE CRÉDENTIAL POSÉ POUR LE SERVICE WORKER** (#7368, W4, critère de fin :
 * « un push reçu par le SW … produit l'accusé de remise »). Sans ce
 * crédential — `Authorization`/`X-Session-Token` et la base de la passerelle
 * — `sw-push.js` ne peut composer AUCUNE requête authentifiée : ce témoin
 * garde la moitié « page » du jumeau, `sw-push.test.ts` l'autre.
 */

const authenticated: SessionState = {
  status: 'authenticated',
  user: { id: 'u1', username: 'awa' },
  token: 'jwt-abc',
  sessionToken: 'legacy-ignored',
  expiresAt: Date.now() + 3_600_000,
};

const guest: SessionState = {
  status: 'guest',
  sessionToken: 'anon_xyz',
  guest: { participantId: 'p1', nickname: 'Invité', conversationId: 'c1', link: 'mshy_abc', mayWrite: true },
  expiresAt: Date.now() + 3_600_000,
};

const anonymous: SessionState = { status: 'anonymous' };

describe('deliveryReceiptCredentialOf — la projection PURE (#7368, W4)', () => {
  test('un compte enregistré rend un crédential « registered »', () => {
    expect(deliveryReceiptCredentialOf(authenticated).credential).toEqual({ kind: 'registered', token: 'jwt-abc' });
  });

  test('un invité de lien rend un crédential « anonymous »', () => {
    expect(deliveryReceiptCredentialOf(guest).credential).toEqual({ kind: 'anonymous', sessionToken: 'anon_xyz' });
  });

  test('aucune session ⇒ aucun crédential — le worker n’a rien à présenter', () => {
    expect(deliveryReceiptCredentialOf(anonymous).credential).toBeNull();
  });

  test('la base de la passerelle voyage avec le crédential — jamais lue autrement par un script statique', () => {
    expect(deliveryReceiptCredentialOf(anonymous).apiBase).toBe(apiConfig.base);
  });
});

describe('watchDeliveryReceiptCredential — posé à l’instant, tenu à jour ensuite', () => {
  function fakeSessionStore(initial: SessionState) {
    return createStore<{ session: SessionState }>(() => ({ session: initial }));
  }

  test('écrit le crédential COURANT dès l’appel — sans attendre un premier changement', () => {
    const store = fakeSessionStore(authenticated);
    const writes: unknown[] = [];
    watchDeliveryReceiptCredential({ sessionStore: store, write: async (v) => void writes.push(v) });
    expect(writes).toEqual([{ apiBase: apiConfig.base, credential: { kind: 'registered', token: 'jwt-abc' } }]);
  });

  test('une déconnexion RETIRE le crédential — jamais laisser le worker accuser sous une identité périmée', () => {
    const store = fakeSessionStore(authenticated);
    const writes: unknown[] = [];
    watchDeliveryReceiptCredential({ sessionStore: store, write: async (v) => void writes.push(v) });
    store.setState({ session: anonymous });
    expect(writes.at(-1)).toEqual({ apiBase: apiConfig.base, credential: null });
  });

  test('le désabonnement rendu arrête la synchronisation', () => {
    const store = fakeSessionStore(authenticated);
    const writes: unknown[] = [];
    const stop = watchDeliveryReceiptCredential({ sessionStore: store, write: async (v) => void writes.push(v) });
    stop();
    store.setState({ session: guest });
    expect(writes.length).toBe(1);
  });
});

describe('writeDeliveryReceiptCredential — la vraie persistance, contre un IndexedDB de test', () => {
  test('un push reçu par le SW peut relire ce que la page vient d’écrire — preuve d’absence de dérive du jumeau', async () => {
    const fake = createFakeIndexedDB();
    (globalThis as { indexedDB?: unknown }).indexedDB = fake;
    try {
      await writeDeliveryReceiptCredential({ apiBase: 'https://gate.meeshy.me', credential: { kind: 'registered', token: 'jwt-abc' } });

      // La lecture rejoue EXACTEMENT ce que `public/sw-push.js` fait — un
      // script classique, jamais un import de ce module.
      const read = await new Promise<unknown>((resolve) => {
        const request = fake.open(DELIVERY_RECEIPT_DB_NAME, DELIVERY_RECEIPT_DB_VERSION);
        request.onsuccess = () => {
          const db = request.result as { transaction(name: string): { objectStore(name: string): { get(key: string): { onsuccess: ((e: { target: unknown }) => void) | null; result: unknown } } } };
          const getRequest = db.transaction(DELIVERY_RECEIPT_STORE_NAME).objectStore(DELIVERY_RECEIPT_STORE_NAME).get(DELIVERY_RECEIPT_KEY);
          getRequest.onsuccess = () => resolve(getRequest.result);
        };
      });

      expect(read).toEqual({ apiBase: 'https://gate.meeshy.me', credential: { kind: 'registered', token: 'jwt-abc' } });
    } finally {
      delete (globalThis as { indexedDB?: unknown }).indexedDB;
    }
  });

  test('IndexedDB absente (portée privée, navigateur ancien) ne lève jamais — best-effort', async () => {
    delete (globalThis as { indexedDB?: unknown }).indexedDB;
    const result = await writeDeliveryReceiptCredential({ apiBase: 'https://gate.meeshy.me', credential: null });
    expect(result).toBeUndefined();
  });
});
