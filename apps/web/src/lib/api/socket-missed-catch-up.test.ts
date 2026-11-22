import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events/event-names';

import { conversationStore } from '@/lib/conversation-store';
import type { SocketClient, SocketFactory, SocketHandler } from '@/lib/net/socket';
import { createOutboxStore } from '@/lib/send/outbox-store';
import { localMessage, threadPages } from '@/test-support/thread-cache';

import { CONVERSATIONS_QUERY_KEY, CONVERSATION_CATEGORIES_QUERY_KEY, conversationQueryKey } from './conversations';
import { FEED_QUERY_KEY } from './feed';
import { FEED_NEW_COUNT_KEY } from './feed-new-count';
import { STATUS_MOODS_QUERY_KEY, STORY_TRAY_QUERY_KEY } from './stories';
import type { ConversationsPage } from './conversations-pages';
import { FRIENDS_QUERY_PREFIX } from './friends-keys';
import { APP_PREFERENCES_QUERY_KEY, CALL_HISTORY_QUERY_PREFIX, MY_PREFERENCES_QUERY_KEYS, MY_PROFILE_QUERY_KEY } from './me-keys';
import { messagesQueryKey } from './messages';
import { NOTIFICATION_COUNTS_QUERY_KEY, NOTIFICATION_LISTS_KEY } from './notifications';
import { UNKNOWN_ROW_COALESCE_MS } from './realtime-thread-catch-up';
import { createRealtimeConnection, type RealtimeDeps } from './socket';
import { STARRED_MESSAGES_QUERY_ROOT } from './starred-messages-cache';
import { createTypingStore } from './typing-store';
import type { Conversation } from './types';

/**
 * #10573 — « le web rattrape ce qu'il a manqué ». Deux trous du temps réel,
 * témoignés par le BRANCHEMENT (`createRealtimeConnection`) sur un vrai
 * `QueryClient` : une conversation que la liste en cache ne porte pas, et la
 * PREMIÈRE authentification du socket, qui arrive après la première peinture.
 */

function fakeSocket(): SocketClient & { fire(event: string, payload: unknown): void } {
  const handlers = new Map<string, Set<SocketHandler>>();
  let connected = false;
  return {
    get connected() {
      return connected;
    },
    connect: () => {
      connected = true;
    },
    disconnect: () => {
      connected = false;
    },
    on: (event, handler) => {
      const set = handlers.get(event) ?? new Set();
      set.add(handler as SocketHandler);
      handlers.set(event, set);
    },
    off: (event, handler) => {
      handlers.get(event)?.delete(handler as SocketHandler);
    },
    emit: () => undefined,
    fire: (event, payload) => {
      for (const handler of handlers.get(event) ?? []) handler(payload);
    },
  };
}

/** L'ordonnanceur capture `(fn, ms)` sans rien planifier : le témoin fait
 * passer le temps lui-même. */
function fakeScheduler() {
  const scheduled: { readonly fn: () => void; readonly ms: number; cleared: boolean }[] = [];
  return {
    scheduleTimeout: (fn: () => void, ms: number) => {
      const entry = { fn, ms, cleared: false };
      scheduled.push(entry);
      return entry;
    },
    clearTimeoutFn: (handle: unknown) => {
      (handle as { cleared: boolean }).cleared = true;
    },
    pendingListRefetches: () => scheduled.filter((entry) => entry.ms === UNKNOWN_ROW_COALESCE_MS && !entry.cleared),
    elapse: () => {
      for (const entry of scheduled.splice(0)) if (!entry.cleared) entry.fn();
    },
  };
}

function connect() {
  const socket = fakeSocket();
  const socketFactory: SocketFactory = () => socket;
  const queryClient = new QueryClient();
  const scheduler = fakeScheduler();
  const deps: RealtimeDeps = {
    base: 'https://gate.staging.meeshy.me',
    socketFactory,
    queryClient,
    typing: createTypingStore(),
    conversationStore,
    outbox: createOutboxStore(),
    viewerId: () => 'u-viewer',
    onClearSession: () => undefined,
    scheduleTimeout: scheduler.scheduleTimeout,
    clearTimeoutFn: scheduler.clearTimeoutFn,
  };
  const connection = createRealtimeConnection({ token: 't', sessionToken: 's' }, deps);
  return { socket, queryClient, scheduler, destroy: connection.destroy };
}

const row = (id: string): Conversation =>
  ({
    id,
    type: 'direct',
    status: 'active',
    visibility: 'private',
    isActive: true,
    memberCount: 2,
    participants: [],
    createdAt: new Date('2026-10-01T00:00:00.000Z'),
    updatedAt: new Date('2026-10-01T00:00:00.000Z'),
    unreadCount: 0,
  }) as Conversation;

const listOf = (ids: readonly string[]): { readonly pages: readonly ConversationsPage[]; readonly pageParams: readonly unknown[] } => ({
  pages: [
    {
      conversations: ids.map(row),
      pagination: { limit: 30, offset: 0, total: ids.length, hasMore: false },
      cursorPagination: { limit: 30, hasMore: false, nextCursor: null },
    },
  ],
  pageParams: [undefined],
});

const messageNew = (conversationId: string, id: string) => ({
  id,
  conversationId,
  senderId: 'u-other',
  content: 'salut',
  originalLanguage: 'fr',
  messageType: 'text',
  createdAt: '2026-10-13T08:00:00.000Z',
});

const conversationUpdated = (conversationId: string) => ({
  conversationId,
  updatedBy: { id: 'u-other' },
  updatedAt: '2026-10-13T08:00:00.000Z',
  lastMessageAt: '2026-10-13T08:00:00.000Z',
  lastMessageId: 'm-9',
  lastMessagePreview: 'salut',
});

const isInvalidated = (queryClient: QueryClient, queryKey: readonly unknown[]): boolean =>
  queryClient.getQueryState(queryKey)?.isInvalidated === true;

const EVENTS_NAMING_A_CONVERSATION = [
  [SERVER_EVENTS.MESSAGE_NEW, (id: string) => messageNew(id, 'm-1')],
  [SERVER_EVENTS.CONVERSATION_UPDATED, conversationUpdated],
  [SERVER_EVENTS.CONVERSATION_UNREAD_UPDATED, (id: string) => ({ conversationId: id, unreadCount: 3 })],
] as const;

describe('#10573 — une conversation absente de la liste en cache fait relire la liste', () => {
  for (const [event, payloadFor] of EVENTS_NAMING_A_CONVERSATION) {
    test(`\`${event}\` sur une conversation hors page relit la LISTE, et elle seule`, () => {
      const { socket, queryClient, scheduler } = connect();
      queryClient.setQueryData(CONVERSATIONS_QUERY_KEY, listOf(['c-a']));
      queryClient.setQueryData(conversationQueryKey('c-a'), row('c-a'));
      queryClient.setQueryData(messagesQueryKey('c-a'), threadPages([localMessage({ id: 'm-0' })]));

      socket.fire(event, payloadFor('c-hors-page'));
      expect(isInvalidated(queryClient, CONVERSATIONS_QUERY_KEY)).toBe(false);
      scheduler.elapse();

      expect(isInvalidated(queryClient, CONVERSATIONS_QUERY_KEY)).toBe(true);
      expect(isInvalidated(queryClient, conversationQueryKey('c-a'))).toBe(false);
      expect(isInvalidated(queryClient, messagesQueryKey('c-a'))).toBe(false);
    });
  }

  test('une rafale sur des conversations inconnues ne relit la liste qu’UNE fois', () => {
    const { socket, queryClient, scheduler } = connect();
    queryClient.setQueryData(CONVERSATIONS_QUERY_KEY, listOf(['c-a']));

    socket.fire(SERVER_EVENTS.MESSAGE_NEW, messageNew('c-x', 'm-1'));
    socket.fire(SERVER_EVENTS.MESSAGE_NEW, messageNew('c-x', 'm-2'));
    socket.fire(SERVER_EVENTS.CONVERSATION_UPDATED, conversationUpdated('c-y'));
    socket.fire(SERVER_EVENTS.CONVERSATION_UNREAD_UPDATED, { conversationId: 'c-z', unreadCount: 1 });

    expect(scheduler.pendingListRefetches()).toHaveLength(1);
  });

  test('la rafale suivante relit de nouveau', () => {
    const { socket, queryClient, scheduler } = connect();
    queryClient.setQueryData(CONVERSATIONS_QUERY_KEY, listOf(['c-a']));
    socket.fire(SERVER_EVENTS.MESSAGE_NEW, messageNew('c-x', 'm-1'));
    scheduler.elapse();

    socket.fire(SERVER_EVENTS.MESSAGE_NEW, messageNew('c-x', 'm-2'));

    expect(scheduler.pendingListRefetches()).toHaveLength(1);
  });

  test('une conversation que la liste porte déjà ne relit rien', () => {
    const { socket, queryClient, scheduler } = connect();
    queryClient.setQueryData(CONVERSATIONS_QUERY_KEY, listOf(['c-a']));

    socket.fire(SERVER_EVENTS.MESSAGE_NEW, messageNew('c-a', 'm-1'));
    socket.fire(SERVER_EVENTS.CONVERSATION_UPDATED, conversationUpdated('c-a'));
    socket.fire(SERVER_EVENTS.CONVERSATION_UNREAD_UPDATED, { conversationId: 'c-a', unreadCount: 1 });

    expect(scheduler.pendingListRefetches()).toHaveLength(0);
  });

  test('une liste jamais chargée n’est pas demandée : la prochaine ouverture la charge', () => {
    const { socket, queryClient, scheduler } = connect();

    socket.fire(SERVER_EVENTS.MESSAGE_NEW, messageNew('c-x', 'm-1'));

    expect(scheduler.pendingListRefetches()).toHaveLength(0);
    expect(queryClient.getQueryState(CONVERSATIONS_QUERY_KEY)).toBeUndefined();
  });

  test('`destroy` annule la relecture en attente', () => {
    const { socket, queryClient, scheduler, destroy } = connect();
    queryClient.setQueryData(CONVERSATIONS_QUERY_KEY, listOf(['c-a']));
    socket.fire(SERVER_EVENTS.MESSAGE_NEW, messageNew('c-x', 'm-1'));

    destroy();
    scheduler.elapse();

    expect(isInvalidated(queryClient, CONVERSATIONS_QUERY_KEY)).toBe(false);
  });
});

type Server = { calls: number; respond: () => Promise<unknown> };

const counted = (server: Server) => () => {
  server.calls += 1;
  return server.respond();
};

/** L'écran OUVERT : un observateur abonné, donc une requête ACTIVE. */
function observe(queryClient: QueryClient, queryKey: readonly unknown[], server: Server, staleTime: number): () => void {
  const observer = new QueryObserver(queryClient, { queryKey, queryFn: counted(server), staleTime });
  return observer.subscribe(() => undefined);
}

const settle = async (queryClient: QueryClient): Promise<void> => {
  for (let i = 0; i < 20 && queryClient.isFetching() > 0; i += 1) await new Promise((r) => setTimeout(r, 0));
};

const never = (): Promise<unknown> => new Promise(() => undefined);

describe('#10573 — la PREMIÈRE authentification rattrape ce que la liste et le fil servis ont manqué', () => {
  test('la liste et le fil déjà servis et ouverts sont relus', async () => {
    const { socket, queryClient } = connect();
    const list: Server = { calls: 0, respond: () => Promise.resolve(listOf(['c-a'])) };
    const thread: Server = { calls: 0, respond: () => Promise.resolve(threadPages([])) };
    const stopList = observe(queryClient, CONVERSATIONS_QUERY_KEY, list, Number.POSITIVE_INFINITY);
    const stopThread = observe(queryClient, messagesQueryKey('c-a'), thread, Number.POSITIVE_INFINITY);
    await settle(queryClient);
    expect([list.calls, thread.calls]).toEqual([1, 1]);

    socket.fire(SERVER_EVENTS.AUTHENTICATED, { success: true });
    await settle(queryClient);

    expect([list.calls, thread.calls]).toEqual([2, 2]);
    stopList();
    stopThread();
  });

  test('une requête jamais servie, encore en vol au démarrage, n’est pas redemandée', async () => {
    const { socket, queryClient } = connect();
    const list: Server = { calls: 0, respond: never };
    const stop = observe(queryClient, CONVERSATIONS_QUERY_KEY, list, Number.POSITIVE_INFINITY);
    expect(list.calls).toBe(1);

    socket.fire(SERVER_EVENTS.AUTHENTICATED, { success: true });

    expect(list.calls).toBe(1);
    expect(isInvalidated(queryClient, CONVERSATIONS_QUERY_KEY)).toBe(false);
    stop();
  });

  test('une liste restaurée dont la relecture est déjà en vol n’est pas doublée', async () => {
    const { socket, queryClient } = connect();
    queryClient.setQueryData(CONVERSATIONS_QUERY_KEY, listOf(['c-a']));
    const list: Server = { calls: 0, respond: never };
    const stop = observe(queryClient, CONVERSATIONS_QUERY_KEY, list, 0);
    expect(list.calls).toBe(1);

    socket.fire(SERVER_EVENTS.AUTHENTICATED, { success: true });

    expect(list.calls).toBe(1);
    stop();
  });

  /**
   * La cloche figurait ICI jusqu'à #18573, dans la même phrase que les deux
   * assertions ci-dessous — qui sont JUSTES : ni la case d'une conversation, ni
   * une fenêtre ancrée ne sont nourries par `message:new`. La cloche, elle, est
   * une famille PERSONNELLE que la fenêtre de première connexion prend en
   * entier, exactement comme une coupure : l'assertion gelait une lacune sous
   * les apparences d'une décision. Ce qu'elle doit faire est témoigné par le
   * bloc #18573 plus bas.
   */
  test('la case d’une conversation et une fenêtre ancrée ne sont pas touchées', () => {
    const { socket, queryClient } = connect();
    const anchored = [...messagesQueryKey('c-a'), 'around', 'm-0'] as const;
    queryClient.setQueryData(conversationQueryKey('c-a'), row('c-a'));
    queryClient.setQueryData(anchored, threadPages([]));

    socket.fire(SERVER_EVENTS.AUTHENTICATED, { success: true });

    expect(isInvalidated(queryClient, conversationQueryKey('c-a'))).toBe(false);
    expect(isInvalidated(queryClient, anchored)).toBe(false);
  });
});

/**
 * **LE REJEU DE RECONNEXION COUVRE AUSSI LES SURFACES SOCIALES** (#18641) — même
 * sujet que ce fichier, un cran plus loin : il garde déjà ce que la PREMIÈRE
 * authentification rattrape ; ceci garde ce que les SUIVANTES rattrapent.
 *
 * La connexion écoute 74 événements serveur ; le rejeu en périmait QUATRE
 * familles, chacune ajoutée par le lot qui en avait besoin (#6288, #6321,
 * #7378). Les dix `post:*`, les six `story:*` et les quatre `category:*`
 * n'y étaient pas, alors que leurs gestionnaires écrivent `FEED_QUERY_KEY`,
 * `STORY_TRAY_QUERY_KEY` et `CONVERSATION_CATEGORIES_QUERY_KEY`.
 *
 * RIEN NE LES RATTRAPAIT AILLEURS : `refetchOnReconnect` suit
 * `navigator.onLine`, qui ne bascule pas quand SEUL le socket tombe
 * (redémarrage de la passerelle) ; `staleTime` périme sans rejouer, et une
 * requête MONTÉE n'a alors aucun déclencheur. Ces trois surfaces sont
 * exactement celles qu'on peut REGARDER pendant la coupure — les autres
 * caisses de cartes se rejoignent par une navigation, donc par un montage,
 * donc par une relecture.
 *
 * Parité iOS, qui avait déjà tranché : `FeedViewModel+Socket` (rts-01),
 * `StoryViewModel` (rts-02) et `categoryStore.hydrate()`
 * (`test_didReconnect_rehydratesCategoryStore`).
 *
 * **CE `describe` A GELÉ LA LACUNE QUE SON FICHIER DÉNONCE** (#20336, cycle
 * 217). Son témoin disait « jamais à la première authentification », et ce
 * `jamais` n'avait AUCUNE raison écrite : le doc-comment ci-dessus instruit
 * pourquoi ces familles doivent le rejeu de COUPURE, jamais pourquoi elles ne
 * devraient pas celui du DÉMARRAGE. C'est mot pour mot ce que le bloc #10573
 * reproche à l'assertion de la cloche d'avant #18573, soixante lignes plus
 * haut — « l'assertion gelait une lacune sous les apparences d'une décision ».
 * La fenêtre est la MÊME (#10573 : « le socket se branche APRÈS la première
 * peinture »), donc la liste aussi ; seul le PRÉDICAT les sépare.
 */
describe('#18641 / #20336 — les DEUX authentifications rattrapent le fil, le rail, les humeurs et les catégories', () => {
  const PUBLICATION_FAMILIES = [
    ['le fil social', FEED_QUERY_KEY],
    ['le rail des stories', STORY_TRAY_QUERY_KEY],
    ['les humeurs (#18914)', STATUS_MOODS_QUERY_KEY],
    ['les catégories de conversation', CONVERSATION_CATEGORIES_QUERY_KEY],
  ] as const;

  for (const [nom, queryKey] of PUBLICATION_FAMILIES) {
    test(`${nom} : déjà servie et au repos ⇒ relue dès la PREMIÈRE authentification`, () => {
      const { socket, queryClient, destroy } = connect();
      queryClient.setQueryData(queryKey, { quoi: 'servi avant que le socket entre dans les rooms' });

      socket.fire(SERVER_EVENTS.AUTHENTICATED, { success: true });

      expect(isInvalidated(queryClient, queryKey)).toBe(true);
      destroy();
    });

    test(`${nom} : encore en vol au démarrage ⇒ pas doublée`, () => {
      const { socket, queryClient, destroy } = connect();
      const server: Server = { calls: 0, respond: never };
      const stop = observe(queryClient, queryKey, server, Number.POSITIVE_INFINITY);
      expect(server.calls).toBe(1);

      socket.fire(SERVER_EVENTS.AUTHENTICATED, { success: true });

      expect(server.calls).toBe(1);
      expect(isInvalidated(queryClient, queryKey)).toBe(false);
      stop();
      destroy();
    });

    test(`${nom} : jamais servie ⇒ rien n’est demandé`, () => {
      const { socket, queryClient, destroy } = connect();

      socket.fire(SERVER_EVENTS.AUTHENTICATED, { success: true });

      expect(queryClient.getQueryState(queryKey)).toBeUndefined();
      destroy();
    });

    test(`${nom} : se périme aussi à la RECONNEXION, sans prédicat`, () => {
      const { socket, queryClient, destroy } = connect();
      socket.fire(SERVER_EVENTS.AUTHENTICATED, { success: true });
      queryClient.setQueryData(queryKey, { quoi: 'servi avant la coupure' });

      socket.fire(SERVER_EVENTS.AUTHENTICATED, { success: true });

      expect(isInvalidated(queryClient, queryKey)).toBe(true);
      destroy();
    });
  }

  /**
   * LA SENTINELLE : `['feed', 'new-count']` est un ENTIER qui partage la racine
   * `['feed']` (`feed-new-count.ts`), et TanStack compare par PRÉFIXE. Le fil
   * s'invalide donc en `exact` — nommer la famille, jamais balayer la racine
   * (règle #6974, que `card-caches.ts` déclare déjà en `exact: true` pour ce
   * même voisinage).
   */
  test('le fil s’invalide en `exact` : le compte de nouveautés qui partage sa racine reste intact', () => {
    const { socket, queryClient, destroy } = connect();
    queryClient.setQueryData(FEED_QUERY_KEY, { pages: [], pageParams: [] });
    queryClient.setQueryData(FEED_NEW_COUNT_KEY, 0);

    socket.fire(SERVER_EVENTS.AUTHENTICATED, { success: true });
    socket.fire(SERVER_EVENTS.AUTHENTICATED, { success: true });

    expect(queryClient.getQueryState(FEED_QUERY_KEY)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(FEED_NEW_COUNT_KEY)?.isInvalidated).toBe(false);
    destroy();
  });
});

/**
 * #20349 — LES PROJECTIONS DU DOCUMENT DE RÉGLAGES RATTRAPENT LA FENÊTRE ELLES
 * AUSSI.
 *
 * Elles n'y étaient pas, et le doc-comment d'`app-preferences.ts` justifiait sa
 * fenêtre de trente minutes PAR l'événement : « `user:preferences-updated
 * { userId, category }` … périme cette requête … le réglage arrive à la
 * relecture qui suit, sans attendre la fenêtre ». Vrai d'un appareil CONNECTÉ
 * dont la bonne clé est périmée ; faux d'un appareil ABSENT, que l'événement
 * n'atteint jamais — et `refetchOnReconnect` ne relit qu'une requête STALE,
 * donc une clé à trente minutes persistée dans `localStorage` revient fraîche
 * et périmée à la fois.
 *
 * La forme JUMELLE avait déjà été tranchée : `['me','profile']`, même absence
 * d'événement atteignable, est entrée dans la liste par #18914.
 *
 * Les deux clés sont RÉPANDUES depuis `MY_PREFERENCES_QUERY_KEYS`, le même
 * ensemble que le gestionnaire itère : le témoin boucle sur la source, donc une
 * TROISIÈME projection ajoutée demain est gardée sans que personne l'écrive
 * ici.
 */
describe('#20349 — les deux authentifications rattrapent les réglages du compte', () => {
  for (const queryKey of MY_PREFERENCES_QUERY_KEYS) {
    test(`${queryKey.join('/')} : déjà servie et au repos ⇒ relue dès la PREMIÈRE authentification`, () => {
      const { socket, queryClient, destroy } = connect();
      queryClient.setQueryData(queryKey, { quoi: 'servi avant que le socket entre dans les rooms' });

      socket.fire(SERVER_EVENTS.AUTHENTICATED, { success: true });

      expect(isInvalidated(queryClient, queryKey)).toBe(true);
      destroy();
    });

    test(`${queryKey.join('/')} : se périme aussi à la RECONNEXION`, () => {
      const { socket, queryClient, destroy } = connect();
      socket.fire(SERVER_EVENTS.AUTHENTICATED, { success: true });
      queryClient.setQueryData(queryKey, { quoi: 'servi avant la coupure' });

      socket.fire(SERVER_EVENTS.AUTHENTICATED, { success: true });

      expect(isInvalidated(queryClient, queryKey)).toBe(true);
      destroy();
    });

    test(`${queryKey.join('/')} : jamais servie ⇒ rien n’est demandé`, () => {
      const { socket, queryClient, destroy } = connect();

      socket.fire(SERVER_EVENTS.AUTHENTICATED, { success: true });

      expect(queryClient.getQueryState(queryKey)).toBeUndefined();
      destroy();
    });
  }

  /**
   * LA SENTINELLE DE PORTÉE : les deux clés sont des FEUILLES sous `['me']`, qui
   * porte aussi le profil et le journal d'appels. Les prendre par préfixe
   * balaierait des familles que l'événement de réglage ne concerne pas.
   */
  test('la racine `[\'me\']` n’est pas balayée : le profil garde son état', () => {
    const { socket, queryClient, destroy } = connect();
    queryClient.setQueryData(APP_PREFERENCES_QUERY_KEY, { theme: 'auto' });
    queryClient.setQueryData(CALL_HISTORY_QUERY_PREFIX, { pages: [] });

    socket.fire(SERVER_EVENTS.AUTHENTICATED, { success: true });

    expect(isInvalidated(queryClient, APP_PREFERENCES_QUERY_KEY)).toBe(true);
    expect(isInvalidated(queryClient, CALL_HISTORY_QUERY_PREFIX)).toBe(false);
    destroy();
  });
});

/**
 * #18573 — LA FENÊTRE DE LA PREMIÈRE CONNEXION PREND LES MÊMES FAMILLES QU'UNE
 * COUPURE. La branche de reconnexion relit cinq familles, chacune avec sa
 * raison écrite (#6288, #6321, #6974, #7378) ; la première authentification
 * n'en relisait qu'une. La fenêtre est pourtant la même — #10573 la nomme :
 * « le socket se branche APRÈS la première peinture ; ce qui est parti entre la
 * lecture REST et l'entrée dans les rooms était perdu ».
 *
 * Et rien d'autre ne les rattrape à cet instant : l'unique lecteur des
 * compteurs ne relit que sur FOCUS de fenêtre, et un démarrage à froid n'en
 * produit aucun — la fenêtre est déjà au premier plan.
 *
 * Le prédicat, lui, ne change pas : seules les requêtes DÉJÀ SERVIES et au
 * repos repartent. Une requête en vol couvre déjà la fenêtre, et la doubler
 * coûterait une requête sur le chemin de la première peinture.
 */
describe('#18573 — la première authentification rattrape les familles PERSONNELLES, pas la seule liste', () => {
  const PERSONAL_FAMILIES = [
    ['la cloche — les listes', [...NOTIFICATION_LISTS_KEY, 'all'] as const],
    ['la cloche — les comptes', NOTIFICATION_COUNTS_QUERY_KEY],
    ['les demandes d’amitié', FRIENDS_QUERY_PREFIX],
    ['les messages favoris', STARRED_MESSAGES_QUERY_ROOT],
    ['le profil du lecteur — ses langues, son nom, sa photo (#18914)', MY_PROFILE_QUERY_KEY],
  ] as const;

  for (const [nom, queryKey] of PERSONAL_FAMILIES) {
    test(`${nom} : déjà servie et au repos ⇒ relue`, () => {
      const { socket, queryClient } = connect();
      queryClient.setQueryData(queryKey, { quoi: 'servi avant que le socket existe' });

      socket.fire(SERVER_EVENTS.AUTHENTICATED, { success: true });

      expect(isInvalidated(queryClient, queryKey)).toBe(true);
    });

    test(`${nom} : encore en vol au démarrage ⇒ pas doublée`, () => {
      const { socket, queryClient } = connect();
      const server: Server = { calls: 0, respond: never };
      const stop = observe(queryClient, queryKey, server, Number.POSITIVE_INFINITY);
      expect(server.calls).toBe(1);

      socket.fire(SERVER_EVENTS.AUTHENTICATED, { success: true });

      expect(server.calls).toBe(1);
      expect(isInvalidated(queryClient, queryKey)).toBe(false);
      stop();
    });

    test(`${nom} : jamais servie ⇒ rien n’est demandé`, () => {
      const { socket, queryClient } = connect();

      socket.fire(SERVER_EVENTS.AUTHENTICATED, { success: true });

      expect(queryClient.getQueryState(queryKey)).toBeUndefined();
    });
  }

  /**
   * #18914 (WEB-01) — la langue changée sur un autre appareil n'atteint aucun
   * socket de soi : la passerelle ne l'émet que vers les partenaires. La session
   * suit `GET /me` (`served-profile-session.ts`) ; c'est la relecture de chaque
   * (re)connexion qui la ramène, sans attendre la fenêtre de trente minutes.
   */
  test('le profil du lecteur se relit aussi à chaque RECONNEXION', () => {
    const { socket, queryClient } = connect();
    socket.fire(SERVER_EVENTS.AUTHENTICATED, { success: true });
    queryClient.setQueryData(MY_PROFILE_QUERY_KEY, { quoi: 'servi avant la coupure' });

    socket.fire(SERVER_EVENTS.AUTHENTICATED, { success: true });

    expect(isInvalidated(queryClient, MY_PROFILE_QUERY_KEY)).toBe(true);
  });
});

/**
 * **LE CLIQUET DE LA BRANCHE UNIQUE** (#20336, cycle 217) — ce que les témoins
 * de comportement ci-dessus ne peuvent pas voir.
 *
 * Un témoin de comportement atteste les familles QU'IL NOMME. La cinquième
 * famille, celle qu'un lot futur ajoutera, n'y est par construction nommée nulle
 * part : c'est exactement ainsi que #18641 et #18914 ont rouvert la lacune que
 * #18573 venait de fermer, avec une suite verte à chaque fois.
 *
 * Ce cliquet garde la FORME : dans `onAuthenticated`, il ne doit exister que
 * DEUX `invalidateQueries` — la racine des conversations, seule famille dont la
 * portée diffère légitimement entre les deux branches (#7420), et la boucle sur
 * `CATCH_UP_FAMILIES`. Un `invalidateQueries` de plus est, par construction, une
 * famille posée dans une seule branche.
 *
 * **Quand il tombe, la réparation est d'entrer la famille dans
 * `CATCH_UP_FAMILIES`** — avec sa portée et sa raison — jamais d'élargir ce
 * compte : il n'y a pas de rattrapage à une seule branche qui soit légitime.
 */
describe('#20336 — aucune famille ne peut entrer dans une seule des deux branches', () => {
  const source = readFileSync(new URL('./socket.ts', import.meta.url), 'utf8');

  /** Le corps d'`onAuthenticated`, du `=> {` jusqu'à son `};` de fermeture. */
  const onAuthenticatedBody = (): string => {
    const start = source.indexOf('const onAuthenticated = (): void => {');
    expect(start).toBeGreaterThan(-1);
    const end = source.indexOf('\n  };', start);
    expect(end).toBeGreaterThan(start);
    return source.slice(start, end);
  };

  test('le rattrapage de REconnexion n’invalide que les conversations et la liste déclarée', () => {
    const body = onAuthenticatedBody();

    expect(body.match(/invalidateQueries/g)?.length).toBe(2);
    expect(body).toContain('invalidateQueries({ queryKey: CONVERSATIONS_QUERY_KEY })');
    expect(body).toContain('for (const { queryKey, exact } of CATCH_UP_FAMILIES)');
  });

  test('la PREMIÈRE authentification reçoit la MÊME liste, et c’est la seule qu’elle reçoive', () => {
    const body = onAuthenticatedBody();

    expect(body).toContain('catchUpFirstAuthentication(deps.queryClient, CATCH_UP_FAMILIES)');
    expect(body.match(/catchUpFirstAuthentication\(/g)?.length).toBe(1);
  });

  /**
   * LA SENTINELLE DE PORTÉE : la portée voyage AVEC la clé, dans la liste. Si
   * elle redevenait une décision du site d'appel, les deux branches pourraient
   * de nouveau diverger sans qu'aucun témoin de famille tombe.
   */
  test('les deux portées `exact` sont déclarées dans la liste, jamais au site d’appel', () => {
    const declaration = source.slice(source.indexOf('const CATCH_UP_FAMILIES'), source.indexOf('];', source.indexOf('const CATCH_UP_FAMILIES')));

    expect(declaration).toContain('queryKey: FEED_QUERY_KEY, exact: true');
    expect(declaration).toContain('queryKey: STATUS_MOODS_QUERY_KEY, exact: true');
    expect(onAuthenticatedBody()).not.toContain('exact: true');
  });
});
