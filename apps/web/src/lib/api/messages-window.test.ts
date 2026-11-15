import { QueryClient } from '@tanstack/react-query';
import { describe, expect, test } from 'bun:test';

import { message } from './fixtures-base';
import { createHttpTransport } from './http';
import { findCachedThreadMessage, messagesQueryKey, patchThreadMessages, upsertThreadMessage } from './messages';
import type { Message } from './types';
import {
  joinThreadWindows,
  loadMessagesWindow,
  newerWindowParam,
  olderWindowParam,
  anchoredMessagesQueryKey,
  windowPageOf,
  type WindowData,
  type WindowPage,
} from './messages-window';

/**
 * #7420 — LA FENÊTRE AUTOUR D'UN MESSAGE. Un message plus ancien que les pages
 * chargées s'atteint en UNE requête (`?around=`), et la fenêtre s'étend dans
 * les deux sens jusqu'à rejoindre le présent, sans trou ni doublon.
 */
const at = (minute: number): Date => new Date(Date.UTC(2026, 9, 1, 8, minute));

const corpus = (count: number): readonly Message[] =>
  Array.from({ length: count }, (_, i) =>
    message({ id: `a${i}`, senderId: 'u-2', content: `n°${i}`, originalLanguage: 'fr', translations: [], createdAt: at(i) }),
  );

const ids = (messages: readonly Message[]): readonly string[] => messages.map((m) => m.id);

describe('windowPageOf — la loi de la passerelle, pour les fixtures', () => {
  test('around : la moitié avant, la cible, la moitié après — ascendant', () => {
    const page = windowPageOf(corpus(100), { around: 'a40' }, 10);
    expect(ids(page.messages)).toEqual(['a35', 'a36', 'a37', 'a38', 'a39', 'a40', 'a41', 'a42', 'a43', 'a44', 'a45']);
    expect(page.hasOlder).toBe(true);
    expect(page.hasNewer).toBe(true);
    expect(page.nextCursor).toBe('a35');
  });

  test('around près du bord : rien d’inventé au-delà du corpus', () => {
    const page = windowPageOf(corpus(8), { around: 'a1' }, 10);
    expect(ids(page.messages)).toEqual(['a0', 'a1', 'a2', 'a3', 'a4', 'a5', 'a6']);
    expect(page.hasOlder).toBe(false);
    expect(page.hasNewer).toBe(true);
    expect(page.nextCursor).toBeNull();
  });

  test('around inconnu : la page récente, sans plus récent — la cible n’y est pas', () => {
    const page = windowPageOf(corpus(30), { around: 'fantome' }, 10);
    expect(ids(page.messages)).toEqual(ids(corpus(30).slice(-10)));
    expect(page.hasNewer).toBe(false);
  });

  test('after : les messages strictement plus récents, ascendants, bornés', () => {
    const page = windowPageOf(corpus(100), { after: at(45).toISOString() }, 10);
    expect(ids(page.messages)).toEqual(['a46', 'a47', 'a48', 'a49', 'a50', 'a51', 'a52', 'a53', 'a54', 'a55']);
    expect(page.hasNewer).toBe(true);
    const last = windowPageOf(corpus(100), { after: at(95).toISOString() }, 10);
    expect(ids(last.messages)).toEqual(['a96', 'a97', 'a98', 'a99']);
    expect(last.hasNewer).toBe(false);
  });

  test('before : les messages strictement plus anciens, ascendants, bornés', () => {
    const page = windowPageOf(corpus(100), { before: 'a35' }, 10);
    expect(ids(page.messages)).toEqual(['a25', 'a26', 'a27', 'a28', 'a29', 'a30', 'a31', 'a32', 'a33', 'a34']);
    expect(page.hasOlder).toBe(true);
    expect(page.nextCursor).toBe('a25');
  });
});

describe('les curseurs de la fenêtre', () => {
  const page = (partial: Partial<WindowPage> & { readonly messages: readonly Message[] }): WindowPage => ({
    hasOlder: false,
    hasNewer: false,
    nextCursor: null,
    ...partial,
  });

  test('vers le présent : `after` = l’instant du message le plus récent de la première page', () => {
    const first = page({ messages: corpus(5), hasNewer: true });
    expect(newerWindowParam(first, [first], { around: 'a2' })).toEqual({ after: at(4).toISOString() });
  });

  test('vers le présent : rien quand le présent est atteint, quand la page est vide, ou quand le curseur stagne', () => {
    expect(newerWindowParam(page({ messages: corpus(5) }), [], { around: 'a2' })).toBeUndefined();
    expect(newerWindowParam(page({ messages: [], hasNewer: true }), [], { around: 'a2' })).toBeUndefined();
    const stuck = page({ messages: corpus(5), hasNewer: true });
    expect(newerWindowParam(stuck, [stuck], { after: at(4).toISOString() })).toBeUndefined();
  });

  test('vers le passé : `before` = le curseur servi par la dernière page', () => {
    const last = page({ messages: corpus(5), hasOlder: true, nextCursor: 'a0' });
    expect(olderWindowParam(last, [last], { around: 'a2' })).toEqual({ before: 'a0' });
    expect(olderWindowParam(page({ messages: corpus(5) }), [], { around: 'a2' })).toBeUndefined();
  });
});

describe('joinThreadWindows — la fenêtre ancrée et le présent', () => {
  const all = corpus(120);
  const present = all.slice(70);

  test('sans fenêtre ancrée : le présent, tel quel (même identité)', () => {
    const joined = joinThreadWindows(present, undefined);
    expect(joined.messages).toBe(present);
    expect(joined.detached).toBe(false);
  });

  test('une fenêtre qui ne touche pas le présent est DÉTACHÉE : elle seule est servie', () => {
    const anchored = { messages: all.slice(10, 40), hasOlder: true, hasNewer: true };
    const joined = joinThreadWindows(present, anchored);
    expect(ids(joined.messages)).toEqual(ids(all.slice(10, 40)));
    expect(joined.detached).toBe(true);
  });

  test('une fenêtre qui chevauche le présent le REJOINT : un fil continu, sans doublon', () => {
    const anchored = { messages: all.slice(10, 75), hasOlder: true, hasNewer: true };
    const joined = joinThreadWindows(present, anchored);
    expect(ids(joined.messages)).toEqual(ids(all.slice(10)));
    expect(joined.detached).toBe(false);
  });

  test('une fenêtre qui a atteint le présent n’est plus détachée, même sans chevauchement', () => {
    const anchored = { messages: all.slice(10, 70), hasOlder: true, hasNewer: false };
    const joined = joinThreadWindows(present, anchored);
    expect(ids(joined.messages)).toEqual(ids(all.slice(10)));
    expect(joined.detached).toBe(false);
  });
});

describe('loadMessagesWindow — la passerelle', () => {
  const wire = (id: string, minute: number) => ({ id, conversationId: 'c-1', content: id, createdAt: at(minute).toISOString(), translations: [] });

  const serve = (body: unknown) => {
    const urls: string[] = [];
    const fetchImpl = (async (input: RequestInfo | URL) => {
      urls.push(String(input));
      return new Response(JSON.stringify(body), { status: 200 });
    }) as typeof fetch;
    return { transport: createHttpTransport({ base: '', fetchImpl }), urls };
  };

  test('around : demande la fenêtre, renverse l’ordre servi, lit `hasNewer` à côté de `data`', async () => {
    const { transport, urls } = serve({
      success: true,
      data: [wire('m3', 3), wire('m2', 2), wire('m1', 1)],
      cursorPagination: { limit: 50, hasMore: true, nextCursor: 'm1' },
      hasNewer: true,
    });
    const result = await loadMessagesWindow({ source: 'gateway', transport, conversationId: 'c-1', param: { around: 'm2' } });
    expect(urls[0]).toContain('around=m2');
    expect(urls[0]).toContain('limit=50');
    expect(result.ok && ids(result.data.messages)).toEqual(['m1', 'm2', 'm3']);
    expect(result.ok && result.data.hasNewer).toBe(true);
    expect(result.ok && result.data.nextCursor).toBe('m1');
  });

  test('after : l’ordre servi est déjà ascendant, `hasMore` dit le plus récent', async () => {
    const { transport, urls } = serve({
      success: true,
      data: [wire('m4', 4), wire('m5', 5)],
      cursorPagination: { limit: 50, hasMore: false, nextCursor: null },
    });
    const result = await loadMessagesWindow({ source: 'gateway', transport, conversationId: 'c-1', param: { after: at(3).toISOString() } });
    expect(decodeURIComponent(urls[0] ?? '')).toContain(`after=${at(3).toISOString()}`);
    expect(result.ok && ids(result.data.messages)).toEqual(['m4', 'm5']);
    expect(result.ok && result.data.hasNewer).toBe(false);
  });
});

describe('le cache du fil atteint la fenêtre ancrée', () => {
  const seeded = () => {
    const queryClient = new QueryClient();
    const all = corpus(120);
    queryClient.setQueryData(messagesQueryKey('c-1'), {
      pages: [{ messages: all.slice(70), hasOlder: true, nextCursor: 'a70' }],
      pageParams: [undefined],
    });
    const window: WindowData = {
      pages: [{ messages: all.slice(10, 40), hasOlder: true, hasNewer: true, nextCursor: 'a10' }],
      pageParams: [{ around: 'a25' }],
    };
    queryClient.setQueryData(anchoredMessagesQueryKey('c-1', 'a25'), window);
    const anchored = () => queryClient.getQueryData<WindowData>(anchoredMessagesQueryKey('c-1', 'a25'))!.pages[0]!.messages;
    return { queryClient, anchored };
  };

  test('une réaction, une traduction, une consommation patchent AUSSI la fenêtre ancrée', () => {
    const { queryClient, anchored } = seeded();
    patchThreadMessages(queryClient, 'c-1', (messages) => messages.map((m) => (m.id === 'a25' ? { ...m, content: 'patché' } : m)));
    expect(anchored().find((m) => m.id === 'a25')?.content).toBe('patché');
    expect(findCachedThreadMessage(queryClient, 'c-1', 'a25')?.content).toBe('patché');
  });

  test('un message déjà servi s’y remplace ; un message NEUF n’y entre jamais — il appartient au présent', () => {
    const { queryClient, anchored } = seeded();
    const edited = { ...anchored()[0]!, content: 'édité' };
    upsertThreadMessage(queryClient, 'c-1', edited);
    expect(anchored()[0]?.content).toBe('édité');
    const fresh = message({ id: 'neuf', senderId: 'u-2', content: 'neuf', originalLanguage: 'fr', translations: [], createdAt: at(200) });
    upsertThreadMessage(queryClient, 'c-1', fresh);
    expect(ids(anchored())).not.toContain('neuf');
    expect(findCachedThreadMessage(queryClient, 'c-1', 'neuf')?.id).toBe('neuf');
  });
});
