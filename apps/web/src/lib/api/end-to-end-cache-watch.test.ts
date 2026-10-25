import { QueryClient } from '@tanstack/react-query';
import { describe, expect, test } from 'bun:test';

import { canSendPlaintext, createEndToEndRegimeLedger } from '@/lib/end-to-end-regime-ledger';

import { CONVERSATIONS_QUERY_KEY, conversationQueryKey } from './conversations';
import { watchEndToEndConversations } from './end-to-end-cache-watch';

/**
 * #12949 — UNE CONVERSATION SERVIE e2ee DANS LA LISTE EST VUE, même jamais
 * ouverte : le registre du compte l'apprend depuis le cache des conversations
 * (liste et détail), et une relecture servie sans mode ne la rouvre plus.
 */
const row = (id: string, encryptionMode: string | null) => ({ id, type: 'direct', encryptionMode, participants: [] });
const page = (rows: readonly unknown[]) => ({
  pages: [{ conversations: rows, pagination: { limit: 30, offset: 0, total: rows.length, hasMore: false }, cursorPagination: { limit: 30, hasMore: false, nextCursor: null } }],
  pageParams: [undefined],
});

describe('le registre apprend le bout en bout depuis le cache des conversations', () => {
  test('la liste déjà en cache, puis la liste qui arrive, puis le détail', () => {
    const client = new QueryClient();
    const ledger = createEndToEndRegimeLedger({ storage: null });
    client.setQueryData(CONVERSATIONS_QUERY_KEY, page([row('c-1', 'e2ee'), row('c-2', null)]));

    const unwatch = watchEndToEndConversations(client, ledger);
    client.setQueryData(CONVERSATIONS_QUERY_KEY, page([row('c-1', 'e2ee'), row('c-3', 'E2EE'), row('c-2', 'server')]));
    client.setQueryData(conversationQueryKey('c-4'), row('c-4', 'e2ee'));

    expect(['c-1', 'c-2', 'c-3', 'c-4'].map((id) => canSendPlaintext({ conversationId: id }, ledger.getState()))).toEqual([false, true, false, false]);
    unwatch();
  });

  test('servie ensuite sans mode : toujours fermée', () => {
    const client = new QueryClient();
    const ledger = createEndToEndRegimeLedger({ storage: null });
    const unwatch = watchEndToEndConversations(client, ledger);
    client.setQueryData(conversationQueryKey('c-1'), row('c-1', 'e2ee'));
    client.setQueryData(conversationQueryKey('c-1'), row('c-1', null));

    expect(canSendPlaintext({ conversationId: 'c-1' }, ledger.getState())).toBe(false);
    unwatch();
  });

  test('une donnée d’une autre forme ne casse rien et n’apprend rien', () => {
    const client = new QueryClient();
    const ledger = createEndToEndRegimeLedger({ storage: null });
    const unwatch = watchEndToEndConversations(client, ledger);
    client.setQueryData(['conversations', 'c-x', 'members'], { members: [{ id: 'u', encryptionMode: 'e2ee' }] });
    client.setQueryData(['conversations', 'categories'], [{ id: 'k', encryptionMode: 'e2ee' }]);

    expect(ledger.getState().sealed).toEqual({});
    unwatch();
  });
});
