import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider, useInfiniteQuery } from '@tanstack/react-query';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import type { FriendRequestRecord } from '@/lib/api/friend-requests';
import { relationshipIndexOf, relationshipOf } from '@/lib/discover/view';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { useExhaustPages } from './use-exhaust-pages';

/**
 * `useExhaustPages` (#6421) — un panier utilisé pour un INDEX (jamais
 * affiché ligne par ligne, ou pas assez défilé) doit être COMPLET, pas
 * seulement sa première page : mirror `FriendshipCache.fetchAllPages` (iOS).
 * Témoin de bout en bout : un contact posé en SECONDE page de `accepted`
 * résout « friend », sans qu'aucune ligne ne l'ait fait défiler.
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

const person = (id: string) => ({ id, username: id, displayName: null, avatar: null });

const contact = (id: string): FriendRequestRecord => ({
  id: `f-${id}`,
  senderId: id,
  receiverId: 'u-me',
  status: 'accepted',
  message: null,
  createdAt: '2026-09-13T09:00:00.000Z',
  sender: person(id),
  receiver: person('u-me'),
});

type Page = { readonly requests: readonly FriendRequestRecord[]; readonly nextCursor: string | null };

// Deux pages d'une ligne chacune — `u-page2` n'existe QUE dans la seconde,
// comme le 101e contact de #6421 (une page plus petite garde le témoin
// rapide ; le défaut porte sur l'ÉPUISEMENT, pas sur le seuil littéral).
const PAGES: Readonly<Record<string, Page>> = {
  '': { requests: [contact('u-page1')], nextCursor: 'page-2' },
  'page-2': { requests: [contact('u-page2')], nextCursor: null },
};

function Probe({ onRelationship }: { readonly onRelationship: (kind: string) => void }) {
  const query = useInfiniteQuery({
    queryKey: ['test', 'accepted'],
    initialPageParam: '' as string,
    queryFn: async ({ pageParam }: { pageParam: string }) => PAGES[pageParam] ?? { requests: [], nextCursor: null },
    getNextPageParam: (page: Page) => page.nextCursor ?? undefined,
  });
  useExhaustPages(query, true);
  const accepted = query.data?.pages.flatMap((page) => page.requests) ?? [];
  const index = relationshipIndexOf({ viewerId: 'u-me', received: [], sent: [], accepted, blocked: [] });
  onRelationship(relationshipOf(index, 'u-page2').kind);
  return null;
}

describe('useExhaustPages — l’index lit tout le panier, pas seulement la première page (#6421)', () => {
  beforeAll(() => {
    ensureHappyDomRegistered();
    globals.IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterAll(async () => {
    await act(async () => {});
    delete globals.IS_REACT_ACT_ENVIRONMENT;
    await releaseHappyDomIfRegistered();
  });

  let container: HTMLDivElement;
  let root: Root;

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  test('un contact en seconde page rend « friend », sans défilement', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    let latest = 'none';

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <Probe onRelationship={(kind) => (latest = kind)} />
        </QueryClientProvider>,
      );
    });

    for (let i = 0; i < 10 && latest !== 'friend'; i += 1) {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
    }

    expect(latest).toBe('friend');
  });
});
