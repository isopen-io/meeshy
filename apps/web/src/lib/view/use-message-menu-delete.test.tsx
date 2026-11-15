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
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import { menuConversation, menuViewer } from '@/test-support/menu-viewer';

import { ROW_EXIT_MS, rowExitStore } from './row-exit-motion';
import { useMessageMenu } from './use-message-menu';

/**
 * #10582 — SUPPRIMER DEPUIS « PLUS… » ET DEPUIS LA SÉLECTION. Le témoin passe
 * par les portes que l'écran câble : le geste ouvre le dialogue avec ce que la
 * règle offre pour TOUS les messages visés, confirmer part sur la bonne route,
 * et l'issue — entière, partielle, refusée — se dit.
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

/* « Pour tous » charge son puits en `import()` (morceau `realtime`) : chargé
   d'avance, l'import froid ne court plus contre les deux tours de `settle`. */
beforeAll(async () => {
  await Promise.all([loadInterfaceCatalog('fr'), loadMessagePiecesCatalog('fr'), import('@/lib/api/realtime-message-mutations')]);
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

const row = (id: string, minute: number, overrides: Partial<Message> = {}): Message =>
  message({
    id,
    conversationId: 'c-a',
    senderId: 'u-viewer',
    content: `texte ${id}`,
    originalLanguage: 'fr',
    translations: [],
    createdAt: minutesAgo(60 - minute),
    ...overrides,
  });

const M1 = row('m-1', 1);
const M2 = row('m-2', 2);
const THEIRS = row('m-3', 3, { senderId: 'u-autre' });
const MESSAGES = [M1, M2, THEIRS];
const PLACED = MESSAGES.map((m) => ({ message: m }));

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
  queryClient.setQueryData(messagesQueryKey('c-a'), { pages: [{ messages: MESSAGES, hasOlder: false, nextCursor: null }], pageParams: [undefined] });
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
  return { api: () => latest, requests, announced, queryClient };
}

const settle = () =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
  });

const select = (api: () => MenuApi, ids: readonly string[]) => {
  const [first, ...rest] = ids;
  if (first === undefined) return;
  act(() => api().onMenuAction(first, 'select'));
  rest.forEach((id) => act(() => api().onRowTap(id)));
};

describe('« Plus… » — supprimer UN message', () => {
  test('mon message ⇒ le geste ouvre le dialogue, qui offre pour tous et pour moi', () => {
    const { api } = mount();
    const ask = api().deleteOf('m-1');
    expect(ask).not.toBeNull();
    act(() => ask?.());
    expect(api().deleteRequest).toEqual({ messageIds: ['m-1'], offer: { forEveryone: true, forMe: true, remove: false } });
  });

  test('le message d’un autre ⇒ pour moi seulement', () => {
    const { api } = mount();
    act(() => api().deleteOf('m-3')?.());
    expect(api().deleteRequest?.offer).toEqual({ forEveryone: false, forMe: true, remove: false });
  });

  test('un invité ⇒ aucun geste', () => {
    const { api } = mount({ hasAccount: false });
    expect(api().deleteOf('m-1')).toBeNull();
  });

  test('« pour tous » part sur la route de la conversation, referme, et l’issue se dit', async () => {
    const { api, requests, announced } = mount();
    act(() => api().deleteOf('m-1')?.());
    act(() => api().onConfirmDelete('everyone'));
    expect(api().deleteRequest).toBeNull();
    await settle();
    expect(requests).toEqual([{ method: 'DELETE', path: '/api/v1/conversations/c-a/messages/m-1' }]);
    expect(announced).toEqual(['Message supprimé']);
  });

  test('« pour moi » part sur la route personnelle', async () => {
    const { api, requests } = mount();
    act(() => api().deleteOf('m-3')?.());
    act(() => api().onConfirmDelete('me'));
    await settle();
    expect(requests).toEqual([{ method: 'DELETE', path: '/api/v1/messages/m-3/delete-for-me' }]);
  });

  test('« pour tous » demandé alors que la règle ne l’offre pas ⇒ rien ne part', async () => {
    const { api, requests } = mount();
    act(() => api().deleteOf('m-3')?.());
    act(() => api().onConfirmDelete('everyone'));
    await settle();
    expect(requests).toEqual([]);
  });

  test('fermer le dialogue ne supprime rien', async () => {
    const { api, requests } = mount();
    act(() => api().deleteOf('m-1')?.());
    act(() => api().onDismissDelete());
    await settle();
    expect(api().deleteRequest).toBeNull();
    expect(requests).toEqual([]);
  });

  test('un refus se dit', async () => {
    const { api, announced } = mount({ answer: () => ({ ok: false, status: 403, error: 'Forbidden' }) });
    act(() => api().deleteOf('m-1')?.());
    act(() => api().onConfirmDelete('everyone'));
    await settle();
    expect(announced).toEqual(['Le message n’a pas pu être supprimé']);
  });
});

describe('la barre de sélection — supprimer PLUSIEURS messages', () => {
  test('la corbeille s’offre dès qu’un message est coché', () => {
    const { api } = mount();
    expect(api().selectionOffers.delete).toBe(false);
    select(api, ['m-1']);
    expect(api().selectionOffers.delete).toBe(true);
  });

  test('tous les miens ⇒ pour tous est offert ; dans l’ordre du FIL, pas celui des coches', () => {
    const { api } = mount();
    select(api, ['m-2', 'm-1']);
    act(() => api().onDeleteSelection(PLACED));
    expect(api().deleteRequest).toEqual({ messageIds: ['m-1', 'm-2'], offer: { forEveryone: true, forMe: true, remove: false } });
  });

  test('un seul message d’un autre dans la sélection ⇒ « pour tous » n’est plus offert', () => {
    const { api } = mount();
    select(api, ['m-1', 'm-3']);
    act(() => api().onDeleteSelection(PLACED));
    expect(api().deleteRequest?.offer).toEqual({ forEveryone: false, forMe: true, remove: false });
  });

  test('« pour tous » boucle sur la route unitaire, la sélection se termine, l’issue compte', async () => {
    const { api, requests, announced } = mount();
    select(api, ['m-1', 'm-2']);
    act(() => api().onDeleteSelection(PLACED));
    act(() => api().onConfirmDelete('everyone'));
    expect(api().selection).toBeNull();
    await settle();
    expect(requests.map((r) => r.path)).toEqual(['/api/v1/conversations/c-a/messages/m-1', '/api/v1/conversations/c-a/messages/m-2']);
    expect(announced).toEqual(['2 messages supprimés']);
  });

  test('« pour moi » part en UNE requête de masse', async () => {
    const { api, requests } = mount({ answer: () => ({ ok: true, data: { deletedCount: 2, requestedCount: 2 } }) });
    select(api, ['m-1', 'm-3']);
    act(() => api().onDeleteSelection(PLACED));
    act(() => api().onConfirmDelete('me'));
    await settle();
    expect(requests).toEqual([{ method: 'DELETE', path: '/api/v1/messages/bulk/delete-for-me', body: { messageIds: ['m-1', 'm-3'] } }]);
  });

  test('un échec partiel se dit, avec le compte de ce qui reste', async () => {
    const { api, announced } = mount({
      answer: (request) => (request.path.endsWith('/m-2') ? { ok: false, status: 403, error: 'Forbidden' } : { ok: true, data: null }),
    });
    select(api, ['m-1', 'm-2']);
    act(() => api().onDeleteSelection(PLACED));
    act(() => api().onConfirmDelete('everyone'));
    await settle();
    expect(announced).toEqual(['Un message sur 2 n’a pas pu être supprimé']);
  });

  test('annuler le dialogue garde la sélection', () => {
    const { api } = mount();
    select(api, ['m-1', 'm-2']);
    act(() => api().onDeleteSelection(PLACED));
    act(() => api().onDismissDelete());
    expect(api().selection?.ids).toEqual(['m-1', 'm-2']);
  });
});

/**
 * #12634 — LA SORTIE DU FIL CÂBLÉE PAR DÉFAUT : « pour moi » garde la rangée au
 * cache (donc montée) le temps de son repli, la publie sortante, puis la retire ;
 * un refus la rend et la publie revenante. Sous « Réduire les animations », elle
 * part dans l'image du geste.
 */
describe('« pour moi » — la rangée sort du fil en se repliant', () => {
  const rowIds = (queryClient: QueryClient): readonly string[] =>
    queryClient.getQueryData<{ pages: { messages: Message[] }[] }>(messagesQueryKey('c-a'))?.pages.flatMap((p) => p.messages.map((m) => m.id)) ?? [];
  const pastTheExit = () =>
    act(async () => {
      await new Promise((r) => setTimeout(r, ROW_EXIT_MS + 40));
    });
  const reduceMotion = (reduced: boolean) => {
    const media = (query: string) => ({ matches: reduced && query.includes('prefers-reduced-motion'), media: query, addEventListener: () => {}, removeEventListener: () => {} });
    Object.defineProperty(window, 'matchMedia', { configurable: true, writable: true, value: media });
  };
  afterEach(() => {
    Reflect.deleteProperty(window, 'matchMedia');
    rowExitStore.setState({ leaving: new Set(), returning: new Set() });
  });

  test('la rangée reste au fil pendant la sortie, publiée sortante, puis le quitte', async () => {
    reduceMotion(false);
    const { api, queryClient } = mount();
    act(() => api().deleteOf('m-3')?.());
    act(() => api().onConfirmDelete('me'));
    await settle();
    expect(rowIds(queryClient)).toContain('m-3');
    expect(rowExitStore.getState().leaving.has('m-3')).toBe(true);
    await pastTheExit();
    expect(rowIds(queryClient)).not.toContain('m-3');
  });

  test('un refus la rend à sa place, publiée revenante, et l’issue se dit', async () => {
    reduceMotion(false);
    const { api, queryClient, announced } = mount({ answer: () => ({ ok: false, status: 0, error: 'offline' }) });
    act(() => api().deleteOf('m-3')?.());
    act(() => api().onConfirmDelete('me'));
    await pastTheExit();
    expect(rowIds(queryClient)).toEqual(['m-1', 'm-2', 'm-3']);
    expect(rowExitStore.getState().returning.has('m-3')).toBe(true);
    expect(announced).toHaveLength(1);
  });

  test('« Réduire les animations » : la rangée part dans l’image du geste, rien n’est publié', async () => {
    reduceMotion(true);
    const { api, queryClient } = mount();
    act(() => api().deleteOf('m-3')?.());
    act(() => api().onConfirmDelete('me'));
    expect(rowIds(queryClient)).not.toContain('m-3');
    expect(rowExitStore.getState().leaving.size).toBe(0);
  });
});
