import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { loadMessagePiecesCatalog, translateMessagePieces } from '@/lib/i18n-message-pieces-catalog';
import { localMessageOf } from '@/lib/send/local-message';
import { entriesOf, outboxStore } from '@/lib/send/outbox-store';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { useSend } from './use-send';

/**
 * #12632 — ABANDONNER UN ENVOI EN ÉCHEC. `useSend.discard` retire l'entrée de
 * l'outbox (sans la compter confirmée), donc la bulle quitte le fil, et le dit
 * dans la région vivante. Un envoi encore en vol ne s'abandonne pas : sa
 * confirmation peut encore arriver.
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(async () => {
  await Promise.all([loadInterfaceCatalog('fr'), loadMessagePiecesCatalog('fr')]);
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

let root: Root;

afterEach(() => {
  act(() => root.unmount());
  document.body.replaceChildren();
});

const enqueue = (conversationId: string, clientMessageId: string, delivery: 'pending' | 'failed') => {
  const message = localMessageOf({ clientMessageId, conversationId, viewerId: 'u-viewer', content: 'salut', originalLanguage: 'fr', now: new Date(0) });
  outboxStore.getState().enqueue(conversationId, { message, delivery: 'pending', attempts: 1, startedAt: 0 });
  if (delivery === 'failed') outboxStore.getState().markFailed(conversationId, clientMessageId, { ok: false, status: 403, error: 'refusé' });
};

function mount(conversationId: string) {
  const announced: string[] = [];
  let latest!: ReturnType<typeof useSend>;
  function Harness() {
    latest = useSend({ conversationId, viewerId: 'u-viewer', announce: (text) => announced.push(text) });
    return null;
  }
  const container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  act(() => root.render(<Harness />));
  return { api: () => latest, announced };
}

describe('useSend.discard', () => {
  test('un envoi en échec quitte l’outbox et le fil, et l’abandon s’annonce', () => {
    enqueue('c-discard', 'cid_a', 'failed');
    const { api, announced } = mount('c-discard');
    expect(api().pending.map((m) => m.id)).toEqual(['cid_a']);
    act(() => api().discard('cid_a'));
    expect(entriesOf(outboxStore.getState(), 'c-discard')).toEqual([]);
    expect(api().pending).toEqual([]);
    expect(announced.at(-1)).toBe(translateMessagePieces('fr', 'message.send.discarded'));
    expect(outboxStore.getState().confirmed['c-discard']).toBeUndefined();
  });

  test('un envoi encore en vol ne s’abandonne pas', () => {
    enqueue('c-flight', 'cid_b', 'pending');
    const { api, announced } = mount('c-flight');
    act(() => api().discard('cid_b'));
    expect(api().pending.map((m) => m.id)).toEqual(['cid_b']);
    expect(announced).toEqual([]);
    act(() => outboxStore.getState().discard('c-flight', 'cid_b'));
  });

  test('un envoi inconnu ne dit rien', () => {
    const { api, announced } = mount('c-empty');
    act(() => api().discard('cid_none'));
    expect(announced).toEqual([]);
  });
});
