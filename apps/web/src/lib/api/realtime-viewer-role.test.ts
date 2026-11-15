import { QueryClient } from '@tanstack/react-query';
import { describe, expect, test } from 'bun:test';

import { CONVERSATIONS_QUERY_KEY, conversationQueryKey } from './conversations';
import type { ConversationsInfiniteData } from './conversations-pages';
import { viewerRoleUpdatedListener } from './realtime-viewer-role';
import type { Conversation } from './types';

/**
 * #15987 — LE RANG DU LECTEUR CHANGE : sa capacité suit. `participant:role-updated`
 * qui le nomme porte, depuis la passerelle de ce lot, sa capacité recalculée ;
 * la liste et le détail la prennent. Un serveur antérieur ne la porte pas : la
 * capacité périmée s'efface (la règle locale reprend) et le détail se relit.
 */

const conversation = (overrides: Partial<Conversation> = {}): Conversation =>
  ({ id: 'c-1', currentUserRole: 'member', viewerCapabilities: { canMakeObsolete: false }, ...overrides }) as unknown as Conversation;

const seed = () => {
  const queryClient = new QueryClient();
  const list = { pages: [{ conversations: [conversation(), conversation({ id: 'c-2' })] }], pageParams: [undefined] } as unknown as ConversationsInfiniteData;
  queryClient.setQueryData(CONVERSATIONS_QUERY_KEY, list);
  queryClient.setQueryData(conversationQueryKey('c-1'), conversation());
  return queryClient;
};

const row = (queryClient: QueryClient, id = 'c-1') =>
  queryClient.getQueryData<ConversationsInfiniteData>(CONVERSATIONS_QUERY_KEY)?.pages[0]?.conversations.find((c) => c.id === id);
const detail = (queryClient: QueryClient) => queryClient.getQueryData<Conversation>(conversationQueryKey('c-1'));

describe('participant:role-updated qui nomme le lecteur', () => {
  test('promu, il prend la capacité servie dans la liste ET le détail', () => {
    const queryClient = seed();
    viewerRoleUpdatedListener(queryClient, () => 'u-me')({
      conversationId: 'c-1', userId: 'u-me', newRole: 'ADMIN', updatedBy: 'u-z', viewerCapabilities: { canMakeObsolete: true },
    });
    expect(row(queryClient)?.viewerCapabilities).toEqual({ canMakeObsolete: true });
    expect(row(queryClient)?.currentUserRole).toBe('admin');
    expect(detail(queryClient)?.viewerCapabilities).toEqual({ canMakeObsolete: true });
    expect(row(queryClient, 'c-2')?.currentUserRole).toBe('member');
  });

  test('rétrogradé, il perd la capacité', () => {
    const queryClient = seed();
    queryClient.setQueryData(conversationQueryKey('c-1'), conversation({ currentUserRole: 'admin', viewerCapabilities: { canMakeObsolete: true } }));
    viewerRoleUpdatedListener(queryClient, () => 'u-me')({
      conversationId: 'c-1', userId: 'u-me', newRole: 'member', updatedBy: 'u-z', viewerCapabilities: { canMakeObsolete: false },
    });
    expect(detail(queryClient)?.viewerCapabilities).toEqual({ canMakeObsolete: false });
    expect(detail(queryClient)?.currentUserRole).toBe('member');
  });

  test('serveur antérieur (sans capacité) : la capacité périmée s’efface et le détail est relu', () => {
    const queryClient = seed();
    viewerRoleUpdatedListener(queryClient, () => 'u-me')({ conversationId: 'c-1', userId: 'u-me', newRole: 'admin', updatedBy: 'u-z' });
    const after = row(queryClient);
    expect(after !== undefined && 'viewerCapabilities' in after).toBe(false);
    expect(queryClient.getQueryState(conversationQueryKey('c-1'))?.isInvalidated).toBe(true);
  });

  test('une capacité illisible est traitée comme absente', () => {
    const queryClient = seed();
    viewerRoleUpdatedListener(queryClient, () => 'u-me')({
      conversationId: 'c-1', userId: 'u-me', newRole: 'admin', updatedBy: 'u-z', viewerCapabilities: { canMakeObsolete: 'oui' },
    });
    const after = detail(queryClient);
    expect(after !== undefined && 'viewerCapabilities' in after).toBe(false);
  });

  test('le rang d’un AUTRE ne touche ni la capacité ni le rang du lecteur', () => {
    const queryClient = seed();
    viewerRoleUpdatedListener(queryClient, () => 'u-me')({
      conversationId: 'c-1', userId: 'u-other', newRole: 'admin', updatedBy: 'u-z', viewerCapabilities: { canMakeObsolete: true },
    });
    expect(detail(queryClient)?.viewerCapabilities).toEqual({ canMakeObsolete: false });
    expect(detail(queryClient)?.currentUserRole).toBe('member');
  });
});
