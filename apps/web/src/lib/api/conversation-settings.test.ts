import { QueryClient } from '@tanstack/react-query';
import { describe, expect, test } from 'bun:test';

import { CONVERSATIONS_QUERY_KEY, conversationQueryKey, type ConversationsDeps } from './conversations';
import type { ConversationsInfiniteData } from './conversations-pages';
import { updateConversationSettings } from './conversation-settings';
import type { ApiResult, HttpRequest, HttpTransport } from './http';
import type { Conversation } from './types';

/**
 * **LES RÉGLAGES D'UNE CONVERSATION DEPUIS SA FEUILLE** (#7836) — nom,
 * description, photo et permissions : la liste ET le fil changent avant la
 * réponse, la passerelle (`PATCH /conversations/:id`) confirme, un refus défait.
 */

const conversation = (overrides: Partial<Conversation> = {}): Conversation =>
  ({ id: 'c-1', type: 'group', title: 'Avant', description: 'Ancienne', avatar: 'https://cdn/a.jpg', memberCount: 3, participants: [], ...overrides }) as unknown as Conversation;

const seed = (c: Conversation) => {
  const queryClient = new QueryClient();
  const list: ConversationsInfiniteData = { pages: [{ conversations: [c] } as never], pageParams: [undefined] };
  queryClient.setQueryData(CONVERSATIONS_QUERY_KEY, list);
  queryClient.setQueryData(conversationQueryKey('c-1'), c);
  return queryClient;
};

const listed = (queryClient: QueryClient) => queryClient.getQueryData<ConversationsInfiniteData>(CONVERSATIONS_QUERY_KEY)?.pages[0]?.conversations[0];
const detail = (queryClient: QueryClient) => queryClient.getQueryData<Conversation>(conversationQueryKey('c-1'));

const deferred = () => {
  const calls: HttpRequest[] = [];
  let resolve: (value: ApiResult<unknown>) => void = () => undefined;
  const transport = (async () => ({ ok: false, status: 0, error: 'jamais' })) as unknown as HttpTransport;
  transport.request = ((req: HttpRequest) => {
    calls.push(req);
    return new Promise<ApiResult<unknown>>((done) => {
      resolve = done;
    });
  }) as HttpTransport['request'];
  const deps: ConversationsDeps = { source: 'gateway', transport };
  return { deps, calls, reply: (value: ApiResult<unknown>) => resolve(value) };
};

describe('renommer, décrire, changer la photo', () => {
  test('la liste et le fil prennent le nouveau nom avant la réponse ; un seul PATCH ne porte que ce qui change', async () => {
    const queryClient = seed(conversation());
    const net = deferred();
    const pending = updateConversationSettings({ deps: { ...net.deps, queryClient }, conversationId: 'c-1', patch: { title: 'Après', description: 'Nouvelle' } });
    expect(listed(queryClient)?.title).toBe('Après');
    expect(detail(queryClient)?.description).toBe('Nouvelle');
    expect(net.calls[0]).toEqual({ method: 'PATCH', path: '/api/v1/conversations/c-1', body: { title: 'Après', description: 'Nouvelle' } });
    net.reply({ ok: true, data: { id: 'c-1', title: 'Après (servi)', description: 'Nouvelle' } });
    expect(await pending).toEqual({ ok: true });
    expect(listed(queryClient)?.title).toBe('Après (servi)');
    expect(detail(queryClient)?.title).toBe('Après (servi)');
  });

  test('un refus remet chaque champ touché, et rien d’autre', async () => {
    const queryClient = seed(conversation());
    const net = deferred();
    const pending = updateConversationSettings({ deps: { ...net.deps, queryClient }, conversationId: 'c-1', patch: { avatar: 'https://cdn/b.jpg' } });
    expect(detail(queryClient)?.avatar).toBe('https://cdn/b.jpg');
    net.reply({ ok: false, status: 403, error: 'Vous n’êtes pas autorisé' });
    expect(await pending).toEqual({ ok: false, reason: 'refused', error: 'Vous n’êtes pas autorisé' });
    expect(listed(queryClient)?.avatar).toBe('https://cdn/a.jpg');
    expect(detail(queryClient)?.avatar).toBe('https://cdn/a.jpg');
    expect(detail(queryClient)?.title).toBe('Avant');
  });

  test('retirer la photo envoie null et la retire de la liste', async () => {
    const queryClient = seed(conversation());
    const net = deferred();
    const pending = updateConversationSettings({ deps: { ...net.deps, queryClient }, conversationId: 'c-1', patch: { avatar: null } });
    expect(listed(queryClient)?.avatar).toBeUndefined();
    expect(net.calls[0]?.body).toEqual({ avatar: null });
    net.reply({ ok: true, data: { id: 'c-1' } });
    await pending;
    expect(listed(queryClient)?.avatar).toBeUndefined();
  });
});

describe('les permissions', () => {
  test('qui peut écrire, annonces, mode lent, traduction : posés tout de suite, défaits sur panne', async () => {
    const queryClient = seed(conversation({ defaultWriteRole: 'everyone', isAnnouncementChannel: false, slowModeSeconds: 0, autoTranslateEnabled: true }));
    const net = deferred();
    const pending = updateConversationSettings({ deps: { ...net.deps, queryClient }, conversationId: 'c-1', patch: { isAnnouncementChannel: true, slowModeSeconds: 30 } });
    expect(detail(queryClient)?.isAnnouncementChannel).toBe(true);
    expect(detail(queryClient)?.slowModeSeconds).toBe(30);
    net.reply({ ok: false, status: 503, error: 'indisponible' });
    expect(await pending).toEqual({ ok: false, reason: 'failed', error: 'indisponible' });
    expect(detail(queryClient)?.isAnnouncementChannel).toBe(false);
    expect(detail(queryClient)?.slowModeSeconds).toBe(0);
  });

  test('en fixtures, le réglage reste posé sans appel', async () => {
    const queryClient = seed(conversation());
    const transport = (async () => ({ ok: false, status: 0, error: 'jamais' })) as unknown as HttpTransport;
    const outcome = await updateConversationSettings({ deps: { source: 'fixtures', transport, queryClient }, conversationId: 'c-1', patch: { autoTranslateEnabled: false } });
    expect(outcome).toEqual({ ok: true });
    expect(detail(queryClient)?.autoTranslateEnabled).toBe(false);
  });
});
