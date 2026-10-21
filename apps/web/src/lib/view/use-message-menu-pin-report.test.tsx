import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { message, minutesAgo } from '@/lib/api/fixtures-base';
import type { ApiResult, HttpRequest } from '@/lib/api/http';
import { messagesQueryKey } from '@/lib/api/messages';
import type { Message } from '@/lib/api/types';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { loadMessagePiecesCatalog } from '@/lib/i18n-message-pieces-catalog';
import { threadOf, threadPages } from '@/test-support/thread-cache';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import { menuConversation, menuViewer } from '@/test-support/menu-viewer';

import { useMessageMenu } from './use-message-menu';

/**
 * #7558 — ÉPINGLER ET SIGNALER DEPUIS « PLUS… ». Le témoin passe par les
 * portes que l'écran câble : `pinOf` / `reportOf` disent ce qui s'offre, le
 * geste part sur la bonne route, l'épingle se voit avant la réponse et se
 * retire sur un refus, et chaque issue se dit.
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

/* L'épingle charge son puits en `import()` (morceau `realtime`) : chargé
   d'avance, l'import froid ne court pas contre les deux tours de `settle`. */
beforeAll(async () => {
  await Promise.all([loadInterfaceCatalog('fr'), loadMessagePiecesCatalog('fr'), import('@/lib/api/realtime-message-pin')]);
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(async () => {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

const row = (id: string, overrides: Partial<Message> = {}): Message =>
  message({
    id,
    conversationId: 'c-a',
    senderId: 'u-other',
    content: `texte ${id}`,
    originalLanguage: 'fr',
    translations: [],
    createdAt: minutesAgo(10),
    ...overrides,
  });

const THEIRS = row('m-1');
const MINE = row('m-2', { senderId: 'u-viewer' });
const PINNED = row('m-3', { pinnedAt: new Date('2026-10-01T08:00:00.000Z'), pinnedBy: 'u-other' });
const MESSAGES = [THEIRS, MINE, PINNED];

type MenuApi = ReturnType<typeof useMessageMenu>;

let container: HTMLDivElement;
let root: Root;

afterEach(() => {
  act(() => root.unmount());
  document.body.replaceChildren();
});

function mount(options: { readonly hasAccount?: boolean; readonly answer?: (request: HttpRequest) => ApiResult<unknown> } = {}) {
  const requests: HttpRequest[] = [];
  const announced: string[] = [];
  const queryClient = new QueryClient();
  queryClient.setQueryData(messagesQueryKey('c-a'), threadPages(MESSAGES));
  const transport = {
    request: async <T,>(request: HttpRequest): Promise<ApiResult<T>> => {
      requests.push(request);
      return (options.answer?.(request) ?? { ok: true, data: null }) as ApiResult<T>;
    },
  };
  let latest!: MenuApi;
  function Harness() {
    latest = useMessageMenu({
      conversationId: 'c-a',
      messages: MESSAGES,
      readerLanguages: ['fr'],
      readerLocale: 'fr-FR',
      viewer: menuViewer({ hasAccount: options.hasAccount ?? true }),
      conversation: menuConversation(),
      reply: { setReplyTarget: () => {}, setReplyToMedia: () => {} },
      announce: (text) => announced.push(text),
      queryClient,
      transport,
      source: 'gateway',
    });
    return null;
  }
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  act(() =>
    root.render(
      <QueryClientProvider client={queryClient}>
        <Harness />
      </QueryClientProvider>,
    ),
  );
  const pinnedIn = (id: string) => threadOf(queryClient, 'c-a')?.messages.find((m) => m.id === id)?.pinnedAt;
  return { api: () => latest, requests, announced, pinnedIn };
}

const settle = () =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
  });

describe('« Plus… » — épingler', () => {
  test('un message non épinglé offre « Épingler », un épinglé « Désépingler »', () => {
    const { api } = mount();
    expect(api().pinOf('m-1')?.action).toBe('pin');
    expect(api().pinOf('m-3')?.action).toBe('unpin');
  });

  test('un invité ⇒ rien', () => {
    const { api } = mount({ hasAccount: false });
    expect(api().pinOf('m-1')).toBeNull();
  });

  test('épingler part en PUT, l’épingle se voit, et l’issue se dit', async () => {
    const { api, requests, announced, pinnedIn } = mount();
    act(() => api().pinOf('m-1')?.onToggle());
    await settle();
    expect(requests).toEqual([{ method: 'PUT', path: '/api/v1/conversations/c-a/messages/m-1/pin' }]);
    expect(pinnedIn('m-1')).toBeInstanceOf(Date);
    expect(announced).toEqual(['Message épinglé']);
  });

  test('désépingler part en DELETE', async () => {
    const { api, requests, announced, pinnedIn } = mount();
    act(() => api().pinOf('m-3')?.onToggle());
    await settle();
    expect(requests).toEqual([{ method: 'DELETE', path: '/api/v1/conversations/c-a/messages/m-3/pin' }]);
    expect(pinnedIn('m-3')).toBeUndefined();
    expect(announced).toEqual(['Message désépinglé']);
  });

  test('un refus retire l’épingle posée et se dit', async () => {
    const { api, announced, pinnedIn } = mount({ answer: () => ({ ok: false, status: 403, error: 'Forbidden' }) });
    act(() => api().pinOf('m-1')?.onToggle());
    await settle();
    expect(pinnedIn('m-1')).toBeUndefined();
    expect(announced).toEqual(['Le message n’a pas pu être épinglé']);
  });
});

describe('« Plus… » — signaler', () => {
  test('le message d’un autre s’offre ; le mien jamais ; un invité jamais', () => {
    expect(mount().api().reportOf('m-1')).not.toBeNull();
    act(() => root.unmount());
    expect(mount().api().reportOf('m-2')).toBeNull();
    act(() => root.unmount());
    expect(mount({ hasAccount: false }).api().reportOf('m-1')).toBeNull();
  });

  test('le geste ouvre la feuille des motifs ; choisir un motif l’envoie sous le type « message » et la referme', async () => {
    const { api, requests, announced } = mount();
    act(() => api().reportOf('m-1')?.());
    expect(api().reportFor).toBe('m-1');
    act(() => api().onPickReportReason('harassment'));
    expect(api().reportFor).toBeNull();
    await settle();
    expect(requests).toEqual([
      { method: 'POST', path: '/api/v1/reports', body: { reportedType: 'message', reportedEntityId: 'm-1', reportType: 'harassment' } },
    ]);
    expect(announced).toEqual(['Signalement envoyé']);
  });

  test('fermer la feuille n’envoie rien', async () => {
    const { api, requests } = mount();
    act(() => api().reportOf('m-1')?.());
    act(() => api().onDismissReport());
    await settle();
    expect(api().reportFor).toBeNull();
    expect(requests).toEqual([]);
  });

  test('le débit atteint se dit comme tel, pas comme un échec', async () => {
    const { api, announced } = mount({ answer: () => ({ ok: false, status: 429, error: 'Too many' }) });
    act(() => api().reportOf('m-1')?.());
    act(() => api().onPickReportReason('spam'));
    await settle();
    expect(announced).toEqual(['Trop de signalements — réessayez dans un moment']);
  });
});
