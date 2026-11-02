import { QueryClient } from '@tanstack/react-query';
import { describe, expect, test } from 'bun:test';

import { message } from '@/lib/api/fixtures-base';
import type { ApiResult, HttpRequest } from '@/lib/api/http';
import { messagesQueryKey } from '@/lib/api/messages';
import type { Message } from '@/lib/api/types';

import { performDeleteForEveryone, performDeleteForMe } from './delete-message';

/**
 * #10582 — SUPPRIMER UN OU PLUSIEURS MESSAGES, POUR TOUS OU POUR SOI. Le témoin
 * lit le cache du fil, que les rangées peignent : la suppression s'y voit
 * AVANT l'accusé, un refus rend la rangée à sa place, et un échec partiel ne
 * retire que ce que le serveur a vraiment supprimé.
 */

const row = (id: string, minute: number, overrides: Partial<Message> = {}): Message =>
  message({
    id,
    conversationId: 'c-a',
    senderId: 'u-moi',
    content: `texte ${id}`,
    originalLanguage: 'fr',
    translations: [],
    createdAt: new Date(`2026-10-14T09:0${minute}:00.000Z`),
    ...overrides,
  });

const M1 = row('m-1', 1);
const M2 = row('m-2', 2);
const M3 = row('m-3', 3);
const REPLY = row('m-4', 4, { senderId: 'u-autre', replyTo: M2 });

const threadWith = (): QueryClient => {
  const queryClient = new QueryClient();
  queryClient.setQueryData(messagesQueryKey('c-a'), {
    pages: [
      { messages: [M3, REPLY], hasOlder: true, nextCursor: 'm-3' },
      { messages: [M1, M2], hasOlder: false, nextCursor: null },
    ],
    pageParams: [undefined, 'm-3'],
  });
  return queryClient;
};

const pages = (queryClient: QueryClient): readonly (readonly Message[])[] =>
  queryClient.getQueryData<{ pages: { messages: Message[] }[] }>(messagesQueryKey('c-a'))?.pages.map((p) => p.messages) ?? [];

const ids = (queryClient: QueryClient): readonly (readonly string[])[] => pages(queryClient).map((p) => p.map((m) => m.id));

const rowOf = (queryClient: QueryClient, id: string): Message | undefined => pages(queryClient).flat().find((m) => m.id === id);

const isTombstone = (m: Message | undefined): boolean => m !== undefined && m.deletedAt != null && m.content === '';

const transportBy = (answer: (request: HttpRequest) => ApiResult<unknown>, seen: HttpRequest[], during?: (request: HttpRequest) => void) => ({
  request: async <T,>(request: HttpRequest): Promise<ApiResult<T>> => {
    seen.push(request);
    during?.(request);
    return answer(request) as ApiResult<T>;
  },
});

const OK: ApiResult<unknown> = { ok: true, data: null };

describe('performDeleteForEveryone — la route unitaire, message par message, comme iOS', () => {
  test('un message : DELETE sur la conversation, et la pierre tombale est posée AVANT l’accusé', async () => {
    const queryClient = threadWith();
    const seen: HttpRequest[] = [];
    let during = false;
    const result = await performDeleteForEveryone({
      queryClient,
      conversationId: 'c-a',
      messages: [M2],
      transport: transportBy(() => OK, seen, () => {
        during = isTombstone(rowOf(queryClient, 'm-2'));
      }),
    });
    expect(seen).toEqual([{ method: 'DELETE', path: '/api/v1/conversations/c-a/messages/m-2' }]);
    expect(during).toBe(true);
    expect(result).toEqual({ deleted: 1, failed: 0, offline: false });
    expect(isTombstone(rowOf(queryClient, 'm-2'))).toBe(true);
  });

  test('RETIRER (#11150) : le motif voyage en corps `{ reason }` ; un refus de la passerelle rend la rangée', async () => {
    const queryClient = threadWith();
    const seen: HttpRequest[] = [];
    const removed = await performDeleteForEveryone({ queryClient, conversationId: 'c-a', messages: [REPLY], reason: 'Propos haineux', transport: transportBy(() => OK, seen) });
    expect(seen).toEqual([{ method: 'DELETE', path: '/api/v1/conversations/c-a/messages/m-4', body: { reason: 'Propos haineux' } }]);
    expect(removed).toEqual({ deleted: 1, failed: 0, offline: false });

    const refusedClient = threadWith();
    const refused = await performDeleteForEveryone({
      queryClient: refusedClient,
      conversationId: 'c-a',
      messages: [REPLY],
      reason: 'Propos haineux',
      transport: transportBy(() => ({ ok: false, status: 403, error: 'Forbidden' }), []),
    });
    expect(refused).toEqual({ deleted: 0, failed: 1, offline: false });
    expect(rowOf(refusedClient, 'm-4')).toEqual(REPLY);
  });

  test('la citation qu’une réponse embarque devient une pierre tombale elle aussi', async () => {
    const queryClient = threadWith();
    await performDeleteForEveryone({ queryClient, conversationId: 'c-a', messages: [M2], transport: transportBy(() => OK, []) });
    expect(isTombstone(rowOf(queryClient, 'm-4')?.replyTo)).toBe(true);
  });

  test('plusieurs messages : une requête par message, dans l’ordre remis', async () => {
    const seen: HttpRequest[] = [];
    await performDeleteForEveryone({ queryClient: threadWith(), conversationId: 'c-a', messages: [M1, M2, M3], transport: transportBy(() => OK, seen) });
    expect(seen.map((r) => r.path)).toEqual([
      '/api/v1/conversations/c-a/messages/m-1',
      '/api/v1/conversations/c-a/messages/m-2',
      '/api/v1/conversations/c-a/messages/m-3',
    ]);
  });

  test('un refus rend la rangée et sa citation', async () => {
    const queryClient = threadWith();
    const result = await performDeleteForEveryone({
      queryClient,
      conversationId: 'c-a',
      messages: [M2],
      transport: transportBy(() => ({ ok: false, status: 403, error: 'Forbidden' }), []),
    });
    expect(result).toEqual({ deleted: 0, failed: 1, offline: false });
    expect(rowOf(queryClient, 'm-2')).toEqual(M2);
    expect(rowOf(queryClient, 'm-4')?.replyTo).toEqual(M2);
  });

  test('échec partiel : le message refusé reste, les autres sont supprimés', async () => {
    const queryClient = threadWith();
    const result = await performDeleteForEveryone({
      queryClient,
      conversationId: 'c-a',
      messages: [M1, M2, M3],
      transport: transportBy((request) => (request.path.endsWith('/m-2') ? { ok: false, status: 403, error: 'Forbidden' } : OK), []),
    });
    expect(result).toEqual({ deleted: 2, failed: 1, offline: false });
    expect(isTombstone(rowOf(queryClient, 'm-1'))).toBe(true);
    expect(rowOf(queryClient, 'm-2')?.content).toBe('texte m-2');
    expect(isTombstone(rowOf(queryClient, 'm-3'))).toBe(true);
  });

  test('hors ligne : la boucle s’arrête, tout ce qui n’est pas parti revient', async () => {
    const queryClient = threadWith();
    const seen: HttpRequest[] = [];
    const result = await performDeleteForEveryone({
      queryClient,
      conversationId: 'c-a',
      messages: [M1, M2, M3],
      transport: transportBy((request) => (request.path.endsWith('/m-1') ? OK : { ok: false, status: 0, error: 'offline' }), seen),
    });
    expect(seen).toHaveLength(2);
    expect(result).toEqual({ deleted: 1, failed: 2, offline: true });
    expect(rowOf(queryClient, 'm-2')?.content).toBe('texte m-2');
    expect(rowOf(queryClient, 'm-3')?.content).toBe('texte m-3');
  });
});

describe('performDeleteForMe — la route unitaire pour un, la route de masse pour plusieurs', () => {
  test('un message : DELETE delete-for-me, et la rangée quitte le fil AVANT l’accusé', async () => {
    const queryClient = threadWith();
    const seen: HttpRequest[] = [];
    let during: readonly (readonly string[])[] = [];
    const result = await performDeleteForMe({
      queryClient,
      conversationId: 'c-a',
      messages: [M2],
      transport: transportBy(() => OK, seen, () => {
        during = ids(queryClient);
      }),
    });
    expect(seen).toEqual([{ method: 'DELETE', path: '/api/v1/messages/m-2/delete-for-me' }]);
    expect(during).toEqual([['m-3', 'm-4'], ['m-1']]);
    expect(result).toEqual({ deleted: 1, failed: 0, offline: false });
    expect(ids(queryClient)).toEqual([['m-3', 'm-4'], ['m-1']]);
  });

  test('plusieurs messages : UNE requête de masse, qui porte tous les identifiants', async () => {
    const queryClient = threadWith();
    const seen: HttpRequest[] = [];
    const result = await performDeleteForMe({
      queryClient,
      conversationId: 'c-a',
      messages: [M1, M3],
      transport: transportBy(() => ({ ok: true, data: { deletedCount: 2, requestedCount: 2 } }), seen),
    });
    expect(seen).toEqual([{ method: 'DELETE', path: '/api/v1/messages/bulk/delete-for-me', body: { messageIds: ['m-1', 'm-3'] } }]);
    expect(result).toEqual({ deleted: 2, failed: 0, offline: false });
    expect(ids(queryClient)).toEqual([['m-4'], ['m-2']]);
  });

  test('un refus remet chaque rangée à SA place, dans SA page', async () => {
    const queryClient = threadWith();
    const result = await performDeleteForMe({
      queryClient,
      conversationId: 'c-a',
      messages: [M1, M3],
      transport: transportBy(() => ({ ok: false, status: 403, error: 'Forbidden' }), []),
    });
    expect(result).toEqual({ deleted: 0, failed: 2, offline: false });
    expect(ids(queryClient)).toEqual([['m-3', 'm-4'], ['m-1', 'm-2']]);
    expect(rowOf(queryClient, 'm-3')).toEqual(M3);
  });

  test('hors ligne : les rangées reviennent, et l’issue le dit', async () => {
    const queryClient = threadWith();
    const result = await performDeleteForMe({
      queryClient,
      conversationId: 'c-a',
      messages: [M2],
      transport: transportBy(() => ({ ok: false, status: 0, error: 'offline' }), []),
    });
    expect(result).toEqual({ deleted: 0, failed: 1, offline: true });
    expect(ids(queryClient)).toEqual([['m-3', 'm-4'], ['m-1', 'm-2']]);
  });

  test('un message arrivé pendant le vol reste, et la rangée rendue retrouve son voisin', async () => {
    const queryClient = threadWith();
    const NEW = row('m-9', 9);
    await performDeleteForMe({
      queryClient,
      conversationId: 'c-a',
      messages: [M3],
      transport: transportBy(() => ({ ok: false, status: 500, error: 'boom' }), [], () => {
        queryClient.setQueryData(messagesQueryKey('c-a'), {
          pages: [{ messages: [REPLY, NEW], hasOlder: true, nextCursor: 'm-3' }, { messages: [M1, M2], hasOlder: false, nextCursor: null }],
          pageParams: [undefined, 'm-3'],
        });
      }),
    });
    expect(ids(queryClient)).toEqual([['m-3', 'm-4', 'm-9'], ['m-1', 'm-2']]);
  });

  test('la route de masse en masque moins que demandé : le fil est relu, l’issue dit l’écart', async () => {
    const queryClient = threadWith();
    const result = await performDeleteForMe({
      queryClient,
      conversationId: 'c-a',
      messages: [M1, M2, M3],
      transport: transportBy(() => ({ ok: true, data: { deletedCount: 2, requestedCount: 3 } }), []),
    });
    expect(result).toEqual({ deleted: 2, failed: 1, offline: false });
    expect(queryClient.getQueryState(messagesQueryKey('c-a'))?.isInvalidated).toBe(true);
  });

  test('rien à supprimer ne part pas', async () => {
    const seen: HttpRequest[] = [];
    const everyone = await performDeleteForEveryone({ queryClient: threadWith(), conversationId: 'c-a', messages: [], transport: transportBy(() => OK, seen) });
    const me = await performDeleteForMe({ queryClient: threadWith(), conversationId: 'c-a', messages: [], transport: transportBy(() => OK, seen) });
    expect(seen).toEqual([]);
    expect(everyone).toEqual({ deleted: 0, failed: 0, offline: false });
    expect(me).toEqual({ deleted: 0, failed: 0, offline: false });
  });
});

/**
 * #12634 — LA SORTIE SE JOUE AVANT LE RETRAIT. La rangée reste dans le cache
 * (donc montée) le temps que `rowExit` joue son repli ; la requête, elle, part
 * tout de suite. Un refus la rend ET la déplie à sa place.
 */
describe('performDeleteForMe — la rangée sort en se repliant, et revient de même', () => {
  const heldExit = () => {
    const calls: { readonly collapsed: (readonly string[])[]; readonly unfolded: (readonly string[])[] } = { collapsed: [], unfolded: [] };
    const gate: { open: () => void } = { open: () => {} };
    const exit = {
      collapse: (rows: ReadonlySet<string>) => {
        calls.collapsed.push([...rows]);
        return new Promise<void>((resolve) => {
          gate.open = resolve;
        });
      },
      unfold: (rows: ReadonlySet<string>) => {
        calls.unfolded.push([...rows]);
      },
    };
    return { exit, calls, open: () => gate.open() };
  };

  test('pendant le repli, la rangée reste au fil et la requête est déjà partie ; puis elle quitte le cache', async () => {
    const queryClient = threadWith();
    const seen: HttpRequest[] = [];
    const held = heldExit();
    const performed = performDeleteForMe({ queryClient, conversationId: 'c-a', messages: [M2], transport: transportBy(() => OK, seen), rowExit: held.exit });
    await Promise.resolve();
    expect(held.calls.collapsed).toEqual([['m-2']]);
    expect(ids(queryClient)).toEqual([['m-3', 'm-4'], ['m-1', 'm-2']]);
    expect(seen).toEqual([{ method: 'DELETE', path: '/api/v1/messages/m-2/delete-for-me' }]);
    held.open();
    expect(await performed).toEqual({ deleted: 1, failed: 0, offline: false });
    expect(ids(queryClient)).toEqual([['m-3', 'm-4'], ['m-1']]);
    expect(held.calls.unfolded).toEqual([]);
  });

  test('une sélection : toutes les rangées se replient ensemble', async () => {
    const queryClient = threadWith();
    const held = heldExit();
    const performed = performDeleteForMe({
      queryClient,
      conversationId: 'c-a',
      messages: [M1, M3],
      transport: transportBy(() => ({ ok: true, data: { deletedCount: 2, requestedCount: 2 } }), []),
      rowExit: held.exit,
    });
    expect(held.calls.collapsed).toEqual([['m-1', 'm-3']]);
    held.open();
    await performed;
    expect(ids(queryClient)).toEqual([['m-4'], ['m-2']]);
  });

  test('un refus ou une coupure : les rangées reviennent à leur place et se déplient', async () => {
    const queryClient = threadWith();
    const held = heldExit();
    const performed = performDeleteForMe({
      queryClient,
      conversationId: 'c-a',
      messages: [M1, M3],
      transport: transportBy(() => ({ ok: false, status: 0, error: 'offline' }), []),
      rowExit: held.exit,
    });
    held.open();
    expect(await performed).toEqual({ deleted: 0, failed: 2, offline: true });
    expect(ids(queryClient)).toEqual([['m-3', 'm-4'], ['m-1', 'm-2']]);
    expect(held.calls.unfolded).toEqual([['m-1', 'm-3']]);
  });

  test('un refus PARTIEL de la route de masse : les rangées se déplient AVANT la relecture du fil', async () => {
    const queryClient = threadWith();
    const held = heldExit();
    const invalidatedWhenUnfolded: boolean[] = [];
    const exit = {
      ...held.exit,
      unfold: (rows: ReadonlySet<string>) => {
        invalidatedWhenUnfolded.push(queryClient.getQueryState(messagesQueryKey('c-a'))?.isInvalidated ?? false);
        held.exit.unfold(rows);
      },
    };
    const performed = performDeleteForMe({
      queryClient,
      conversationId: 'c-a',
      messages: [M1, M2, M3],
      transport: transportBy(() => ({ ok: true, data: { deletedCount: 1, requestedCount: 3 } }), []),
      rowExit: exit,
    });
    held.open();
    expect(await performed).toEqual({ deleted: 1, failed: 2, offline: false });
    expect(held.calls.unfolded).toEqual([['m-1', 'm-2', 'm-3']]);
    expect(invalidatedWhenUnfolded).toEqual([false]);
    expect(queryClient.getQueryState(messagesQueryKey('c-a'))?.isInvalidated).toBe(true);
  });

  test('aucune sortie à jouer (« Réduire les animations ») : la rangée quitte le fil tout de suite', async () => {
    const queryClient = threadWith();
    let during: readonly (readonly string[])[] = [];
    await performDeleteForMe({
      queryClient,
      conversationId: 'c-a',
      messages: [M2],
      transport: transportBy(() => OK, [], () => {
        during = ids(queryClient);
      }),
      rowExit: { collapse: () => null, unfold: () => {} },
    });
    expect(during).toEqual([['m-3', 'm-4'], ['m-1']]);
  });
});
