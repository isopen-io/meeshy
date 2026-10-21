import { QueryClient } from '@tanstack/react-query';
import { describe, expect, test } from 'bun:test';

import { message } from '@/lib/api/fixtures-base';
import type { ApiResult, HttpRequest } from '@/lib/api/http';
import { messagesQueryKey } from '@/lib/api/messages';
import type { Message } from '@/lib/api/types';

import { performMessageEdit } from './edit-message';

/**
 * #10581 — MODIFIER SON MESSAGE. Le témoin passe par le cache du fil, que la
 * rangée lit : le texte change AVANT l'accusé, les traductions de l'ancien
 * texte ne sont plus servies, la citation qu'une réponse embarque suit, et un
 * refus rend la rangée d'avant — texte, traductions et citation.
 */

const TRANSLATION = { language: 'en', content: 'hello everyone' } as unknown as NonNullable<Message['translations']>[number];

const MINE: Message = message({
  id: 'm-1',
  conversationId: 'c-a',
  senderId: 'u-moi',
  content: 'bonjour à tous',
  originalLanguage: 'fr',
  translations: [TRANSLATION],
  createdAt: new Date('2026-10-14T09:00:00.000Z'),
});

const REPLY: Message = message({
  id: 'm-2',
  conversationId: 'c-a',
  senderId: 'u-autre',
  content: 'salut',
  originalLanguage: 'fr',
  translations: [],
  createdAt: new Date('2026-10-14T09:01:00.000Z'),
  replyTo: MINE,
});

const threadWith = (): QueryClient => {
  const queryClient = new QueryClient();
  queryClient.setQueryData(messagesQueryKey('c-a'), { pages: [{ messages: [MINE, REPLY], hasOlder: false, nextCursor: null }], pageParams: [undefined] });
  return queryClient;
};

const rows = (queryClient: QueryClient): readonly Message[] =>
  queryClient.getQueryData<{ pages: { messages: Message[] }[] }>(messagesQueryKey('c-a'))?.pages[0]?.messages ?? [];

const rowOf = (queryClient: QueryClient, id: string): Message | undefined => rows(queryClient).find((m) => m.id === id);

const transportAnswering = (answer: () => Promise<ApiResult<unknown>>, seen: HttpRequest[], during?: () => void) => ({
  request: async <T,>(request: HttpRequest): Promise<ApiResult<T>> => {
    seen.push(request);
    during?.();
    return (await answer()) as ApiResult<T>;
  },
});

describe('performMessageEdit — le texte change avant l’accusé (#10581)', () => {
  test('la requête est un PUT sur le message, et la rangée porte le nouveau texte pendant le vol', async () => {
    const queryClient = threadWith();
    const seen: HttpRequest[] = [];
    let during: Message | undefined;
    const outcome = await performMessageEdit({
      queryClient,
      conversationId: 'c-a',
      message: MINE,
      content: '  bonjour à toutes et tous ',
      transport: transportAnswering(async () => ({ ok: true, data: null }), seen, () => {
        during = rowOf(queryClient, 'm-1');
      }),
    });
    expect(outcome).toBe('ok');
    expect(seen).toEqual([{ method: 'PUT', path: '/api/v1/messages/m-1', body: { content: 'bonjour à toutes et tous' } }]);
    expect(during?.content).toBe('bonjour à toutes et tous');
    expect(during?.isEdited).toBe(true);
  });

  test('les traductions de l’ancien texte ne sont plus servies', async () => {
    const queryClient = threadWith();
    await performMessageEdit({
      queryClient,
      conversationId: 'c-a',
      message: MINE,
      content: 'au revoir',
      transport: transportAnswering(async () => ({ ok: true, data: null }), []),
    });
    expect(rowOf(queryClient, 'm-1')?.translations).toEqual([]);
  });

  test('la citation embarquée par une réponse suit l’édition', async () => {
    const queryClient = threadWith();
    await performMessageEdit({
      queryClient,
      conversationId: 'c-a',
      message: MINE,
      content: 'au revoir',
      transport: transportAnswering(async () => ({ ok: true, data: null }), []),
    });
    expect(rowOf(queryClient, 'm-2')?.replyTo?.content).toBe('au revoir');
  });

  test('l’accusé du serveur fait foi : son texte et son heure remplacent l’optimiste', async () => {
    const queryClient = threadWith();
    await performMessageEdit({
      queryClient,
      conversationId: 'c-a',
      message: MINE,
      content: 'voir https://meeshy.me',
      transport: transportAnswering(
        async () => ({
          ok: true,
          data: { id: 'm-1', conversationId: 'c-a', content: 'voir m+abc', isEdited: true, editedAt: '2026-10-14T09:05:00.000Z', translations: [] },
        }),
        [],
      ),
    });
    const row = rowOf(queryClient, 'm-1');
    expect(row?.content).toBe('voir m+abc');
    expect(String(row?.editedAt)).toBe('2026-10-14T09:05:00.000Z');
  });
});

describe('performMessageEdit — un échec rend la rangée d’avant', () => {
  test('un refus rend le texte, les traductions et la citation', async () => {
    const queryClient = threadWith();
    const outcome = await performMessageEdit({
      queryClient,
      conversationId: 'c-a',
      message: MINE,
      content: 'au revoir',
      transport: transportAnswering(async () => ({ ok: false, status: 403, error: 'You can no longer edit this message' }), []),
    });
    expect(outcome).toBe('refused');
    const row = rowOf(queryClient, 'm-1');
    expect(row?.content).toBe('bonjour à tous');
    expect(row?.isEdited).toBe(false);
    expect(row?.translations).toEqual([TRANSLATION]);
    expect(rowOf(queryClient, 'm-2')?.replyTo?.content).toBe('bonjour à tous');
  });

  test('hors ligne : la rangée revient, et l’issue le dit', async () => {
    const queryClient = threadWith();
    const outcome = await performMessageEdit({
      queryClient,
      conversationId: 'c-a',
      message: MINE,
      content: 'au revoir',
      transport: transportAnswering(async () => ({ ok: false, status: 0, error: 'offline' }), []),
    });
    expect(outcome).toBe('offline');
    expect(rowOf(queryClient, 'm-1')?.content).toBe('bonjour à tous');
  });

  test('une édition arrivée d’ailleurs pendant le vol n’est pas écrasée par le retour arrière', async () => {
    const queryClient = threadWith();
    await performMessageEdit({
      queryClient,
      conversationId: 'c-a',
      message: MINE,
      content: 'au revoir',
      transport: transportAnswering(async () => ({ ok: false, status: 500, error: 'boom' }), [], () => {
        queryClient.setQueryData(messagesQueryKey('c-a'), {
          pages: [{ messages: rows(queryClient).map((m) => (m.id === 'm-1' ? { ...m, content: 'écrit depuis un autre appareil' } : m)), hasOlder: false, nextCursor: null }],
          pageParams: [undefined],
        });
      }),
    });
    expect(rowOf(queryClient, 'm-1')?.content).toBe('écrit depuis un autre appareil');
  });
});

describe('performMessageEdit — ce qui ne change rien ne part pas', () => {
  test('un texte inchangé ne part pas', async () => {
    const seen: HttpRequest[] = [];
    const outcome = await performMessageEdit({
      queryClient: threadWith(),
      conversationId: 'c-a',
      message: MINE,
      content: ' bonjour à tous ',
      transport: transportAnswering(async () => ({ ok: true, data: null }), seen),
    });
    expect(outcome).toBe('unchanged');
    expect(seen).toEqual([]);
  });

  test('un texte vide ne part pas', async () => {
    const seen: HttpRequest[] = [];
    const queryClient = threadWith();
    const outcome = await performMessageEdit({
      queryClient,
      conversationId: 'c-a',
      message: MINE,
      content: '   ',
      transport: transportAnswering(async () => ({ ok: true, data: null }), seen),
    });
    expect(outcome).toBe('unchanged');
    expect(seen).toEqual([]);
    expect(rowOf(queryClient, 'm-1')?.content).toBe('bonjour à tous');
  });
});
