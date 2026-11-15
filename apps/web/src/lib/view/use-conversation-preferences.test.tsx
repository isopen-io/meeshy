import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { CONVERSATIONS_QUERY_KEY, conversationQueryKey } from '@/lib/api/conversations';
import { messagesQueryKey } from '@/lib/api/messages';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { useConversationPreferences } from './use-conversation-preferences';

/**
 * #10664 — l'identité de la fonction ne change que quand une PRÉFÉRENCE peut
 * avoir changé (la liste ou la fiche d'une conversation) : une page de messages
 * qui bouge (temps réel, défilement) ne fait pas recalculer toutes les lignes
 * des favoris.
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(() => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

const mounter = createActMounter();
afterEach(() => mounter.unmountAll());

const mountProbe = async (queryClient: QueryClient) => {
  const seen: Array<(conversationId: string) => unknown> = [];
  function Probe() {
    seen.push(useConversationPreferences());
    return null;
  }
  await mounter.mount(
    <QueryClientProvider client={queryClient}>
      <Probe />
    </QueryClientProvider>,
  );
  return seen;
};

const distinct = (seen: ReadonlyArray<unknown>): number => new Set(seen).size;

describe('les préférences du lecteur lues du cache (#10664)', () => {
  test('une page de MESSAGES qui bouge ne change pas l’identité', async () => {
    const queryClient = new QueryClient();
    const seen = await mountProbe(queryClient);
    const before = distinct(seen);
    await act(async () => {
      queryClient.setQueryData(messagesQueryKey('c1'), { pages: [], pageParams: [] });
    });
    await mounter.settle();
    expect(distinct(seen)).toBe(before);
  });

  test('la fiche ou la liste qui bouge la change, et la préférence servie suit', async () => {
    const queryClient = new QueryClient();
    const seen = await mountProbe(queryClient);
    const before = distinct(seen);
    await act(async () => {
      queryClient.setQueryData(conversationQueryKey('c1'), { id: 'c1', userPreferences: [{ pinned: true }] });
    });
    await mounter.settle();
    expect(distinct(seen)).toBe(before + 1);
    expect(seen.at(-1)?.('c1')).toEqual([{ pinned: true }]);
    await act(async () => {
      queryClient.setQueryData(CONVERSATIONS_QUERY_KEY, { pages: [], pageParams: [] });
    });
    await mounter.settle();
    expect(distinct(seen)).toBe(before + 2);
  });
});
