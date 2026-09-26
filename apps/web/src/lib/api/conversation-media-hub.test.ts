import { InfiniteQueryObserver, QueryClient, QueryObserver } from '@tanstack/react-query';
import { describe, expect, test } from 'bun:test';

import type { HttpRequest, HttpTransport } from './http';
import { scriptedGateway } from '@/test-support/scripted-transport';

import {
  MEDIA_HUB_PAGE_SIZE,
  flattenMediaHubPages,
  loadMediaHubPage,
  mediaHubInfiniteOptions,
  mediaHubPath,
  mediaHubQueryKey,
  mediaHubSearchTerm,
  type MediaHubData,
} from './conversation-media-hub';
import type { Message } from './types';

/**
 * **LE PORT DE L'INDEX D'UNE CONVERSATION (#8103)** —
 * `GET /api/v1/conversations/:id/messages?view=media&kinds=…&q=…&before=…&limit=…`
 * (#8095, #8098). La forme est celle du fil : `data` + `cursorPagination`.
 */

const wire = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  conversationId: 'c1',
  senderId: 'u1',
  content: '',
  originalLanguage: 'fr',
  messageType: 'text',
  createdAt: '2026-09-20T10:00:00.000Z',
  updatedAt: '2026-09-20T10:00:00.000Z',
  translations: [],
  attachments: [],
  ...overrides,
});

const page = (ids: readonly string[], cursor: { readonly hasMore: boolean; readonly nextCursor: string | null }) => ({
  ok: true as const,
  data: ids.map((id) => wire(id)),
  cursorPagination: { ...cursor, limit: MEDIA_HUB_PAGE_SIZE },
});

describe('mediaHubPath — la requête qui part', () => {
  test('le genre, la taille de page, et rien d’autre au premier appel', () => {
    expect(mediaHubPath({ conversationId: 'c1', kind: 'audio', term: null, before: undefined })).toBe(
      `/api/v1/conversations/c1/messages?view=media&kinds=audio&limit=${MEDIA_HUB_PAGE_SIZE}`,
    );
  });

  test('la recherche et le curseur voyagent quand ils existent', () => {
    expect(mediaHubPath({ conversationId: 'c 1', kind: 'document', term: 'devis', before: 'm9' })).toBe(
      `/api/v1/conversations/c%201/messages?view=media&kinds=document&limit=${MEDIA_HUB_PAGE_SIZE}&q=devis&before=m9`,
    );
  });
});

describe('mediaHubSearchTerm — la passerelle refuse moins de deux caractères', () => {
  test('un terme trop court ou blanc ne cherche rien : le segment entier reste servi', () => {
    expect(mediaHubSearchTerm('')).toBeNull();
    expect(mediaHubSearchTerm('  a ')).toBeNull();
    expect(mediaHubSearchTerm('  pdf ')).toBe('pdf');
  });
});

describe('loadMediaHubPage — passerelle', () => {
  test('rend les messages dans l’ordre SERVI (récent d’abord) et le curseur de la page suivante', async () => {
    const { deps, calls } = scriptedGateway({
      [`GET ${mediaHubPath({ conversationId: 'c1', kind: 'visual', term: null, before: undefined })}`]: page(['m3', 'm2'], {
        hasMore: true,
        nextCursor: 'm2',
      }),
    });
    const result = await loadMediaHubPage({ ...deps, conversationId: 'c1', kind: 'visual', term: null });
    expect(calls()).toHaveLength(1);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.messages.map((message) => message.id)).toEqual(['m3', 'm2']);
    expect(result.data.hasOlder).toBe(true);
    expect(result.data.nextCursor).toBe('m2');
  });

  test('un refus de la passerelle remonte tel quel', async () => {
    const { deps } = scriptedGateway({});
    const result = await loadMediaHubPage({ ...deps, conversationId: 'c1', kind: 'link', term: null });
    expect(result.ok).toBe(false);
  });
});

describe('loadMediaHubPage — fixtures', () => {
  test('le corpus d’une conversation se filtre par genre, le plus récent d’abord', async () => {
    const { deps } = scriptedGateway({});
    const result = await loadMediaHubPage({ ...deps, source: 'fixtures', conversationId: 'c-medias', kind: 'visual', term: null });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const times = result.data.messages.map((message) => new Date(message.createdAt as unknown as string).getTime());
    expect([...times].sort((a, b) => b - a)).toEqual(times);
    expect(result.data.messages.every((message) => (message.attachments ?? []).some((a) => /^(image|video)\//u.test(a.mimeType)))).toBe(true);
  });
});

describe('mediaHubInfiniteOptions — le cache par segment', () => {
  test('une clé par (conversation, genre, recherche) : revenir sur un segment déjà vu le sert depuis le cache', async () => {
    const { deps, calls } = scriptedGateway({
      [`GET ${mediaHubPath({ conversationId: 'c1', kind: 'audio', term: null, before: undefined })}`]: page(['a2'], {
        hasMore: false,
        nextCursor: null,
      }),
    });
    const client = new QueryClient();
    await client.fetchInfiniteQuery(mediaHubInfiniteOptions(deps, 'c1', 'audio', null));
    const cached = client.getQueryData(mediaHubQueryKey('c1', 'audio', null));
    expect(cached).toBeDefined();
    expect(mediaHubQueryKey('c1', 'audio', null)).not.toEqual(mediaHubQueryKey('c1', 'audio', 'rapport'));
    expect(mediaHubQueryKey('c1', 'audio', null)).not.toEqual(mediaHubQueryKey('c1', 'document', null));
    expect(calls()).toHaveLength(1);
  });

  test('la page suivante part avec `before` = le curseur servi', async () => {
    const { deps, calls } = scriptedGateway({
      [`GET ${mediaHubPath({ conversationId: 'c1', kind: 'visual', term: null, before: undefined })}`]: page(['m3', 'm2'], {
        hasMore: true,
        nextCursor: 'm2',
      }),
      [`GET ${mediaHubPath({ conversationId: 'c1', kind: 'visual', term: null, before: 'm2' })}`]: page(['m1'], {
        hasMore: false,
        nextCursor: null,
      }),
    });
    const client = new QueryClient();
    const observer = new InfiniteQueryObserver(client, mediaHubInfiniteOptions(deps, 'c1', 'visual', null) as never);
    await observer.refetch();
    const result = await observer.fetchNextPage();
    expect(calls().map((call) => call.path)).toContain(mediaHubPath({ conversationId: 'c1', kind: 'visual', term: null, before: 'm2' }));
    expect(flattenMediaHubPages(result.data as MediaHubData).map((message) => message.id)).toEqual(['m3', 'm2', 'm1']);
    expect(result.hasNextPage).toBe(false);
  });

  test('changer de recherche ANNULE la requête précédente encore en vol', async () => {
    const signals: AbortSignal[] = [];
    const transport = (async () => ({ ok: false, status: 0, error: '' })) as unknown as HttpTransport;
    transport.request = (async (req: HttpRequest) => {
      if (req.signal !== undefined) signals.push(req.signal);
      return new Promise((resolve) => {
        req.signal?.addEventListener('abort', () => resolve({ ok: false, status: 0, error: 'aborted' }));
      });
    }) as HttpTransport['request'];
    const deps = { source: 'gateway' as const, transport };
    const client = new QueryClient();
    const observer = new QueryObserver(client, mediaHubInfiniteOptions(deps, 'c1', 'document', 'de') as never);
    const unsubscribe = observer.subscribe(() => undefined);
    await Promise.resolve();
    observer.setOptions(mediaHubInfiniteOptions(deps, 'c1', 'document', 'devis') as never);
    await new Promise((resolve) => setTimeout(resolve, 0));
    unsubscribe();
    expect(signals.length).toBeGreaterThanOrEqual(2);
    expect(signals[0]?.aborted).toBe(true);
  });
});

describe('flattenMediaHubPages', () => {
  test('dédoublonne une couture et revit les dates', () => {
    const decoded = flattenMediaHubPages({
      pageParams: [undefined, 'm2'],
      pages: [
        { messages: [wire('m3'), wire('m2')] as unknown as readonly Message[], hasOlder: true, nextCursor: 'm2' },
        { messages: [wire('m2'), wire('m1')] as unknown as readonly Message[], hasOlder: false, nextCursor: null },
      ],
    });
    expect(decoded.map((message) => message.id)).toEqual(['m3', 'm2', 'm1']);
    expect(decoded[0]?.createdAt).toBeInstanceOf(Date);
  });
});
