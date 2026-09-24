import { describe, expect, test } from 'bun:test';

import type { LocalMessage } from './local-message';
import { confirmedCountOf, createOutboxStore, EMPTY_ENTRIES, entriesOf, type OutboxEntry } from './outbox-store';

const localMessage = (clientMessageId: string): LocalMessage =>
  ({
    id: clientMessageId,
    clientMessageId,
    conversationId: 'c-a',
    senderId: 'u-viewer',
    content: 'bonjour',
    originalLanguage: 'fr',
    messageType: 'text',
    messageSource: 'user',
    isEdited: false,
    isViewOnce: false,
    viewOnceCount: 0,
    isBlurred: false,
    deliveredCount: 0,
    readCount: 0,
    reactionCount: 0,
    isEncrypted: false,
    translations: [],
    createdAt: new Date('2026-09-09T10:00:00.000Z'),
    timestamp: new Date('2026-09-09T10:00:00.000Z'),
  }) as LocalMessage;

const entry = (clientMessageId: string, overrides: Partial<OutboxEntry> = {}): OutboxEntry => ({
  message: localMessage(clientMessageId),
  delivery: 'pending',
  attempts: 1,
  startedAt: 1_000,
  ...overrides,
});

describe('outboxStore', () => {
  test('enqueue ⇒ entriesOf la rend ; une AUTRE conversation rend EMPTY_ENTRIES (même référence)', () => {
    const store = createOutboxStore();
    store.getState().enqueue('c-a', entry('cid_1'));

    expect(entriesOf(store.getState(), 'c-a')).toHaveLength(1);
    expect(entriesOf(store.getState(), 'c-a')[0]?.message.clientMessageId).toBe('cid_1');

    const first = entriesOf(store.getState(), 'c-b');
    const second = entriesOf(store.getState(), 'c-b');
    expect(first).toBe(EMPTY_ENTRIES);
    expect(first).toBe(second);
  });

  test('markPending / markFailed / remove sont immuables — les entrées non touchées sont toBe-identiques', () => {
    const store = createOutboxStore();
    store.getState().enqueue('c-a', entry('cid_1'));
    store.getState().enqueue('c-a', entry('cid_2'));
    const before = entriesOf(store.getState(), 'c-a');
    const untouched = before[1]!;

    store.getState().markPending('c-a', 'cid_1', 2_000);
    const afterPending = entriesOf(store.getState(), 'c-a');
    expect(afterPending).not.toBe(before);
    expect(afterPending[0]?.delivery).toBe('pending');
    expect(afterPending[0]?.startedAt).toBe(2_000);
    expect(afterPending[1]).toBe(untouched);

    store.getState().markFailed('c-a', 'cid_1', { ok: false, status: 500, error: 'panne' });
    const afterFailed = entriesOf(store.getState(), 'c-a');
    expect(afterFailed[0]?.delivery).toBe('failed');
    expect(afterFailed[0]?.attempts).toBe(2); // incrémenté par markFailed
    expect(afterFailed[0]?.lastError?.status).toBe(500);
    expect(afterFailed[1]).toBe(untouched);

    store.getState().remove('c-a', 'cid_1');
    const afterRemove = entriesOf(store.getState(), 'c-a');
    expect(afterRemove).toHaveLength(1);
    expect(afterRemove[0]).toBe(untouched);
  });

  /**
   * LE COMPTE DES CONFIRMATIONS (revue-correction #5813). L'annonce lecteur
   * d'écran se dérivait du seul compte d'entrées `failed` : « Message
   * envoyé » se déclenchait donc quand ce compte BAISSAIT — c'est-à-dire au
   * DÉBUT d'une reprise (`markPending`), avant tout appel réseau, et pas une
   * seule fois sur un envoi qui réussit du premier coup (le compte de
   * `failed` n'y bouge jamais). Une reprise qui échoue annonçait « Message
   * envoyé » puis « Message non envoyé ». `remove` est le SEUL geste qu'une
   * confirmation provoque : c'est lui, et lui seul, qui compte.
   */
  test('confirmed ne compte QUE les confirmations — markPending et markFailed ne le bougent jamais', () => {
    const store = createOutboxStore();
    store.getState().enqueue('c-a', entry('cid_1'));
    expect(confirmedCountOf(store.getState(), 'c-a')).toBe(0);

    store.getState().markFailed('c-a', 'cid_1', { ok: false, status: 500, error: 'panne' });
    expect(confirmedCountOf(store.getState(), 'c-a')).toBe(0);

    store.getState().markPending('c-a', 'cid_1', 2_000);
    expect(confirmedCountOf(store.getState(), 'c-a')).toBe(0);

    store.getState().remove('c-a', 'cid_1');
    expect(confirmedCountOf(store.getState(), 'c-a')).toBe(1);

    // Un `remove` qui ne retire RIEN n'a rien confirmé.
    store.getState().remove('c-a', 'cid_1');
    expect(confirmedCountOf(store.getState(), 'c-a')).toBe(1);

    // ET LE COMPTE EST PAR CONVERSATION : une confirmation dans `c-a` n'est
    // jamais annoncée par le fil `c-b`.
    expect(confirmedCountOf(store.getState(), 'c-b')).toBe(0);
  });

  test('remove retire la clé de conversation quand elle devient vide — jamais un [] orphelin', () => {
    const store = createOutboxStore();
    store.getState().enqueue('c-a', entry('cid_1'));
    store.getState().remove('c-a', 'cid_1');
    expect('c-a' in store.getState().entries).toBe(false);
  });

  /**
   * #5668 — `markUploaded` pose `attachmentIds` SUR `upload`, sans y toucher
   * si l'entrée n'a jamais porté `upload` (un envoi sans pièce jointe).
   */
  test('markUploaded pose upload.attachmentIds sans changer upload.files', () => {
    const store = createOutboxStore();
    const withUpload = entry('cid_1', { upload: { files: [] } });
    store.getState().enqueue('c-a', withUpload);

    store.getState().markUploaded('c-a', 'cid_1', ['att-1', 'att-2']);

    expect(entriesOf(store.getState(), 'c-a')[0]?.upload?.attachmentIds).toEqual(['att-1', 'att-2']);
    expect(entriesOf(store.getState(), 'c-a')[0]?.upload?.files).toBe(withUpload.upload!.files);
  });

  test('markUploaded sur une entrée SANS upload ne pose rien (aucun champ inventé)', () => {
    const store = createOutboxStore();
    store.getState().enqueue('c-a', entry('cid_1'));

    store.getState().markUploaded('c-a', 'cid_1', ['att-1']);

    expect(entriesOf(store.getState(), 'c-a')[0]?.upload).toBeUndefined();
  });
});
