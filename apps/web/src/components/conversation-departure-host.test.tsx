import { QueryClient } from '@tanstack/react-query';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'bun:test';

import { CONVERSATIONS_QUERY_KEY } from '@/lib/api/conversations';
import type { ConversationsInfiniteData } from '@/lib/api/conversations-pages';
import type { ApiResult, HttpRequest, HttpTransport } from '@/lib/api/http';
import type { Conversation } from '@/lib/api/types';
import { departureStore, requestDeparture } from '@/lib/conversation-departure';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { setInterfaceLanguage } from '@/lib/interface-language';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { ConversationDepartureHost } from './conversation-departure-host';

/**
 * **LE GESTE A UN EFFET** (#7285, #7837) — la confirmation d'iOS, puis la
 * rangée qui part, la passerelle appelée, et l'échec qui la ramène en le
 * disant. Pas seulement un contrôle rendu.
 */

const conversation = (id: string, type: Conversation['type'] = 'group'): Conversation =>
  ({
    id,
    type,
    title: `Conversation ${id}`,
    status: 'active',
    visibility: 'private',
    isActive: true,
    memberCount: 3,
    participants: [],
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    unreadCount: 0,
  }) as Conversation;

const clientWith = (ids: readonly string[]) => {
  const queryClient = new QueryClient();
  queryClient.setQueryData<ConversationsInfiniteData>(CONVERSATIONS_QUERY_KEY, {
    pages: [
      {
        conversations: ids.map((id) => conversation(id)),
        pagination: { limit: 30, offset: 0, total: ids.length, hasMore: false },
        cursorPagination: { limit: 30, hasMore: false, nextCursor: null },
      },
    ],
    pageParams: [undefined],
  });
  return queryClient;
};

const listed = (queryClient: QueryClient) =>
  queryClient.getQueryData<ConversationsInfiniteData>(CONVERSATIONS_QUERY_KEY)?.pages.flatMap((p) => p.conversations.map((c) => c.id));

const transportReplying = (reply: ApiResult<unknown>) => {
  const calls: HttpRequest[] = [];
  const transport = {
    request: async (req: HttpRequest) => {
      calls.push(req);
      return reply;
    },
  } as unknown as HttpTransport;
  return { transport, calls };
};

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
let container: HTMLDivElement;
let root: Root;

beforeAll(async () => {
  ensureHappyDomRegistered({ url: 'http://localhost/' });
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await loadInterfaceCatalog('fr');
});
afterAll(async () => {
  await act(async () => {});
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});
beforeEach(() => {
  departureStore.setState({ request: null, failure: null });
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  departureStore.setState({ request: null, failure: null });
});

const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
  });

const mount = (options: { readonly queryClient: QueryClient; readonly reply: ApiResult<unknown>; readonly online?: boolean }) => {
  const { transport, calls } = transportReplying(options.reply);
  const returns: string[] = [];
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(
      <ConversationDepartureHost
        deps={{ source: 'gateway', transport, queryClient: options.queryClient }}
        isOnline={() => options.online ?? true}
        onReturnToList={() => returns.push('list')}
      />,
    );
  });
  return { calls, returns };
};

const dialog = () => document.querySelector<HTMLDialogElement>('[data-confirm-dialog="conversation-departure"]');
const click = (selector: string) =>
  act(() => {
    document.querySelector<HTMLButtonElement>(selector)?.click();
  });

describe('supprimer une conversation depuis la liste', () => {
  test('la demande ouvre la confirmation d’iOS, qui nomme la conversation', () => {
    const queryClient = clientWith(['a', 'b']);
    mount({ queryClient, reply: { ok: true, data: {} } });
    act(() => requestDeparture({ conversationId: 'b', kind: 'delete', returnToList: false }));

    expect(dialog()?.querySelector('h2')?.textContent).toBe('Supprimer la conversation ?');
    expect(dialog()?.textContent).toContain('« Conversation b » sera masquée pour vous. Les autres participants la conservent.');
    expect(dialog()?.querySelector('[data-confirm="confirm"]')?.textContent).toBe('Supprimer');
  });

  test('confirmer retire la rangée et appelle la passerelle', async () => {
    const queryClient = clientWith(['a', 'b']);
    const { calls, returns } = mount({ queryClient, reply: { ok: true, data: {} } });
    act(() => requestDeparture({ conversationId: 'b', kind: 'delete', returnToList: false }));

    click('[data-confirm="confirm"]');
    expect(listed(queryClient)).toEqual(['a']);
    await settle();

    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual(['DELETE /api/v1/conversations/b/delete-for-me']);
    expect(dialog()).toBeNull();
    expect(document.querySelector('[data-departure-failure]')).toBeNull();
    expect(returns).toEqual([]);
  });

  test('un refus ramène la rangée et le dit', async () => {
    const queryClient = clientWith(['a', 'b']);
    mount({ queryClient, reply: { ok: false, status: 500, error: 'Erreur 500' } });
    act(() => requestDeparture({ conversationId: 'b', kind: 'delete', returnToList: false }));

    click('[data-confirm="confirm"]');
    await settle();

    expect(listed(queryClient)).toEqual(['a', 'b']);
    const alert = document.querySelector('[data-departure-failure]');
    expect(alert?.getAttribute('role')).toBe('alert');
    expect(alert?.textContent).toContain('Impossible de supprimer la conversation.');

    click('[data-departure-failure] button');
    expect(document.querySelector('[data-departure-failure]')).toBeNull();
  });

  test('annuler ne touche à rien', async () => {
    const queryClient = clientWith(['a', 'b']);
    const { calls } = mount({ queryClient, reply: { ok: true, data: {} } });
    act(() => requestDeparture({ conversationId: 'b', kind: 'delete', returnToList: false }));

    click('[data-confirm="cancel"]');
    await settle();

    expect(calls).toEqual([]);
    expect(listed(queryClient)).toEqual(['a', 'b']);
    expect(dialog()).toBeNull();
  });

  test('hors ligne : rien ne part, la rangée reste, et l’écran dit pourquoi', async () => {
    const queryClient = clientWith(['a', 'b']);
    const { calls } = mount({ queryClient, reply: { ok: true, data: {} }, online: false });
    act(() => requestDeparture({ conversationId: 'b', kind: 'delete', returnToList: false }));

    click('[data-confirm="confirm"]');
    await settle();

    expect(calls).toEqual([]);
    expect(listed(queryClient)).toEqual(['a', 'b']);
    expect(document.querySelector('[data-departure-failure]')?.textContent).toContain('Hors ligne — réessayez une fois connecté.');
  });
});

describe('quitter un groupe depuis ses détails', () => {
  test('la confirmation est celle du départ, distincte de la suppression', () => {
    const queryClient = clientWith(['g']);
    mount({ queryClient, reply: { ok: true, data: {} } });
    act(() => requestDeparture({ conversationId: 'g', kind: 'leave', returnToList: true }));

    expect(dialog()?.querySelector('h2')?.textContent).toBe('Quitter la conversation ?');
    expect(dialog()?.textContent).toContain('Vous ne recevrez plus de messages. Votre historique restera lisible.');
    expect(dialog()?.querySelector('[data-confirm="confirm"]')?.textContent).toBe('Quitter');
  });

  test('confirmer ramène à la liste, sans la conversation, et appelle POST …/leave', async () => {
    const queryClient = clientWith(['g', 'h']);
    const { calls, returns } = mount({ queryClient, reply: { ok: true, data: {} } });
    act(() => requestDeparture({ conversationId: 'g', kind: 'leave', returnToList: true }));

    click('[data-confirm="confirm"]');
    expect(returns).toEqual(['list']);
    expect(listed(queryClient)).toEqual(['h']);
    await settle();

    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual(['POST /api/v1/conversations/g/leave']);
  });

  test('un échec du départ se dit avec le mot du départ', async () => {
    const queryClient = clientWith(['g']);
    mount({ queryClient, reply: { ok: false, status: 500, error: 'Erreur 500' } });
    act(() => requestDeparture({ conversationId: 'g', kind: 'leave', returnToList: true }));

    click('[data-confirm="confirm"]');
    await settle();

    expect(listed(queryClient)).toEqual(['g']);
    expect(document.querySelector('[data-departure-failure]')?.textContent).toContain('Impossible de quitter la conversation.');
  });
});

describe('les sept langues', () => {
  test('la confirmation et l’échec se lisent en anglais', async () => {
    await setInterfaceLanguage('en');
    const queryClient = clientWith(['g']);
    mount({ queryClient, reply: { ok: false, status: 500, error: 'Erreur 500' } });
    act(() => requestDeparture({ conversationId: 'g', kind: 'leave', returnToList: false }));

    expect(dialog()?.querySelector('h2')?.textContent).toBe('Leave conversation?');
    click('[data-confirm="confirm"]');
    await settle();
    expect(document.querySelector('[data-departure-failure]')?.textContent).toContain("Couldn't leave the conversation.");
    await setInterfaceLanguage('fr');
  });
});
