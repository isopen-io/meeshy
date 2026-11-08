import { QueryClient, QueryClientProvider, type QueryKey } from '@tanstack/react-query';
import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { ApiError } from './client';
import { conversationQueryKey } from './conversations';
import { messagesQueryKey } from './messages';
import { threadDataStatusOf, useThreadData } from './query';
import type { Conversation, Message } from './types';

/**
 * HORS LIGNE, LE FIL S'OUVRE SUR SON CACHE (#15112, jumelle web de #15105) —
 * après un rechargement hors ligne, TanStack croit le réseau présent : la
 * relecture échoue, et la requête passe en `error` EN GARDANT ses données. Le
 * fil ne doit pas lire cet échec comme « rien à montrer » : des données en
 * cache gagnent toujours. L'écran d'erreur n'apparaît que sur un cache vide.
 */
const conversation = {
  id: 'c-hors-ligne',
  title: 'Recette Beta',
  type: 'group',
  status: 'active',
  visibility: 'private',
  isActive: true,
  memberCount: 2,
  participants: [],
  createdAt: new Date('2026-11-03T08:00:00.000Z'),
  updatedAt: new Date('2026-11-03T08:00:00.000Z'),
} as unknown as Conversation;

const cachedMessage = {
  id: 'm-cache-1',
  conversationId: 'c-hors-ligne',
  senderId: 'u-amina',
  content: 'déjà lu avant la coupure',
  originalLanguage: 'fr',
  messageType: 'text',
  messageSource: 'user',
  isEdited: false,
  isViewOnce: false,
  viewOnceCount: 0,
  isBlurred: false,
  deliveredCount: 1,
  readCount: 1,
  reactionCount: 0,
  isEncrypted: false,
  translations: [],
  createdAt: '2026-11-03T08:01:00.000Z',
  timestamp: '2026-11-03T08:01:00.000Z',
} as unknown as Message;

const pagesOf = (messages: readonly Message[]) => ({
  pages: [{ messages, hasOlder: false, nextCursor: null }],
  pageParams: [undefined],
});

const networkDown = new ApiError({ ok: false, status: 0, error: 'Unable to resolve host "gate.staging.meeshy.me"' });

const failRefetch = (client: QueryClient, queryKey: QueryKey, error: Error): void => {
  const query = client.getQueryCache().find({ queryKey, exact: true });
  if (query === undefined) {
    client.getQueryCache().build(client, { queryKey }).setState({ status: 'error', error, errorUpdatedAt: Date.now(), fetchFailureCount: 3 });
    return;
  }
  query.setState({ ...query.state, status: 'error', error, errorUpdatedAt: Date.now(), fetchFailureCount: 3, fetchStatus: 'idle' });
};

function Probe() {
  const data = useThreadData('c-hors-ligne');
  return (
    <span data-status={data.status} data-title={data.conversation?.title ?? ''}>
      {data.messages.map((message) => message.content).join('|')}
    </span>
  );
}

const render = (client: QueryClient): string =>
  renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <Probe />
    </QueryClientProvider>,
  );

const clientWithCache = (): QueryClient => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  client.setQueryData(conversationQueryKey('c-hors-ligne'), conversation);
  client.setQueryData(messagesQueryKey('c-hors-ligne'), pagesOf([cachedMessage]));
  return client;
};

describe('useThreadData hors ligne — le cache gagne sur l’échec de relecture (#15112)', () => {
  test('conversation et messages en cache, les deux relectures échouent : le fil se montre avec ses messages', () => {
    const client = clientWithCache();
    failRefetch(client, conversationQueryKey('c-hors-ligne'), networkDown);
    failRefetch(client, messagesQueryKey('c-hors-ligne'), new TypeError('Failed to fetch'));

    const html = render(client);

    expect(html).toContain('data-status="success"');
    expect(html).toContain('data-title="Recette Beta"');
    expect(html).toContain('déjà lu avant la coupure');
  });

  test('seule la relecture des messages échoue : le fil reste ouvert', () => {
    const client = clientWithCache();
    failRefetch(client, messagesQueryKey('c-hors-ligne'), networkDown);

    expect(render(client)).toContain('data-status="success"');
  });

  test('un refus (404) reste un refus, même avec un cache', () => {
    const client = clientWithCache();
    failRefetch(client, conversationQueryKey('c-hors-ligne'), new ApiError({ ok: false, status: 404, error: 'introuvable' }));

    expect(render(client)).toContain('data-status="refused"');
  });
});

describe('threadDataStatusOf — l’erreur n’apparaît que sur un cache vide (#15112)', () => {
  const cached = { data: {}, error: null, isError: false, isPaused: false };
  const failedWithCache = { data: {}, error: networkDown, isError: true, isPaused: false };
  const failedEmpty = { data: undefined, error: networkDown, isError: true, isPaused: false };
  const pausedEmpty = { data: undefined, error: null, isError: false, isPaused: true };
  const loading = { data: undefined, error: null, isError: false, isPaused: false };

  test('des données en cache gagnent sur un échec de relecture', () => {
    expect(threadDataStatusOf(failedWithCache, failedWithCache)).toBe('success');
  });

  test('cache des messages vide et relecture en échec : erreur', () => {
    expect(threadDataStatusOf(cached, failedEmpty)).toBe('error');
  });

  test('cache des messages vide et requête mise en pause hors ligne : erreur, jamais un squelette sans fin', () => {
    expect(threadDataStatusOf(cached, pausedEmpty)).toBe('error');
  });

  test('premier chargement en ligne : en attente', () => {
    expect(threadDataStatusOf(cached, loading)).toBe('pending');
  });

  test('un refus prime, cache ou non', () => {
    const refusal = { ...failedWithCache, error: new ApiError({ ok: false, status: 403, error: 'interdit' }) };
    expect(threadDataStatusOf(refusal, cached)).toBe('refused');
  });
});
