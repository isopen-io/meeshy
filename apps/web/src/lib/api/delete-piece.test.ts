import { QueryClient } from '@tanstack/react-query';
import { describe, expect, test } from 'bun:test';

import { attachmentDefaults, message } from '@/lib/api/fixtures-base';
import { messagesQueryKey } from '@/lib/api/messages';
import type { ApiResult, HttpRequest } from '@/lib/api/http';
import type { Attachment, Message } from '@/lib/api/types';

import { performPieceDelete } from './delete-piece';

/**
 * #9906 — SUPPRIMER UNE PIÈCE SUPPRIME LA PIÈCE VISÉE. Le témoin vise la 3ᵉ
 * pièce d'un lot : la requête part sur SON identifiant, le fil la retire avant
 * l'accusé (optimiste), et un refus la remet à son rang.
 */

const piece = (id: string): Attachment =>
  ({
    ...attachmentDefaults,
    id,
    messageId: 'm-lot',
    fileName: `${id}.jpg`,
    originalName: `${id}.jpg`,
    mimeType: 'image/jpeg',
    fileSize: 1,
    fileUrl: `https://cdn.meeshy.me/${id}`,
    uploadedBy: 'u-moi',
    createdAt: '2026-10-10T09:00:00.000Z',
  }) as Attachment;

const LOT: Message = message({
  id: 'm-lot',
  senderId: 'u-moi',
  content: '',
  originalLanguage: 'fr',
  translations: [],
  createdAt: new Date('2026-10-10T09:00:00.000Z'),
  attachments: ['a-1', 'a-2', 'a-3', 'a-4', 'a-5'].map(piece),
});

const threadWith = (): QueryClient => {
  const queryClient = new QueryClient();
  queryClient.setQueryData(messagesQueryKey('c-a'), { pages: [{ messages: [LOT], hasOlder: false, nextCursor: null }], pageParams: [undefined] });
  return queryClient;
};

const cachedIds = (queryClient: QueryClient): readonly string[] =>
  queryClient.getQueryData<{ pages: { messages: Message[] }[] }>(messagesQueryKey('c-a'))?.pages[0]?.messages[0]?.attachments?.map((a) => a.id) ?? [];

const transportAnswering = (answer: () => Promise<ApiResult<unknown>>, seen: HttpRequest[], during?: () => void) => ({
  request: async <T,>(request: HttpRequest): Promise<ApiResult<T>> => {
    seen.push(request);
    during?.();
    return (await answer()) as ApiResult<T>;
  },
});

describe('performPieceDelete — la 3ᵉ pièce d’un lot, et elle seule (#9906)', () => {
  test('la requête vise la 3ᵉ pièce, et le fil la retire AVANT l’accusé', async () => {
    const queryClient = threadWith();
    const seen: HttpRequest[] = [];
    let duringIds: readonly string[] = [];
    const outcome = await performPieceDelete({
      queryClient,
      conversationId: 'c-a',
      message: LOT,
      attachmentId: 'a-3',
      transport: transportAnswering(async () => ({ ok: true, data: { message: 'ok' } }), seen, () => {
        duringIds = cachedIds(queryClient);
      }),
    });
    expect(outcome).toBe('ok');
    expect(seen).toEqual([{ method: 'DELETE', path: '/api/v1/attachments/a-3' }]);
    expect(duringIds).toEqual(['a-1', 'a-2', 'a-4', 'a-5']);
    expect(cachedIds(queryClient)).toEqual(['a-1', 'a-2', 'a-4', 'a-5']);
  });

  test('un refus remet la pièce à SON rang', async () => {
    const queryClient = threadWith();
    const outcome = await performPieceDelete({
      queryClient,
      conversationId: 'c-a',
      message: LOT,
      attachmentId: 'a-3',
      transport: transportAnswering(async () => ({ ok: false, status: 403, error: 'Forbidden' }), []),
    });
    expect(outcome).toBe('refused');
    expect(cachedIds(queryClient)).toEqual(['a-1', 'a-2', 'a-3', 'a-4', 'a-5']);
  });

  test('hors ligne : la pièce revient, et l’issue le dit', async () => {
    const queryClient = threadWith();
    const outcome = await performPieceDelete({
      queryClient,
      conversationId: 'c-a',
      message: LOT,
      attachmentId: 'a-3',
      transport: transportAnswering(async () => ({ ok: false, status: 0, error: 'offline' }), []),
    });
    expect(outcome).toBe('offline');
    expect(cachedIds(queryClient)).toEqual(['a-1', 'a-2', 'a-3', 'a-4', 'a-5']);
  });

  test('une pièce absente du message ne part pas', async () => {
    const seen: HttpRequest[] = [];
    const outcome = await performPieceDelete({
      queryClient: threadWith(),
      conversationId: 'c-a',
      message: LOT,
      attachmentId: 'a-9',
      transport: transportAnswering(async () => ({ ok: true, data: null }), seen),
    });
    expect(outcome).toBe('refused');
    expect(seen).toEqual([]);
  });
});
