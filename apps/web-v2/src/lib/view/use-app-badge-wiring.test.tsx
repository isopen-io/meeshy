import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import { CONVERSATIONS_QUERY_KEY } from '@/lib/api/conversations';
import { conversationStore } from '@/lib/conversation-store';
import type { Conversation } from '@/lib/api/types';

import { useAppBadge } from './use-app-badge';

/**
 * **LE CÂBLAGE DU BADGE — « QUI AFFICHE CE QUI EST RÉSOLU ? »** (W4, #7221).
 *
 * `countUnreadConversations` peut être juste sans qu'aucun pixel ne bouge :
 * ce fichier mesure le trajet COMPLET — cache de la liste (et override
 * optimiste) → `useAppBadge` → `document.title` et `navigator.setAppBadge`.
 * C'est le témoin que la version livrée n'avait pas : seules les fonctions
 * pures y étaient exercées, donc un `useAppBadge` jamais monté, abonné à la
 * mauvaise source ou branché sur rien serait resté VERT.
 */
type BadgeCall = { readonly kind: 'set'; readonly count: number } | { readonly kind: 'clear' };

function Probe() {
  useAppBadge();
  return null;
}

const page = (conversations: readonly Conversation[]) => ({
  pages: [
    {
      conversations,
      pagination: { limit: 30, offset: 0, total: conversations.length, hasMore: false },
      cursorPagination: { limit: 30, hasMore: false, nextCursor: null },
    },
  ],
  pageParams: [undefined],
});

const conversation = (partial: Partial<Conversation>): Conversation =>
  ({
    title: 'Fil',
    type: 'direct',
    createdAt: new Date('2026-09-20T00:00:00.000Z'),
    updatedAt: new Date('2026-09-20T00:00:00.000Z'),
    unreadCount: 0,
    ...partial,
  }) as Conversation;

const mutedPreferences = [{ isPinned: false, isMuted: true, isArchived: false }];

describe('useAppBadge — le compte atteint le titre de l’onglet et le badge d’icône', () => {
  const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
  let container: HTMLDivElement;
  let root: Root;
  let client: QueryClient;
  let calls: BadgeCall[];

  beforeAll(() => {
    ensureHappyDomRegistered();
    globals.IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterAll(async () => {
    await act(async () => {});
    await act(async () => {});
    delete globals.IS_REACT_ACT_ENVIRONMENT;
    await releaseHappyDomIfRegistered();
  });

  beforeEach(() => {
    calls = [];
    document.title = 'Meeshy';
    conversationStore.setState({ overrides: {} });
    Object.defineProperty(navigator, 'setAppBadge', {
      configurable: true,
      value: (count?: number) => {
        calls.push({ kind: 'set', count: count ?? -1 });
        return Promise.resolve();
      },
    });
    Object.defineProperty(navigator, 'clearAppBadge', {
      configurable: true,
      value: () => {
        calls.push({ kind: 'clear' });
        return Promise.resolve();
      },
    });
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    client.clear();
    conversationStore.setState({ overrides: {} });
  });

  const mount = (conversations?: readonly Conversation[]) => {
    if (conversations !== undefined) client.setQueryData(CONVERSATIONS_QUERY_KEY, page(conversations));
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      root.render(
        <QueryClientProvider client={client}>
          <Probe />
        </QueryClientProvider>,
      );
    });
  };

  test('deux conversations non lues ⇒ « (2) Meeshy » et setAppBadge(2)', () => {
    mount([
      conversation({ id: 'c-1', unreadCount: 4 }),
      conversation({ id: 'c-2', unreadCount: 1 }),
      conversation({ id: 'c-3', unreadCount: 0 }),
    ]);
    expect(document.title).toBe('(2) Meeshy');
    expect(calls).toEqual([{ kind: 'set', count: 2 }]);
  });

  test('D-L1 — une conversation en sourdine n’atteint NI le titre NI le badge', () => {
    mount([
      conversation({ id: 'c-1', unreadCount: 7, userPreferences: mutedPreferences }),
      conversation({ id: 'c-2', unreadCount: 2 }),
    ]);
    expect(document.title).toBe('(1) Meeshy');
    expect(calls).toEqual([{ kind: 'set', count: 1 }]);
  });

  test('aucune non lue ⇒ titre nu et clearAppBadge()', () => {
    mount([conversation({ id: 'c-1', unreadCount: 0 })]);
    expect(document.title).toBe('Meeshy');
    expect(calls).toEqual([{ kind: 'clear' }]);
  });

  /**
   * `conversation:unread-updated` réécrit le cache de la liste
   * (`applyConversationUnreadUpdated`, `lib/api/realtime-apply.ts`) : ce que le
   * témoin rejoue ici est cette écriture, et ce qu'il mesure est que le badge
   * la SUIT sans remontage.
   */
  test('un non-lu qui arrive dans le cache déplace le titre sans remonter l’arbre', async () => {
    mount([conversation({ id: 'c-1', unreadCount: 0 })]);
    expect(document.title).toBe('Meeshy');

    await act(async () => {
      client.setQueryData(CONVERSATIONS_QUERY_KEY, page([conversation({ id: 'c-1', unreadCount: 3 })]));
    });
    /* `notifyManager` publie HORS du tour courant : le premier `act` livre
       l'écriture au cache, le second laisse React repeindre ce que
       l'observateur en tire. */
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(document.title).toBe('(1) Meeshy');
    expect(calls.at(-1)).toEqual({ kind: 'set', count: 1 });
  });

  test('« marquer lu » en OPTIMISTE fait tomber le badge sans attendre le serveur', () => {
    mount([conversation({ id: 'c-1', unreadCount: 3 })]);
    expect(document.title).toBe('(1) Meeshy');

    act(() => {
      conversationStore.getState().markRead('c-1');
    });

    expect(document.title).toBe('Meeshy');
    expect(calls.at(-1)).toEqual({ kind: 'clear' });
  });

  /**
   * **#7370 — UN CACHE ABSENT N'EST PAS ZÉRO.** Ouvrir l'application AILLEURS
   * que sur la liste (lien direct vers `/c/:id`, ou clé de cache versionnée qui
   * vient de changer) monte `useAppBadge` sur un cache VIDE : le badge posé au
   * tour précédent était effacé, et le titre perdait son préfixe, sans qu'aucune
   * donnée ne l'ait dit. Le témoin PUR ne pouvait pas l'attraper — c'est ici,
   * sur l'arbre rendu, que le trajet cache → pixel se mesure.
   */
  test('cache ABSENT ⇒ titre et badge INCHANGÉS, jusqu’à la première valeur servie', async () => {
    document.title = '(3) Meeshy';
    mount();

    expect(document.title).toBe('(3) Meeshy');
    expect(calls).toEqual([]);

    await act(async () => {
      client.setQueryData(CONVERSATIONS_QUERY_KEY, page([conversation({ id: 'c-1', unreadCount: 2 })]));
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(document.title).toBe('(1) Meeshy');
    expect(calls).toEqual([{ kind: 'set', count: 1 }]);
  });

  test('« mettre en sourdine » en OPTIMISTE retire la conversation du badge', () => {
    mount([conversation({ id: 'c-1', unreadCount: 3 })]);
    expect(document.title).toBe('(1) Meeshy');

    act(() => {
      conversationStore.getState().toggleMute('c-1', false);
    });

    expect(document.title).toBe('Meeshy');
    expect(calls.at(-1)).toEqual({ kind: 'clear' });
  });
});
