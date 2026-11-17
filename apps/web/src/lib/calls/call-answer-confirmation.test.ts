import { describe, expect, test } from 'bun:test';

import { createFakeIndexedDB } from '@/test-support/fake-indexed-db';

import {
  CALL_INTENT_DB_NAME,
  CALL_INTENT_STORE_NAME,
  consumeCallAnswerConfirmation,
} from './call-answer-confirmation';

/**
 * LA CONFIRMATION QUE LE WORKER POSE AVANT D'OUVRIR L'ONGLET (#18907) — une
 * adresse `?repondre=<id>` ne suffit pas à décrocher : seul le worker, qui a
 * reçu le toucher « Répondre », écrit `{ callId, until }` ; la page la lit et la
 * SUPPRIME. Une adresse forgée n'a rien posé.
 */

const seeded = (entry: unknown, key = 'call-1') => {
  const idb = createFakeIndexedDB();
  idb.seed(CALL_INTENT_DB_NAME, CALL_INTENT_STORE_NAME, key, entry);
  return idb;
};

describe('consommer la confirmation du worker', () => {
  test('une confirmation posée pour CET appel, encore valable, se lit une fois puis disparaît', async () => {
    const idb = seeded({ callId: 'call-1', until: 5_000 });
    expect(await consumeCallAnswerConfirmation({ callId: 'call-1', now: 1_000, indexedDB: idb as unknown as IDBFactory })).toBe(true);
    expect(idb.peek(CALL_INTENT_DB_NAME, CALL_INTENT_STORE_NAME, 'call-1')).toBeUndefined();
    expect(await consumeCallAnswerConfirmation({ callId: 'call-1', now: 1_000, indexedDB: idb as unknown as IDBFactory })).toBe(false);
  });

  test('sans rien posé par le worker, une adresse forgée ne confirme rien', async () => {
    const idb = createFakeIndexedDB();
    expect(await consumeCallAnswerConfirmation({ callId: 'call-1', now: 1_000, indexedDB: idb as unknown as IDBFactory })).toBe(false);
  });

  test('la confirmation d’un AUTRE appel ne vaut pas pour celui-ci', async () => {
    const idb = seeded({ callId: 'call-2', until: 5_000 }, 'call-2');
    expect(await consumeCallAnswerConfirmation({ callId: 'call-1', now: 1_000, indexedDB: idb as unknown as IDBFactory })).toBe(false);
    expect(idb.peek(CALL_INTENT_DB_NAME, CALL_INTENT_STORE_NAME, 'call-2')).toBeDefined();
  });

  test('une confirmation périmée ne confirme rien, et se retire quand même', async () => {
    const idb = seeded({ callId: 'call-1', until: 500 });
    expect(await consumeCallAnswerConfirmation({ callId: 'call-1', now: 1_000, indexedDB: idb as unknown as IDBFactory })).toBe(false);
    expect(idb.peek(CALL_INTENT_DB_NAME, CALL_INTENT_STORE_NAME, 'call-1')).toBeUndefined();
  });

  test('une entrée mal formée ne confirme rien', async () => {
    const idb = seeded({ callId: 'call-1' });
    expect(await consumeCallAnswerConfirmation({ callId: 'call-1', now: 1_000, indexedDB: idb as unknown as IDBFactory })).toBe(false);
  });

  test('sans IndexedDB, rien ne décroche seul (fail-closed)', async () => {
    expect(await consumeCallAnswerConfirmation({ callId: 'call-1', now: 1_000, indexedDB: undefined })).toBe(false);
  });
});
