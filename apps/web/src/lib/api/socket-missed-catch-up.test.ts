import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';

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
import { TWO_FACTOR_QUERY_KEY } from './account-security';
import { attachmentStatusDetailsQueryKey } from './attachments';
import { conversationMembersQueryKey } from './conversation-members';
import { ENGAGEMENT_PROGRESS_QUERY_KEY } from './game-state-order';
import {
  PACKS_QUERY_ROOT,
  PACK_DETAIL_QUERY_ROOT,
  PACK_SHOP_QUERY_ROOT,
  STICKER_PACKS_QUERY_ROOT,
} from './pack-query-keys';
import { PUBLIC_PROFILE_QUERY_PREFIX } from './public-profile';
import { COMMUNITIES_QUERY_ROOT, STICKERS_QUERY_KEY } from './realtime-catch-up-keys';
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
function observe(
  queryClient: QueryClient,
  queryKey: readonly unknown[],
  server: Server,
  staleTime: number,
  /** `false` reproduit une requête INERTE (`enabled: false`) : observée, jamais
   * relue — la forme du solde de Meeshes (#20438). */
  enabled = true,
): () => void {
  const observer = new QueryObserver(queryClient, { queryKey, queryFn: counted(server), staleTime, enabled });
  return observer.subscribe(() => undefined);
}

const settle = async (queryClient: QueryClient): Promise<void> => {
  for (let i = 0; i < 20 && queryClient.isFetching() > 0; i += 1) await new Promise((r) => setTimeout(r, 0));
};

const never = (): Promise<unknown> => new Promise(() => undefined);

const WEB_SRC = new URL('../../', import.meta.url);

type ProductionSource = { readonly file: string; readonly text: string };

/** Tous les modules de PRODUCTION de `apps/web/src` — la portée des deux
 * balayages de ce fichier, pas celle d'un lot. */
const productionSources = (): readonly ProductionSource[] => {
  const walk = (dir: URL, prefix: string): readonly ProductionSource[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      if (entry.isDirectory()) return walk(new URL(`${entry.name}/`, dir), `${prefix}${entry.name}/`);
      if (!/\.tsx?$/.test(entry.name) || entry.name.includes('.test.')) return [];
      return [{ file: `${prefix}${entry.name}`, text: readFileSync(new URL(entry.name, dir), 'utf8') }];
    });
  return walk(WEB_SRC, '');
};

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
   * **CETTE PHRASE A TENU DEUX LACUNES, ET LA SECONDE A SURVÉCU AU LOT QUI
   * DÉNONÇAIT LA PREMIÈRE** (#20421, cycle 219). La cloche figurait ICI jusqu'à
   * #18573, dans la même phrase que la fiche, sous la même raison — « ni la case
   * d'une conversation, ni une fenêtre ancrée ne sont nourries par
   * `message:new` ». Le commentaire qui l'en a sortie disait que « l'assertion
   * gelait une lacune sous les apparences d'une décision », et il est resté posé
   * AU-DESSUS de la fiche, qui gelait la même.
   *
   * La raison était vraie et répondait à côté : `message:new` ne nourrit pas la
   * fiche, mais **huit écrivains temps réel** le font, tous branchés sur CETTE
   * connexion — le régime de chiffrement et les droits d'envoi en tête. La
   * fiche est désormais DANS la portée, et les deux témoins ci-dessous se
   * séparent : celui de la fenêtre ancrée garde sa raison, qui porte sur le
   * PASSÉ (#7420) et reste juste.
   */
  test('la FICHE d’une conversation est rattrapée — huit familles temps réel la nourrissent', () => {
    const { socket, queryClient } = connect();
    queryClient.setQueryData(conversationQueryKey('c-a'), row('c-a'));

    socket.fire(SERVER_EVENTS.AUTHENTICATED, { success: true });

    expect(isInvalidated(queryClient, conversationQueryKey('c-a'))).toBe(true);
  });

  /**
   * Le cas qui PAIE la fenêtre : la fiche vient du cache PERSISTÉ, donc servie
   * et au repos dès la première peinture. C'est là que `conversation:encryption-changed`
   * — qui invalide exactement cette clé en `exact` (`realtime-encryption-regime.ts`)
   * — a pu passer sans que rien ne la relise, laissant le composeur envoyer en
   * CLAIR dans une conversation chiffrée, que la passerelle refuse (fail-closed).
   */
  test('une fiche RESTAURÉE du disque repart — c’est la fenêtre qui emporte le régime E2EE', () => {
    const { socket, queryClient } = connect();
    queryClient.setQueryData(conversationQueryKey('c-chiffree'), row('c-chiffree'));
    expect(isInvalidated(queryClient, conversationQueryKey('c-chiffree'))).toBe(false);

    socket.fire(SERVER_EVENTS.AUTHENTICATED, { success: true });

    expect(isInvalidated(queryClient, conversationQueryKey('c-chiffree'))).toBe(true);
  });

  /**
   * Une fenêtre ancrée reste DEHORS, et sa raison n'a pas changé : elle porte le
   * PASSÉ (#7420), que la fenêtre de première connexion ne peut pas avoir
   * modifié.
   */
  test('une fenêtre ancrée n’est pas touchée — elle porte le PASSÉ (#7420)', () => {
    const { socket, queryClient } = connect();
    const anchored = [...messagesQueryKey('c-a'), 'around', 'm-0'] as const;
    queryClient.setQueryData(anchored, threadPages([]));

    socket.fire(SERVER_EVENTS.AUTHENTICATED, { success: true });

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
   * LA SENTINELLE DE PORTÉE — et elle était INERTE jusqu'à #20438.
   *
   * Sa raison disait « les deux clés sont des FEUILLES sous `['me']`, qui porte
   * aussi le profil et le journal d'appels ». **Le journal d'appels n'est pas
   * sous `['me']`** : `CALL_HISTORY_QUERY_PREFIX` vaut `['calls','history']`, il
   * est seulement DÉCLARÉ dans `me-keys.ts`. Le témoin assertait donc qu'une clé
   * d'une AUTRE racine n'était pas touchée — il ne pouvait pas tomber si
   * quelqu'un balayait `['me']` par préfixe, puisque l'autre clé qu'il observe
   * (`MY_PROFILE_QUERY_KEY`) est elle-même dans `CATCH_UP_FAMILIES` et DOIT être
   * périmée.
   *
   * Le témoin observe maintenant une FEUILLE réellement sous `['me']` qu'aucun
   * écrivain temps réel ne nourrit (`['me','two-factor']`, `account-security.ts`)
   * : elle tombe si et seulement si la racine est balayée. Sept familles vivent
   * désormais sous `['me']` avec leur propre portée — profil, réglages,
   * cercles, progression du Jeu, stickers, packs et packs de stickers.
   */
  test('la racine `[\'me\']` n’est pas balayée : une feuille sans écrivain garde son état', () => {
    const { socket, queryClient, destroy } = connect();
    queryClient.setQueryData(APP_PREFERENCES_QUERY_KEY, { theme: 'auto' });
    queryClient.setQueryData(TWO_FACTOR_QUERY_KEY, { enabled: false });

    socket.fire(SERVER_EVENTS.AUTHENTICATED, { success: true });

    expect(isInvalidated(queryClient, APP_PREFERENCES_QUERY_KEY)).toBe(true);
    expect(isInvalidated(queryClient, TWO_FACTOR_QUERY_KEY)).toBe(false);
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
 * **#20438 (cycle 221) — LES HUIT FAMILLES QUE LE SOCKET ÉCRIVAIT SANS QUE RIEN
 * NE LES RATTRAPE.**
 *
 * Ce qui a tenu la lacune n'est pas un oubli mais un raisonnement : « une
 * relecture sert la vérité, à son `staleTime` près »
 * (`services/gateway/src/socketio/unqueuedFamilyVerdict.ts`, #20353). Mesuré,
 * il ne tient pas pour une coupure de SOCKET : `refetchOnReconnect`
 * (`query-client.ts`) est branché sur l'`onlineManager` de TanStack, qui écoute
 * les transitions `online` / `offline` du NAVIGATEUR, et rien dans
 * `apps/web/src` ne le relie au socket. Une requête seulement PÉRIMÉE n'est de
 * plus jamais relue sans déclencheur. Le rattrapage d'`onAuthenticated` est
 * donc le SEUL rattrapage du web sur ce chemin.
 *
 * Chaque famille est témoignée sur les DEUX branches, parce que le lot qui les
 * fait diverger est toujours un lot qui parle d'autre chose (#20336).
 */
describe('#20438 — les familles écrites par un écouteur socket se rattrapent, sur les deux branches', () => {
  const MISSED_FAMILIES = [
    ['le trombinoscope de la conversation ouverte', conversationMembersQueryKey('c1')],
    ['la fiche d’une communauté', [...COMMUNITIES_QUERY_ROOT, 'detail', 'k1'] as const],
    ['les membres d’une communauté', [...COMMUNITIES_QUERY_ROOT, 'members', 'k1'] as const],
    ['la progression du Jeu', ENGAGEMENT_PROGRESS_QUERY_KEY],
    ['ma bibliothèque de stickers', STICKERS_QUERY_KEY],
    ['la vitrine des packs', [...PACK_SHOP_QUERY_ROOT, 'all'] as const],
    ['l’étagère des packs de stickers', [...STICKER_PACKS_QUERY_ROOT, 'installed'] as const],
    ['la fiche d’un pack', [...PACK_DETAIL_QUERY_ROOT, 'frame', 'slug'] as const],
    ['un profil public ouvert', [...PUBLIC_PROFILE_QUERY_PREFIX, 'alice'] as const],
    ['les détails d’état d’une pièce jointe', attachmentStatusDetailsQueryKey('a1')],
    ['le journal d’appels', [...CALL_HISTORY_QUERY_PREFIX, 'all'] as const],
  ] as const;

  for (const [nom, queryKey] of MISSED_FAMILIES) {
    test(`${nom} : servie et au repos ⇒ relue dès la PREMIÈRE authentification`, () => {
      const { socket, queryClient, destroy } = connect();
      queryClient.setQueryData(queryKey, { quoi: 'servi avant que le socket existe' });

      socket.fire(SERVER_EVENTS.AUTHENTICATED, { success: true });

      expect(isInvalidated(queryClient, queryKey)).toBe(true);
      destroy();
    });

    test(`${nom} : se périme aussi à la RECONNEXION`, () => {
      const { socket, queryClient, destroy } = connect();
      socket.fire(SERVER_EVENTS.AUTHENTICATED, { success: true });
      queryClient.setQueryData(queryKey, { quoi: 'servi avant la coupure' });

      socket.fire(SERVER_EVENTS.AUTHENTICATED, { success: true });

      expect(isInvalidated(queryClient, queryKey)).toBe(true);
      destroy();
    });

    test(`${nom} : jamais servie ⇒ rien n’est demandé`, () => {
      const { socket, queryClient, destroy } = connect();

      socket.fire(SERVER_EVENTS.AUTHENTICATED, { success: true });

      expect(queryClient.getQueryState(queryKey)).toBeUndefined();
      destroy();
    });
  }

  /**
   * LE COÛT RESTE BORNÉ AUX ÉCRANS OUVERTS — c'est ce qui rend l'élargissement
   * défendable. Une famille en vol au démarrage n'est pas doublée
   * (`servedAndAtRest`), et le relevé de ce témoin le prouve sur la plus large
   * des portées ajoutées.
   */
  test('une famille encore en vol au démarrage à froid n’est pas doublée', () => {
    const { socket, queryClient } = connect();
    const queryKey = conversationMembersQueryKey('c1');
    const server: Server = { calls: 0, respond: never };
    const stop = observe(queryClient, queryKey, server, Number.POSITIVE_INFINITY);
    expect(server.calls).toBe(1);

    socket.fire(SERVER_EVENTS.AUTHENTICATED, { success: true });

    expect(server.calls).toBe(1);
    expect(isInvalidated(queryClient, queryKey)).toBe(false);
    stop();
  });

  /**
   * LA SENTINELLE DU SOLDE DE MEESHES : `['me','packs','balance']` entre dans la
   * portée par préfixe, et c'est SANS EFFET — sa requête est inerte
   * (`enabled: false`, `staleTime: Infinity`), donc la périmer ne déclenche
   * aucun réseau. Le témoin fixe la mesure plutôt que la supposition : la clé
   * est bien marquée périmée, et aucune relecture ne part.
   */
  test('le solde des packs est périmé sans qu’aucune relecture ne part', () => {
    const { socket, queryClient, destroy } = connect();
    const queryKey = [...PACKS_QUERY_ROOT, 'balance'] as const;
    const server: Server = { calls: 0, respond: never };
    const stop = observe(queryClient, queryKey, server, Number.POSITIVE_INFINITY, false);

    socket.fire(SERVER_EVENTS.AUTHENTICATED, { success: true });

    expect(server.calls).toBe(0);
    stop();
    destroy();
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

/**
 * **LE CLIQUET DE LA SECONDE AFFIRMATION** (#20421, cycle 219).
 *
 * `isListOrLiveThread` admet désormais la FICHE par sa LONGUEUR
 * (`queryKey.length === 2`). Ce discriminant porte deux affirmations : « la
 * fiche a cette forme » (vérifiée par les témoins de comportement ci-dessus) et
 * « **aucune AUTRE famille n'a cette forme sous cette racine** » — la seconde,
 * celle que personne ne relit (leçon 261). Une sœur de longueur 2 ajoutée
 * demain par un lot qui parlera d'autre chose serait relue à chaque première
 * connexion, en silence, sans qu'un seul témoin tombe.
 *
 * Le balayage lit les clés de PRODUCTION rootées sur `['conversations']` et
 * exige que la seule de longueur 2 soit celle de la fiche. Il prouve d'abord
 * qu'il balaie bien quelque chose : une garde négative dont le relevé rend `[]`
 * reste verte (`presence-visibility-viewer-aware-guard` et la garde des
 * projections de réglages portent la même précaution).
 *
 * **Quand il tombe**, la réparation n'est pas une ligne d'inventaire : c'est de
 * décider si la famille neuve doit être rattrapée. Si oui, elle rejoint
 * `CATCH_UP_FAMILIES` avec sa portée et sa raison ; si non, le discriminant
 * cesse d'être une longueur et devient une forme nommée.
 */
describe('#20421 — la longueur 2 ne désigne que la FICHE sous la racine des conversations', () => {

  /** Les littéraux `['conversations', …]` du module, commentaires dépouillés. */
  const rootedKeys = (text: string): readonly string[] =>
    [...text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').matchAll(/\[\s*'conversations'\s*(,[^\]]*)?\]/g)].map((match) => match[0]);

  /** Les segments d'un littéral de clé, le premier (`'conversations'`) retiré. */
  const tailSegments = (literal: string): readonly string[] =>
    literal
      .slice(1, -1)
      .split(',')
      .map((part) => part.trim())
      .filter((part) => part !== '')
      .slice(1);

  /**
   * **Le discriminant est la NATURE du second segment, pas son nom.**
   *
   * Une FICHE est adressée par une VARIABLE — `['conversations', id]`,
   * `['conversations', conversationId]` : deux sites du dépôt l'écrivent, et le
   * second (`lib/send/served-regime.ts`) le fait par décision ÉCRITE, pour ne
   * pas tirer les décodeurs des conversations dans son morceau. Les nommer un à
   * un ferait rougir le cliquet au premier site qui choisit un autre nom de
   * variable — une garde qui rougit sur son cas nominal n'apprend plus rien.
   *
   * Une SŒUR, elle, est nommée par une CHAÎNE LITTÉRALE (`['conversations',
   * 'categories']`) : c'est une famille, pas une ligne. C'est elle que la
   * longueur 2 avalerait en silence.
   */
  const isSisterFamily = (literal: string): boolean => {
    const tail = tailSegments(literal);
    return tail.length === 1 && /^['"`]/.test(tail[0] ?? '');
  };

  test('le balayage trouve bien des clés — un relevé vide ne rougit jamais tout seul', () => {
    const found = productionSources().flatMap(({ text }) => rootedKeys(text));

    expect(found.length).toBeGreaterThanOrEqual(5);
    expect(found.filter((literal) => tailSegments(literal).length === 1).length).toBeGreaterThanOrEqual(1);
  });

  test('aucun module de production ne pose une SŒUR de longueur 2 sous cette racine', () => {
    const sisters = productionSources().flatMap(({ file, text }) =>
      rootedKeys(text)
        .filter(isSisterFamily)
        .map((literal) => `${file} → ${literal}`),
    );

    expect(sisters).toEqual([]);
  });

  test('la fiche est bien produite à cette forme, et son producteur est nommé', () => {
    const conversations = readFileSync(new URL('./conversations.ts', import.meta.url), 'utf8');

    expect(conversations).toContain("export const conversationQueryKey = (id: string) => ['conversations', id] as const;");
    expect(conversationQueryKey('c-x')).toEqual(['conversations', 'c-x']);
  });
});

/**
 * **LE CLIQUET QUI DÉRIVE L'OBLIGATION** (#20438, cycle 221).
 *
 * Les témoins ci-dessus attestent les familles QU'ILS NOMMENT. La famille
 * suivante — celle qu'un lot futur branchera sur le socket — n'y est par
 * construction nommée nulle part, et c'est ainsi que treize familles ont fini
 * par en couvrir vingt-sept : trois lots de suite (#18641, #18914, #20354) ont
 * branché un écouteur sans se demander ce qu'une coupure lui coûte.
 * « Corriger une énumération ne lui donne aucun moyen de rester vraie »
 * (#18602).
 *
 * Le balayage relève donc l'obligation au lieu de l'énumérer :
 *
 * 1. il trouve les modules de PRODUCTION branchés sur un espace d'événements
 *    serveur (`SERVER_EVENTS.` ou `<DOMAINE>_SERVER_EVENTS.`) ;
 * 2. il y relève chaque ÉCRITURE du cache de requêtes — jamais une lecture :
 *    `getQueryData` / `getQueriesData` ne créent aucune famille ;
 * 3. il résout la clé de chaque écriture en un PRÉFIXE littéral (alias, spread,
 *    constante de chaîne et `X[0]` compris ; un segment dynamique arrête la
 *    résolution et marque la clé comme portant un identifiant) ;
 * 4. et il PROUVE par le BRANCHEMENT, famille par famille, qu'une sonde posée à
 *    ce préfixe est périmée par `onAuthenticated`.
 *
 * **Ce qu'il prouve, exactement** : que le PRÉFIXE résolu est couvert. Une
 * famille à segment dynamique est sondée avec un segment de plus, ce qui la
 * fait rougir si sa portée déclarée est `exact` — c'est le bon sens d'erreur :
 * le cliquet se plaint, l'auteur regarde.
 *
 * **Et il PUBLIE ce qu'il ne sait pas résoudre** : « zéro trouvé » et « zéro
 * existe » ne sont pas la même affirmation (leçon 261). Une clé venue d'une
 * lecture du cache ou d'un accès à un membre d'objet n'a pas de littéral à
 * lire ; elle est inventoriée AVEC sa raison, et la liste est gelée.
 *
 * **Quand il tombe**, la réparation n'est pas une ligne d'inventaire : c'est de
 * décider si la famille neuve doit être rattrapée. Si oui, elle rejoint
 * `CATCH_UP_FAMILIES` avec sa portée et sa raison ; si non, elle rejoint
 * {@link CATCH_UP_EXEMPT} — où une raison VÉRIFIABLE est exigée, pas une
 * mention.
 */
describe('#20438 — toute famille écrite par un écouteur socket est rattrapée, ou exemptée avec sa raison', () => {
  /**
   * LES FAMILLES EXEMPTÉES, chacune avec la raison qui la sort — et les six
   * premières la partagent : **elles portent CHACUNE leur propre rattrapage**,
   * écrit sur place (« à chaque socket accrochée, `GET /relations/…`
   * rattrape »). Ce n'est pas une dette : c'est un mécanisme plus fin que
   * celui-ci, qui départage par l'horloge du DÉPART de la demande.
   */
  const CATCH_UP_EXEMPT: ReadonlyMap<string, string> = new Map([
    ['relations/battery', 'battery-live.ts — `GET /relations/battery` à chaque socket accrochée'],
    ['relations/phone-calls', 'phone-call-live.ts — `GET /relations/phone-calls` à chaque socket accrochée'],
    ['relations/phone-reachability', 'phone-reachability-live.ts — `GET /relations/phone-reachability` à chaque socket accrochée'],
    ['hors-disque/relations/falls', 'fall-live.ts — `GET /relations/falls` à chaque socket accrochée ; clé HORS DISQUE (#16984), reconstituée à chaque session'],
    ['hors-disque/relations/inactivity', 'inactivity-live.ts — `GET /relations/inactivity` à chaque socket accrochée ; clé HORS DISQUE (#16984)'],
    ['admin/ops/metrics', 'use-host-metrics.ts — SONDÉE (`refetchInterval`), jamais servie par un cache qu’une coupure périme'],
  ]);

  /**
   * LES ÉCRITURES QUE LE BALAYAGE NE SAIT PAS RÉSOUDRE, avec leur raison. Une
   * clé sans littéral n'a pas de préfixe à sonder — le cliquet le DIT plutôt que
   * de conclure.
   */
  const UNRESOLVED_WRITES: ReadonlyMap<string, string> = new Map([
    ['lib/api/community-live.ts queryKey', 'la clé vient d’une LECTURE du cache (`getQueriesData(…).forEach`) : elle ne nomme aucune famille neuve — celle qu’elle touche est nommée par la lecture, résolue par ailleurs sous `communities`'],
    ['lib/api/community-member-live.ts queryKey', 'la clé vient d’une LECTURE du cache (`getQueriesData(LIST_KEY)`) : la famille qu’elle touche est celle de la lecture, résolue par ailleurs sous `communities/list`'],
    ['lib/packs/installation-sync.ts keys.catalogue', 'membre de l’objet rendu par `packQueryKeys(domain)` : ses quatre racines sont déclarées et sondées (`PACK_CATCH_UP_ROOTS`)'],
    ['lib/packs/installation-sync.ts keys.installed', 'membre du même objet : l’étagère du domaine vit sous `PACKS_QUERY_ROOT` ou `STICKER_PACKS_QUERY_ROOT`, tous deux déclarés et sondés'],
    ['lib/packs/installation-sync.ts keys.detail(slug)', 'membre du même objet : la fiche vit sous `PACK_DETAIL_QUERY_ROOT` ou `STICKER_PACK_DETAIL_QUERY_ROOT`, tous deux déclarés et sondés'],
  ]);

  const AMBIGUOUS = 'ambiguë';
  type Declarations = {
    readonly arrays: Map<string, { readonly parts: readonly string[]; readonly factory: boolean } | typeof AMBIGUOUS>;
    readonly strings: Map<string, string | typeof AMBIGUOUS>;
    readonly aliases: Map<string, string | typeof AMBIGUOUS>;
  };

  const stripComments = (text: string): string => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');

  const declarationsOf = (texts: readonly string[]): Declarations => {
    const decls: Declarations = { arrays: new Map(), strings: new Map(), aliases: new Map() };
    const put = <T,>(map: Map<string, T | typeof AMBIGUOUS>, name: string, value: T): void => {
      const prev = map.get(name);
      if (prev === undefined) map.set(name, value);
      else if (prev !== AMBIGUOUS && JSON.stringify(prev) !== JSON.stringify(value)) map.set(name, AMBIGUOUS);
    };
    for (const text of texts) {
      for (const found of text.matchAll(/(?:export\s+)?const\s+([A-Za-z_$][\w$]*)(?:\s*:\s*[^=]+?)?\s*=\s*(\([^)]*\)\s*=>\s*)?\[([^\]]*)\]/g)) {
        const [, name, arrow, body] = found;
        if (name === undefined || body === undefined) continue;
        put(decls.arrays, name, { parts: body.split(',').map((part) => part.trim()).filter((part) => part !== ''), factory: arrow !== undefined });
      }
      for (const found of text.matchAll(/(?:export\s+)?const\s+([A-Za-z_$][\w$]*)(?:\s*:\s*[^=]+?)?\s*=\s*'([^']*)'\s*as\s+const/g)) {
        const [, name, value] = found;
        if (name === undefined || value === undefined) continue;
        put(decls.strings, name, value);
      }
      for (const found of text.matchAll(/(?:export\s+)?const\s+([A-Za-z_$][\w$]*)(?:\s*:\s*[^=]+?)?\s*=\s*([A-Za-z_$][\w$]*)\s*;/g)) {
        const [, name, target] = found;
        if (name === undefined || target === undefined) continue;
        put(decls.aliases, name, target);
      }
    }
    return decls;
  };

  type ResolvedKey = { readonly prefix: readonly string[]; readonly carriesId: boolean };

  /** Le module LOCAL prime sur le dépôt : `LIST_KEY` est déclaré deux fois, avec
   * deux valeurs — au global il est ambigu, chez lui il est net. */
  const resolverFor = (local: Declarations, shared: Declarations) => {
    const pick = <T,>(kind: 'arrays' | 'strings' | 'aliases', name: string): T | undefined => {
      const own = local[kind].get(name) as T | typeof AMBIGUOUS | undefined;
      if (own !== undefined && own !== AMBIGUOUS) return own;
      const common = shared[kind].get(name) as T | typeof AMBIGUOUS | undefined;
      return common === AMBIGUOUS ? undefined : common;
    };
    const resolveName = (name: string, seen: ReadonlySet<string>): ResolvedKey | null => {
      if (seen.has(name)) return null;
      const walked = new Set([...seen, name]);
      const alias = pick<string>('aliases', name);
      if (alias !== undefined) return resolveName(alias, walked);
      const decl = pick<{ readonly parts: readonly string[]; readonly factory: boolean }>('arrays', name);
      if (decl === undefined) return null;
      const prefix: string[] = [];
      let carriesId = decl.factory;
      for (const part of decl.parts) {
        const literal = part.match(/^'([^']*)'$/)?.[1];
        if (literal !== undefined) { prefix.push(literal); continue; }
        const spread = part.match(/^\.\.\.([A-Za-z_$][\w$]*)$/)?.[1];
        if (spread !== undefined) {
          const inner = resolveName(spread, walked);
          if (inner === null) return null;
          prefix.push(...inner.prefix);
          if (inner.carriesId) { carriesId = true; break; }
          continue;
        }
        const indexed = part.match(/^([A-Za-z_$][\w$]*)\[(\d+)\]$/);
        const indexedName = indexed?.[1];
        const indexedAt = indexed?.[2];
        if (indexedName !== undefined && indexedAt !== undefined) {
          const at = resolveName(indexedName, walked)?.prefix[Number(indexedAt)];
          if (at === undefined) return null;
          prefix.push(at);
          continue;
        }
        const bare = part.match(/^([A-Za-z_$][\w$]*)$/)?.[1];
        const asString = bare === undefined ? undefined : pick<string>('strings', bare);
        if (asString !== undefined) { prefix.push(asString); continue; }
        carriesId = true;
        break;
      }
      return prefix.length === 0 ? null : { prefix, carriesId };
    };
    return (name: string): ResolvedKey | null => resolveName(name, new Set());
  };

  /** Une ÉCRITURE du cache, et la clé qu'elle vise. */
  const WRITE_CALL = /(?:invalidateQueries|removeQueries|resetQueries|refetchQueries|setQueryData|setQueriesData)\s*(?:<[\s\S]{0,200}?>)?\s*\(/g;

  type Write = { readonly file: string; readonly expr: string; readonly key: ResolvedKey | null };

  const socketBoundWrites = (): readonly Write[] => {
    const sources = productionSources().map(({ file, text }) => ({ file, text: stripComments(text) }));
    const shared = declarationsOf(sources.map(({ text }) => text));
    return sources.flatMap(({ file, text }) => {
      if (!/\bSERVER_EVENTS\.[A-Z_]|\b[A-Z][A-Z_]*_SERVER_EVENTS\.[A-Z_]/.test(text)) return [];
      const resolve = resolverFor(declarationsOf([text]), shared);
      const exprs = new Set<string>();
      WRITE_CALL.lastIndex = 0;
      for (let found = WRITE_CALL.exec(text); found !== null; found = WRITE_CALL.exec(text)) {
        const tail = text.slice(found.index + found[0].length, found.index + found[0].length + 300);
        const named = tail.match(/^\s*\{\s*queryKey:\s*([^,\n}]+)/)?.[1];
        const positional = tail.match(/^\s*([A-Za-z_$][\w$.]*(?:\([^()]*\))?)/)?.[1];
        const expr = (named ?? positional ?? '').trim();
        if (expr !== '') exprs.add(expr);
      }
      return [...exprs].sort().map((expr) => {
        const inlineIndexed = expr.match(/^\[\s*([A-Za-z_$][\w$]*)\[(\d+)\]\s*,\s*'([^']*)'/);
        const ident = (expr.match(/^([A-Za-z_$][\w$]*)$|^([A-Za-z_$][\w$]*)\(/) ?? []).slice(1).find((part) => part !== undefined);
        const base = inlineIndexed?.[1];
        const index = inlineIndexed?.[2];
        const second = inlineIndexed?.[3];
        if (base !== undefined && index !== undefined && second !== undefined) {
          const head = resolve(base)?.prefix[Number(index)];
          return { file, expr, key: head === undefined ? null : { prefix: [head, second], carriesId: true } };
        }
        return { file, expr, key: ident === undefined ? null : resolve(ident) };
      });
    });
  };

  const writes = socketBoundWrites();
  const resolved = writes.filter((write): write is Write & { readonly key: ResolvedKey } => write.key !== null);
  const probeOf = (key: ResolvedKey): readonly string[] => (key.carriesId ? [...key.prefix, 'sonde'] : key.prefix);
  const nameOf = (key: ResolvedKey): string => key.prefix.join('/');

  /** UNE GARDE NÉGATIVE DONT LE RELEVÉ REND `[]` RESTE VERTE — le balayage prouve
   * d'abord qu'il voit le dépôt, et qu'il y voit ce qu'on sait y être. */
  test('le balayage trouve bien des écritures, et les modules qu’on sait branchés', () => {
    expect(resolved.length).toBeGreaterThan(20);
    const files = new Set(writes.map(({ file }) => file));
    for (const known of [
      'lib/api/socket.ts',
      'lib/api/conversation-members-live.ts',
      'lib/api/community-member-live.ts',
      'lib/api/game-state-live.ts',
      'lib/packs/installation-sync.ts',
      'lib/stickers/library-sync.ts',
      'lib/calls/call-socket-bridge.ts',
    ]) {
      expect(files).toContain(known);
    }
  });

  test('aucune écriture illisible hors de l’inventaire, et aucune ligne d’inventaire périmée', () => {
    const unreadable = writes.filter(({ key }) => key === null).map(({ file, expr }) => `${file} ${expr}`);

    expect([...unreadable].sort()).toEqual([...UNRESOLVED_WRITES.keys()].sort());
    for (const reason of UNRESOLVED_WRITES.values()) expect(reason.length).toBeGreaterThan(20);
  });

  test('aucune exemption périmée : chaque ligne nomme une famille réellement écrite par un écouteur', () => {
    const written = new Set(resolved.map(({ key }) => nameOf(key)));

    for (const [family, reason] of CATCH_UP_EXEMPT) {
      expect(written).toContain(family);
      expect(reason.length).toBeGreaterThan(20);
    }
  });

  for (const { file, key } of resolved) {
    const family = nameOf(key);
    if (CATCH_UP_EXEMPT.has(family)) continue;
    const probe = probeOf(key);

    test(`${family} (${file}) : la (ré)authentification la périme`, () => {
      const first = connect();
      first.queryClient.setQueryData(probe, { quoi: 'servi avant que le socket existe' });
      first.socket.fire(SERVER_EVENTS.AUTHENTICATED, { success: true });
      expect(isInvalidated(first.queryClient, probe)).toBe(true);
      first.destroy();

      const again = connect();
      again.socket.fire(SERVER_EVENTS.AUTHENTICATED, { success: true });
      again.queryClient.setQueryData(probe, { quoi: 'servi avant la coupure' });
      again.socket.fire(SERVER_EVENTS.AUTHENTICATED, { success: true });
      expect(isInvalidated(again.queryClient, probe)).toBe(true);
      again.destroy();
    });
  }
});
