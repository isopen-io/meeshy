import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { CONVERSATIONS_QUERY_KEY, conversationQueryKey } from './conversations';
import { messagesQueryKey } from './messages';
import { applyMessageTranslation } from './realtime-apply';
import { refreshListAction, useThreadData } from './query';
import { appQueryClient } from './query-client';
import { STATUS_MOODS_QUERY_KEY, STORY_TRAY_QUERY_KEY } from './stories';
import type { Conversation } from './types';

/**
 * `useThreadData` — testé par `renderToStaticMarkup` (motif
 * `auth-screens.test.tsx`) : l'ÉTAT INITIAL d'un rendu synchrone, sous
 * `QueryClientProvider`. La source ici est `fixtures` (`bun test` ne pose
 * pas `VITE_DATA_SOURCE`), donc `loadConversation`/`loadMessages` résolvent
 * SYNCHRONEMENT dans leur micro-tâche — mais `renderToStaticMarkup` ne
 * relance pas de second rendu après la résolution : ce test capture l'état
 * `pending` du premier rendu, jamais le `success` qui suivrait un second
 * passage React (que ce runtime sans DOM ne produit pas). C'est le F8 qui
 * compte ici : AUCUN repli sur une autre conversation, quel que soit l'état.
 */
function Probe({ id }: { readonly id: string }) {
  const data = useThreadData(id);
  return <span data-status={data.status}>{data.conversation?.title ?? 'aucune'}</span>;
}

function renderProbe(id: string): string {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderToStaticMarkup(
    <QueryClientProvider client={queryClient}>
      <Probe id={id} />
    </QueryClientProvider>,
  );
}

describe('useThreadData — F8 (#5650), jamais de repli sur une autre conversation', () => {
  test('id inconnu : le rendu ne montre jamais le titre d’une autre conversation', () => {
    const html = renderProbe('c-inexistant-xyz');
    expect(html).toContain('aucune');
    expect(html).not.toContain('Équipe déploiement');
  });

  test('id connu (fixtures) : le rendu ne rejette pas au premier passage', () => {
    expect(() => renderProbe('c-deploiement')).not.toThrow();
  });
});

/**
 * `conversationId` (revue-correction #5793, défaut MAJEUR 3) — un lien
 * direct `/c/<identifiant>` (forme réelle des chemins de recette des coques,
 * `MEESHY_SHELL_START_PATH="/c/salon..riviere/x"`) charge par l'identifiant
 * mais doit exposer l'ObjectId CANONIQUE dès que `GET /conversations/:id`
 * (qui accepte les deux formes, `core-detail.ts:250`) l'a rendu : c'est CETTE
 * valeur, jamais le paramètre de route, que `message:new`/
 * `conversation:updated`/`message:translation` portent
 * (`normalizeConversationId`, `MeeshySocketIOManager.ts:2879`).
 */
describe('useThreadData — `conversationId` (#5793, revue-correction défaut 3)', () => {
  const canonical = (partial: Partial<Conversation>): Conversation =>
    ({
      id: 'canonical-abc',
      type: 'group',
      status: 'active',
      visibility: 'public',
      isActive: true,
      memberCount: 3,
      participants: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      ...partial,
    }) as Conversation;

  test('un id de ROUTE non canonique (identifiant) résout `conversationId` sur `conversation.id`', () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    queryClient.setQueryData(conversationQueryKey('salon-riviere'), canonical({}));
    queryClient.setQueryData(messagesQueryKey('canonical-abc'), { messages: [], hasOlder: false });

    function Probe() {
      const data = useThreadData('salon-riviere');
      return <span data-conversation-id={data.conversationId} data-status={data.status} />;
    }
    const html = renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <Probe />
      </QueryClientProvider>,
    );

    expect(html).toContain('data-conversation-id="canonical-abc"');
    expect(html).toContain('data-status="success"');
  });

  test('un id de ROUTE DÉJÀ canonique ne change pas de clé — `conversationId` reste l’id de route', () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    queryClient.setQueryData(conversationQueryKey('canonical-abc'), canonical({}));
    queryClient.setQueryData(messagesQueryKey('canonical-abc'), { messages: [], hasOlder: false });

    function Probe() {
      const data = useThreadData('canonical-abc');
      return <span data-conversation-id={data.conversationId} />;
    }
    const html = renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <Probe />
      </QueryClientProvider>,
    );

    expect(html).toContain('data-conversation-id="canonical-abc"');
  });

  test('avant résolution (conversation pas encore en cache) : `conversationId` retombe sur l’id de ROUTE', () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    function Probe() {
      const data = useThreadData('salon-riviere');
      return <span data-conversation-id={data.conversationId} />;
    }
    const html = renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <Probe />
      </QueryClientProvider>,
    );

    expect(html).toContain('data-conversation-id="salon-riviere"');
  });
});

/**
 * T3 (#6171, § 4.1) — LE MAILLON « cache → hook → écran » : une traduction
 * greffée par `applyMessageTranslation` (`setQueryData`) notifie
 * l'OBSERVATEUR TanStack de `useThreadData`, SANS qu'aucun FETCH
 * supplémentaire ne parte. Motif `use-thread-chrome-signals.test.tsx` :
 * `createRoot` + `act`, happy-dom réel — `renderToStaticMarkup` (le motif du
 * reste de ce fichier) ne rejoue pas de second rendu après la résolution
 * asynchrone des fixtures, donc ne peut pas observer cette mise à jour.
 *
 * Le compteur distingue un FETCH réel (`action.type === 'fetch'`, posé par
 * `QueryObserver`/`refetch`) d'une simple écriture de cache
 * (`setQueryData` ⇒ `action.type === 'success'`, manuel) : c'est la même
 * distinction que T2 (`socket.test.ts`), portée au niveau de l'ÉCRAN plutôt
 * que du port.
 */
const globalsT3 = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

describe('useThreadData — une traduction reçue re-rend le fil SANS refetch (#6171, T3)', () => {
  beforeAll(() => {
    ensureHappyDomRegistered();
    globalsT3.IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterAll(async () => {
    await act(async () => {});
    delete globalsT3.IS_REACT_ACT_ENVIRONMENT;
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

  test('m4 (c-deploiement, anglais, sans traduction) bascule au français — AUCUN fetch de plus', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    let fetchStarts = 0;
    const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
      if (
        event.type === 'updated' &&
        event.action.type === 'fetch' &&
        JSON.stringify(event.query.queryKey) === JSON.stringify(messagesQueryKey('c-deploiement'))
      ) {
        fetchStarts += 1;
      }
    });

    let captured!: ReturnType<typeof useThreadData>;
    function Probe() {
      captured = useThreadData('c-deploiement');
      return <span data-status={captured.status} />;
    }

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <Probe />
        </QueryClientProvider>,
      );
    });
    // Laisse la résolution des fixtures ET la notification `notifyManager`
    // (MACROTÂCHE, `setTimeout(…, 0)`, plusieurs sauts : chargement → succès
    // de CHAQUE requête) se rejouer jusqu'au bout — un seul tour n'y suffit
    // pas.
    for (let i = 0; i < 10 && captured.status === 'pending'; i += 1) {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
    }

    expect(captured.status).toBe('success');
    const before = captured.messages.find((m) => m.id === 'm4');
    expect(before?.translations ?? []).toHaveLength(0);
    expect(fetchStarts).toBe(1); // le chargement initial, UN SEUL.

    act(() => {
      applyMessageTranslation(queryClient, {
        messageId: 'm4',
        translations: [
          {
            id: 't-m4-fr',
            messageId: 'm4',
            sourceLanguage: 'en',
            targetLanguage: 'fr',
            translatedContent: 'Bien. Mais le démarrage à froid dépasse toujours deux secondes en 3G.',
            translationModel: 'medium',
            cacheKey: 'm4_en_fr',
            cached: false,
          },
        ],
      });
    });
    // `notifyManager` de TanStack Query BATCHE la notification des
    // observateurs via `setTimeout(…, 0)` (une MACROTÂCHE, pas une
    // microtâche, `notifyManager.js` § `defaultScheduler`) — un `await` sans
    // minuteur ne le laisse jamais se rejouer.
    for (
      let i = 0;
      i < 10 && captured.messages.find((m) => m.id === 'm4')?.translations.length === 0;
      i += 1
    ) {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
    }

    const after = captured.messages.find((m) => m.id === 'm4');
    expect(after?.translations.find((t) => t.targetLanguage === 'fr')?.translatedContent).toBe(
      'Bien. Mais le démarrage à froid dépasse toujours deux secondes en 3G.',
    );
    expect(fetchStarts).toBe(1); // INCHANGÉ : la traduction n'a déclenché AUCUN refetch.

    unsubscribe();
  });
});

/**
 * `refreshListAction` (#6195) — le tirer-pour-rafraîchir : conversations
 * (page 1) ET stories/humeurs partent EN PARALLÈLE, sur les instances
 * PARTAGÉES (`appQueryClient`, `apiDeps` — même motif que `rowAction`).
 */
describe('refreshListAction — #6195', () => {
  test('la requête de conversations et l’invalidation des stories partent EN PARALLÈLE — l’invalidation précède la résolution', async () => {
    // Sème un cache CONNU pour observer qu'il ne passe jamais par `undefined`.
    await appQueryClient.fetchInfiniteQuery({
      queryKey: CONVERSATIONS_QUERY_KEY,
      queryFn: () => ({
        conversations: [],
        pagination: { limit: 30, offset: 0, total: 0, hasMore: false },
        cursorPagination: { limit: 30, hasMore: false, nextCursor: null },
      }),
      initialPageParam: undefined,
      getNextPageParam: () => undefined,
    });

    const invalidateSpy = appQueryClient.invalidateQueries.bind(appQueryClient);
    const invalidatedKeys: unknown[] = [];
    /**
     * L'ORDRE, PAS SEULEMENT LES APPELS (revue-correction #6195). Compter les
     * invalidations laisse une implémentation SÉQUENTIELLE
     * (`await refreshConversations(…)` PUIS `invalidateQueries(…)`) passer
     * verte : les deux appels ont bien lieu, seulement l'un après l'autre. Ce
     * qui les distingue est le RANG de l'invalidation par rapport à la
     * RÉSOLUTION des conversations — en parallèle elle la précède, en
     * séquentiel elle la suit.
     */
    const trace: string[] = [];
    appQueryClient.invalidateQueries = (((filters: { readonly queryKey?: readonly unknown[] }) => {
      invalidatedKeys.push(filters.queryKey);
      trace.push('stories-invalidated');
      return invalidateSpy(filters as never);
    }) as unknown) as typeof appQueryClient.invalidateQueries;

    let observedUndefined = false;
    const unsubscribe = appQueryClient.getQueryCache().subscribe((event) => {
      if (JSON.stringify(event.query.queryKey) === JSON.stringify(CONVERSATIONS_QUERY_KEY)) {
        if (event.query.state.data === undefined) observedUndefined = true;
        if (event.query.state.fetchStatus === 'idle' && event.query.state.status === 'success' && !trace.includes('conversations-settled')) {
          trace.push('conversations-settled');
        }
      }
    });

    await refreshListAction();

    unsubscribe();
    appQueryClient.invalidateQueries = invalidateSpy;

    expect(invalidatedKeys).toEqual([['stories']]);
    expect(trace).toEqual(['stories-invalidated', 'conversations-settled']);
    expect(observedUndefined).toBe(false);
    // `STORY_TRAY_QUERY_KEY`/`STATUS_MOODS_QUERY_KEY` sont des PROJECTIONS du
    // même préfixe : une seule invalidation les couvre toutes les deux.
    expect(STORY_TRAY_QUERY_KEY.slice(0, 1)).toEqual(['stories']);
    expect(STATUS_MOODS_QUERY_KEY.slice(0, 1)).toEqual(['stories']);
  });
});
