import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { loadMessagePiecesCatalog, translateMessagePieces } from '@/lib/i18n-message-pieces-catalog';
import { localMessageOf } from '@/lib/send/local-message';
import { entriesOf, outboxStore } from '@/lib/send/outbox-store';
import { CONVERSATIONS_QUERY_KEY } from '@/lib/api/conversations';
import { offerLastMessage } from '@/lib/api/list-preview';
import { appQueryClient } from '@/lib/api/query-client';
import type { Conversation } from '@/lib/api/types';
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

const enqueue = (conversationId: string, clientMessageId: string, delivery: 'pending' | 'failed', status = 403) => {
  const message = localMessageOf({ clientMessageId, conversationId, viewerId: 'u-viewer', content: 'salut', originalLanguage: 'fr', now: new Date(0) });
  outboxStore.getState().enqueue(conversationId, { message, delivery: 'pending', attempts: 1, startedAt: 0 });
  offerLastMessage(appQueryClient, conversationId, message);
  if (delivery === 'failed') outboxStore.getState().markFailed(conversationId, clientMessageId, { ok: false, status, error: 'refusé' });
};

const seedRow = (conversationId: string) =>
  appQueryClient.setQueryData(CONVERSATIONS_QUERY_KEY, {
    pages: [
      {
        conversations: [{ id: conversationId, type: 'direct', participants: [], unreadCount: 0 } as unknown as Conversation],
        pagination: { limit: 30, offset: 0, total: 1, hasMore: false },
        cursorPagination: { limit: 30, hasMore: false, nextCursor: null },
      },
    ],
    pageParams: [undefined],
  });

const rowOf = (conversationId: string): Conversation | undefined =>
  appQueryClient
    .getQueryData<{ readonly pages: readonly { readonly conversations: readonly Conversation[] }[] }>(CONVERSATIONS_QUERY_KEY)
    ?.pages.flatMap((p) => p.conversations)
    .find((c) => c.id === conversationId);

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

  test('la ligne de liste ne dit plus l’envoi abandonné', () => {
    seedRow('c-row');
    enqueue('c-row', 'cid_row', 'failed');
    expect(rowOf('c-row')?.lastMessage?.id).toBe('cid_row');
    const { api } = mount('c-row');
    act(() => api().discard('cid_row'));
    expect(rowOf('c-row')?.lastMessage ?? undefined).toBeUndefined();
  });

  test('après un échec ambigu, l’annonce ne promet pas que le message n’est pas parti', () => {
    enqueue('c-ambiguous', 'cid_c', 'failed', 504);
    const { api, announced } = mount('c-ambiguous');
    act(() => api().discard('cid_c'));
    expect(announced.at(-1)).toBe(translateMessagePieces('fr', 'message.send.discarded.uncertain'));
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
