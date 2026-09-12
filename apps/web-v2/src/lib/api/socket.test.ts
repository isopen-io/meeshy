import { QueryClient } from '@tanstack/react-query';
import { describe, expect, test } from 'bun:test';

import { SERVER_EVENTS, CLIENT_EVENTS } from '@meeshy/shared/types/socketio-events/event-names';
import type { SocketIOMessage } from '@meeshy/shared/types/socketio-events/message';

import { conversationStore } from '@/lib/conversation-store';
import type { SocketClient, SocketFactory, SocketHandler } from '@/lib/net/socket';
import { createOutboxStore, entriesOf } from '@/lib/send/outbox-store';

import { CONVERSATIONS_QUERY_KEY } from './conversations';
import { messagesQueryKey, type MessagesPage } from './messages';
import { createRealtimeConnection, type RealtimeDeps } from './socket';
import { STORY_TRAY_QUERY_KEY } from './stories';
import { createTypingStore, typistsOf } from './typing-store';
import type { Message } from './types';

/**
 * LE FAUX SOCKET (#5793) — implémente `SocketClient` sans réseau ni
 * `socket.io-client` : `fire(event, payload)` REJOUE ce qu'un vrai serveur
 * enverrait, `emitted` capture ce que `createRealtimeConnection` envoie.
 * Motif `fakeFetch` (`send/perform-send.test.ts`).
 */
function fakeSocket(): SocketClient & {
  fire(event: string, payload: unknown): void;
  readonly emitted: { readonly event: string; readonly payload: unknown }[];
  readonly connectCalls: number;
} {
  const handlers = new Map<string, Set<SocketHandler>>();
  const emitted: { readonly event: string; readonly payload: unknown }[] = [];
  let connected = false;
  let connectCalls = 0;

  return {
    get connected() {
      return connected;
    },
    get connectCalls() {
      return connectCalls;
    },
    get emitted() {
      return emitted;
    },
    connect: () => {
      connectCalls += 1;
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
    emit: (event, payload) => {
      emitted.push({ event, payload });
    },
    fire: (event, payload) => {
      for (const handler of handlers.get(event) ?? []) handler(payload);
    },
  };
}

function socketMessage(partial: Partial<SocketIOMessage>): SocketIOMessage {
  return {
    id: 'm-remote-1',
    conversationId: 'c-a',
    senderId: 'u-other',
    content: 'salut',
    originalLanguage: 'fr',
    messageType: 'text',
    createdAt: '2026-09-12T09:00:00.000Z' as unknown as Date,
    ...partial,
  };
}

/** Une horloge/un ordonnanceur DÉTERMINISTES — capture `(fn, ms)`, ne
 * planifie RIEN de réel : le témoin déclenche l'expiration lui-même. */
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
    fireAll: () => {
      for (const entry of scheduled) if (!entry.cleared) entry.fn();
    },
    scheduled,
  };
}

function buildDeps(overrides: Partial<RealtimeDeps> = {}): {
  readonly deps: RealtimeDeps;
  readonly socket: ReturnType<typeof fakeSocket>;
  readonly queryClient: QueryClient;
  readonly typing: ReturnType<typeof createTypingStore>;
  readonly outbox: ReturnType<typeof createOutboxStore>;
} {
  const socket = fakeSocket();
  const socketFactory: SocketFactory = () => socket;
  const queryClient = new QueryClient();
  const typing = createTypingStore();
  const outbox = createOutboxStore();
  const deps: RealtimeDeps = {
    base: 'https://gate.staging.meeshy.me',
    socketFactory,
    queryClient,
    typing,
    conversationStore,
    outbox,
    viewerId: () => 'u-viewer',
    onClearSession: () => undefined,
    ...overrides,
  };
  return { deps, socket, queryClient, typing, outbox };
}

describe('createRealtimeConnection (#5793) — la connexion, sans réseau', () => {
  test('la poignée de main présente le jeton ET le jeton de session au FACTORY, et se connecte', () => {
    let seenAuth: { readonly token: string; readonly sessionToken: string } | null = null;
    const socket = fakeSocket();
    const socketFactory: SocketFactory = ({ auth }) => {
      seenAuth = auth;
      return socket;
    };
    const { deps } = buildDeps({ socketFactory });
    createRealtimeConnection({ token: 'jwt-1', sessionToken: 'sess-1' }, deps);

    expect(seenAuth).toEqual({ token: 'jwt-1', sessionToken: 'sess-1' });
    expect(socket.connectCalls).toBe(1);
  });

  test('`message:new` insère dans le cache du fil OUVERT — AUCUNE requête réseau (compteur de fetch = 0)', () => {
    const { deps, socket, queryClient } = buildDeps();
    queryClient.setQueryData<MessagesPage>(messagesQueryKey('c-a'), { messages: [], hasOlder: false });
    let fetchCount = 0;
    void queryClient.getQueryCache().build(queryClient, {
      queryKey: messagesQueryKey('c-a'),
      queryFn: async () => {
        fetchCount += 1;
        throw new Error('aucune requête ne doit partir');
      },
    });

    createRealtimeConnection({ token: 't', sessionToken: 's' }, deps);
    socket.fire(SERVER_EVENTS.MESSAGE_NEW, socketMessage({}));

    const page = queryClient.getQueryData<MessagesPage>(messagesQueryKey('c-a'));
    expect(page?.messages).toHaveLength(1);
    expect(page?.messages[0]?.id).toBe('m-remote-1');
    expect(fetchCount).toBe(0);
  });

  /**
   * LA LIGNE QUE LE FIL REND, pas la seule page du cache — un envoi EN VOL vit
   * dans l'OUTBOX (revue-correction #5793, défaut BLOQUANT) : voir le témoin
   * jumeau de `realtime-apply.test.ts`, qui exerce la règle par l'API pure.
   * Celui-ci prouve que la CONNEXION la branche — un `message:new` reçu par le
   * socket réel doit promouvoir l'entrée, pas seulement `applyMessageNew`
   * appelée à la main.
   */
  test('un `message:new` portant le cid d’un envoi EN VOL promeut l’entrée d’outbox (D-11/D-28)', () => {
    const { deps, socket, outbox } = buildDeps();
    outbox.getState().enqueue('c-a', {
      message: { id: 'cid-1', clientMessageId: 'cid-1', conversationId: 'c-a' } as never,
      delivery: 'pending',
      attempts: 1,
      startedAt: 0,
    });

    createRealtimeConnection({ token: 't', sessionToken: 's' }, deps);
    socket.fire(SERVER_EVENTS.MESSAGE_NEW, socketMessage({ id: 'm-server-9', clientMessageId: 'cid-1' }));

    expect(entriesOf(outbox.getState(), 'c-a')).toHaveLength(0);
  });

  test('un `message:new` portant le `clientMessageId` d’un envoi LOCAL ne double pas la ligne (D-11/D-28)', () => {
    const { deps, socket, queryClient } = buildDeps();
    const local = {
      id: 'cid-1',
      clientMessageId: 'cid-1',
      conversationId: 'c-a',
      senderId: 'u-viewer',
      content: 'en cours…',
      originalLanguage: 'fr',
      messageType: 'text',
      messageSource: 'user',
      isEdited: false,
      isViewOnce: false,
      viewOnceCount: 0,
      isBlurred: false,
      deliveredCount: 0,
      readCount: 0,
      reactionCount: 0,
      isEncrypted: false,
      translations: [],
      createdAt: new Date('2026-09-12T08:59:00.000Z'),
      timestamp: new Date('2026-09-12T08:59:00.000Z'),
    } as unknown as Message;
    queryClient.setQueryData<MessagesPage>(messagesQueryKey('c-a'), { messages: [local], hasOlder: false });

    createRealtimeConnection({ token: 't', sessionToken: 's' }, deps);
    socket.fire(SERVER_EVENTS.MESSAGE_NEW, socketMessage({ id: 'm-server-9', clientMessageId: 'cid-1' }));

    const page = queryClient.getQueryData<MessagesPage>(messagesQueryKey('c-a'));
    expect(page?.messages).toHaveLength(1);
    expect(page?.messages[0]?.id).toBe('m-server-9');
  });

  /**
   * `conversation:updated` (revue-correction #5793, défaut MAJEUR 1) — LA
   * CONNEXION la branche, pas seulement `applyConversationUpdated` appelée à
   * la main (motif du témoin jumeau de `message:new` ci-dessus). La carte
   * SERVEUR (déjà restreinte aux langues du lecteur) PRIME sur ce qu'un
   * `message:new` antérieur avait déduit avec `translations` VIDE.
   */
  test('`conversation:updated` fusionne la carte SERVEUR dans la ligne de LISTE', () => {
    const { deps, socket, queryClient } = buildDeps();
    queryClient.setQueryData(CONVERSATIONS_QUERY_KEY, [
      {
        id: 'c-a',
        type: 'direct',
        status: 'active',
        visibility: 'private',
        isActive: true,
        memberCount: 2,
        participants: [],
        createdAt: new Date(),
        lastMessage: { id: 'm-1', content: 'Hola', conversationId: 'c-a' } as unknown as Message,
        lastMessageOriginalLanguage: 'es',
      },
    ]);

    createRealtimeConnection({ token: 't', sessionToken: 's' }, deps);
    socket.fire(SERVER_EVENTS.CONVERSATION_UPDATED, {
      conversationId: 'c-a',
      updatedBy: { id: 'u-other' },
      updatedAt: '2026-09-12T10:05:00.000Z',
      lastMessageId: 'm-1',
      lastMessageTranslations: { fr: 'Salut' },
    });

    const list = queryClient.getQueryData<{ readonly id: string; readonly lastMessageTranslations?: unknown }[]>(
      CONVERSATIONS_QUERY_KEY,
    );
    expect(list?.find((c) => c.id === 'c-a')?.lastMessageTranslations).toEqual({ fr: 'Salut' });
  });

  /**
   * `message:translation` (revue-correction #5793, défaut MAJEUR 2) — le
   * pipeline traduit APRÈS la création : sans ce câblage, un message reçu
   * reste dans la langue de l'expéditeur jusqu'au prochain
   * `GET …/messages`.
   */
  test('`message:translation` fusionne dans le fil OUVERT', () => {
    const { deps, socket, queryClient } = buildDeps();
    queryClient.setQueryData<MessagesPage>(messagesQueryKey('c-a'), {
      messages: [{ ...socketMessage({ id: 'm-1' }), translations: [] } as unknown as Message],
      hasOlder: false,
    });

    createRealtimeConnection({ token: 't', sessionToken: 's' }, deps);
    socket.fire(SERVER_EVENTS.MESSAGE_TRANSLATION, {
      messageId: 'm-1',
      translations: [
        {
          id: 't-1',
          messageId: 'm-1',
          sourceLanguage: 'es',
          targetLanguage: 'fr',
          translatedContent: 'Salut',
          translationModel: 'basic',
          cacheKey: 'k',
          cached: false,
        },
      ],
    });

    const page = queryClient.getQueryData<MessagesPage>(messagesQueryKey('c-a'));
    const patched = page?.messages.find((m) => m.id === 'm-1');
    expect(patched?.translations.find((t) => t.targetLanguage === 'fr')?.translatedContent).toBe('Salut');
  });

  /**
   * `story:*` / `status:*` (#5652, bloc E) — LE RAIL SUIT LE FIL EN DIRECT.
   * Motif `AUTHENTICATED` ci-dessus : une invalidation TanStack, jamais une
   * reconstruction locale du corpus depuis la charge de l'événement.
   */
  const STORY_EVENTS: readonly [string, unknown][] = [
    [SERVER_EVENTS.STORY_CREATED, { story: { id: 's-1' } }],
    [SERVER_EVENTS.STORY_UPDATED, { story: { id: 's-1' } }],
    [SERVER_EVENTS.STORY_DELETED, { storyId: 's-1', authorId: 'u-1' }],
    [SERVER_EVENTS.STORY_VIEWED, { storyId: 's-1', viewerId: 'u-1', viewerUsername: 'x', viewCount: 1 }],
  ];
  for (const [event, payload] of STORY_EVENTS) {
    test(`\`${event}\` invalide le rail des STORIES`, () => {
      const { deps, socket, queryClient } = buildDeps();
      queryClient.setQueryData(STORY_TRAY_QUERY_KEY, []);
      createRealtimeConnection({ token: 't', sessionToken: 's' }, deps);

      socket.fire(event, payload);

      expect(queryClient.getQueryState(STORY_TRAY_QUERY_KEY)?.isInvalidated).toBe(true);
    });
  }

  test('`typing:start` alimente le magasin de frappe, JAMAIS pour soi-même', () => {
    const { deps, socket, typing } = buildDeps({ viewerId: () => 'u-viewer' });
    createRealtimeConnection({ token: 't', sessionToken: 's' }, deps);

    socket.fire(SERVER_EVENTS.TYPING_START, {
      userId: 'u-amina',
      username: 'amina.diallo',
      displayName: 'Amina Diallo',
      conversationId: 'c-a',
      isTyping: true,
    });
    expect(typistsOf(typing.getState(), 'c-a', Date.now()).map((t) => t.userId)).toEqual(['u-amina']);

    // Jamais pour SOI-MÊME (miroir iOS `:971-975`).
    socket.fire(SERVER_EVENTS.TYPING_START, {
      userId: 'u-viewer',
      username: 'vous',
      conversationId: 'c-a',
      isTyping: true,
    });
    expect(typistsOf(typing.getState(), 'c-a', Date.now()).map((t) => t.userId)).toEqual(['u-amina']);
  });

  test('`typing:stop` retire le frappeur', () => {
    const { deps, socket, typing } = buildDeps();
    createRealtimeConnection({ token: 't', sessionToken: 's' }, deps);

    socket.fire(SERVER_EVENTS.TYPING_START, { userId: 'u-amina', username: 'amina', conversationId: 'c-a' });
    socket.fire(SERVER_EVENTS.TYPING_STOP, { userId: 'u-amina', username: 'amina', conversationId: 'c-a' });

    expect(typistsOf(typing.getState(), 'c-a', Date.now())).toEqual([]);
  });

  test('un frappeur EXPIRE après le minuteur de sécurité si aucun `typing:stop` n’arrive jamais', () => {
    const scheduler = fakeScheduler();
    const { deps, socket, typing } = buildDeps({
      scheduleTimeout: scheduler.scheduleTimeout,
      clearTimeoutFn: scheduler.clearTimeoutFn,
    });
    createRealtimeConnection({ token: 't', sessionToken: 's' }, deps);

    socket.fire(SERVER_EVENTS.TYPING_START, { userId: 'u-amina', username: 'amina', conversationId: 'c-a' });
    expect(typistsOf(typing.getState(), 'c-a', Date.now())).toHaveLength(1);

    scheduler.fireAll(); // le minuteur de 15 s se déclenche.
    expect(typistsOf(typing.getState(), 'c-a', Date.now())).toEqual([]);
  });

  test('un `typing:stop` DÉSARME le minuteur de sécurité — il ne double pas l’effet', () => {
    const scheduler = fakeScheduler();
    const { deps, socket, typing } = buildDeps({
      scheduleTimeout: scheduler.scheduleTimeout,
      clearTimeoutFn: scheduler.clearTimeoutFn,
    });
    createRealtimeConnection({ token: 't', sessionToken: 's' }, deps);

    socket.fire(SERVER_EVENTS.TYPING_START, { userId: 'u-amina', username: 'amina', conversationId: 'c-a' });
    socket.fire(SERVER_EVENTS.TYPING_STOP, { userId: 'u-amina', username: 'amina', conversationId: 'c-a' });
    // Le minuteur est annulé — le rejouer ne doit rien casser (pas d'entrée à retirer deux fois).
    expect(() => scheduler.fireAll()).not.toThrow();
    expect(typistsOf(typing.getState(), 'c-a', Date.now())).toEqual([]);
  });

  /**
   * DEUX FRAPPEURS EXPIRENT UN PAR UN (#6171, T8) — le magasin de frappe
   * tient DÉJÀ plusieurs entrées par conversation (`typing-store.ts`) ; ce
   * témoin prouve que la CONNEXION arme un minuteur de sécurité PAR
   * frappeur, jamais un seul pour toute la conversation.
   */
  test('DEUX frappeurs expirent UN PAR UN — chaque minuteur ne retire que le sien (#6171, T8)', () => {
    const scheduler = fakeScheduler();
    const { deps, socket, typing } = buildDeps({
      scheduleTimeout: scheduler.scheduleTimeout,
      clearTimeoutFn: scheduler.clearTimeoutFn,
    });
    createRealtimeConnection({ token: 't', sessionToken: 's' }, deps);

    socket.fire(SERVER_EVENTS.TYPING_START, { userId: 'u-kwame', username: 'kwame', displayName: 'Kwame Mensah', conversationId: 'c-a' });
    socket.fire(SERVER_EVENTS.TYPING_START, { userId: 'u-fatou', username: 'fatou', displayName: 'Fatou Bâ', conversationId: 'c-a' });
    expect(typistsOf(typing.getState(), 'c-a', Date.now()).map((t) => t.userId)).toEqual(['u-kwame', 'u-fatou']);

    // Le minuteur de Kwame (le PREMIER programmé) se déclenche seul.
    scheduler.scheduled[0]?.fn();
    expect(typistsOf(typing.getState(), 'c-a', Date.now()).map((t) => t.userId)).toEqual(['u-fatou']);

    scheduler.scheduled[1]?.fn();
    expect(typistsOf(typing.getState(), 'c-a', Date.now())).toEqual([]);
  });

  test('un SECOND `typing:start` du MÊME frappeur réarme SON minuteur sans toucher celui d’un autre', () => {
    const scheduler = fakeScheduler();
    const { deps, socket, typing } = buildDeps({
      scheduleTimeout: scheduler.scheduleTimeout,
      clearTimeoutFn: scheduler.clearTimeoutFn,
    });
    createRealtimeConnection({ token: 't', sessionToken: 's' }, deps);

    socket.fire(SERVER_EVENTS.TYPING_START, { userId: 'u-kwame', username: 'kwame', conversationId: 'c-a' });
    socket.fire(SERVER_EVENTS.TYPING_START, { userId: 'u-fatou', username: 'fatou', conversationId: 'c-a' });
    socket.fire(SERVER_EVENTS.TYPING_START, { userId: 'u-kwame', username: 'kwame', conversationId: 'c-a' });

    expect(scheduler.scheduled[0]?.cleared).toBe(true); // le PREMIER minuteur de Kwame a été annulé.
    expect(scheduler.scheduled[1]?.cleared).toBe(false); // celui de Fatou n'a jamais été touché.
    /**
     * L'ORDRE NE BOUGE PAS (revue-correction #6171, défaut 3) — Kwame est
     * apparu EN PREMIER ; son keepalive réarme son échéance (assertions
     * ci-dessus) mais ne le renvoie PAS en queue du roster, miroir
     * `ConversationSocketHandler.swift:366-380`/`:392-395` (« Republie le
     * roster dans l'ordre de première apparition »). Cette assertion
     * attendait AUPARAVANT `['u-fatou', 'u-kwame']` — l'ancienne forme de
     * `typing-store.ts` § `start` (`filter` puis ajout en QUEUE) déplaçait
     * le frappeur qui réarme, et ce test consacrait le défaut au lieu de le
     * révéler : falsifié par `typing-store.test.ts` § « un keepalive du
     * MÊME frappeur ne lui fait perdre ni sa place de meneur ni l'ordre ».
     */
    expect(typistsOf(typing.getState(), 'c-a', Date.now()).map((t) => t.userId)).toEqual(['u-kwame', 'u-fatou']);
  });

  /**
   * `message:new` RÉTRACTE la frappe de SON AUTEUR (#6171, G2/T9) — miroir
   * `ConversationListViewModel.swift:992-1013`. Un frappeur qui n'a pas écrit
   * ce message reste en place.
   */
  test('un `message:new` rétracte la frappe de SON AUTEUR, et de lui seul (#6171, G2/T9)', () => {
    const scheduler = fakeScheduler();
    const { deps, socket, typing } = buildDeps({
      scheduleTimeout: scheduler.scheduleTimeout,
      clearTimeoutFn: scheduler.clearTimeoutFn,
    });
    createRealtimeConnection({ token: 't', sessionToken: 's' }, deps);

    socket.fire(SERVER_EVENTS.TYPING_START, { userId: 'u-kwame', username: 'kwame', conversationId: 'c-a' });
    socket.fire(SERVER_EVENTS.TYPING_START, { userId: 'u-fatou', username: 'fatou', conversationId: 'c-a' });

    socket.fire(SERVER_EVENTS.MESSAGE_NEW, socketMessage({ senderId: 'u-kwame' }));

    expect(typistsOf(typing.getState(), 'c-a', Date.now()).map((t) => t.userId)).toEqual(['u-fatou']);
    expect(scheduler.scheduled[0]?.cleared).toBe(true); // le minuteur de Kwame est désarmé.
    expect(scheduler.scheduled[1]?.cleared).toBe(false); // celui de Fatou ne l'est pas.
  });

  test('la rétractation lit AUSSI `sender.userId` (deux espaces d’ids, doc `conversation.ts:210-226`)', () => {
    const { deps, socket, typing } = buildDeps();
    createRealtimeConnection({ token: 't', sessionToken: 's' }, deps);

    socket.fire(SERVER_EVENTS.TYPING_START, { userId: 'u-kwame', username: 'kwame', conversationId: 'c-a' });
    socket.fire(SERVER_EVENTS.MESSAGE_NEW, socketMessage({ senderId: 'p-kwame', sender: { id: 'p-kwame', displayName: 'Kwame Mensah', userId: 'u-kwame' } }));

    expect(typistsOf(typing.getState(), 'c-a', Date.now())).toEqual([]);
  });

  /**
   * `message:translation` BASCULE LE CACHE SANS AUCUNE REQUÊTE (#6171, T2) —
   * le compteur de fetch = 0 EST le critère de fin de l'issue.
   */
  test('`message:translation` bascule le cache SANS AUCUNE requête (compteur de fetch = 0) (#6171, T2)', () => {
    const { deps, socket, queryClient } = buildDeps();
    queryClient.setQueryData<MessagesPage>(messagesQueryKey('c-a'), {
      messages: [{ ...socketMessage({ id: 'm-1', originalLanguage: 'es', content: 'Hola' }), translations: [] } as unknown as Message],
      hasOlder: false,
    });
    let fetchCount = 0;
    void queryClient.getQueryCache().build(queryClient, {
      queryKey: messagesQueryKey('c-a'),
      queryFn: async () => {
        fetchCount += 1;
        throw new Error('aucune requête ne doit partir');
      },
    });

    createRealtimeConnection({ token: 't', sessionToken: 's' }, deps);
    socket.fire(SERVER_EVENTS.MESSAGE_TRANSLATION, {
      messageId: 'm-1',
      translations: [
        {
          id: 't-1',
          messageId: 'm-1',
          sourceLanguage: 'es',
          targetLanguage: 'fr',
          translatedContent: 'Salut',
          translationModel: 'basic',
          cacheKey: 'k',
          cached: false,
        },
      ],
    });

    const page = queryClient.getQueryData<MessagesPage>(messagesQueryKey('c-a'));
    expect(page?.messages.find((m) => m.id === 'm-1')?.translations.find((t) => t.targetLanguage === 'fr')?.translatedContent).toBe('Salut');
    expect(fetchCount).toBe(0);
  });

  test('émettre la frappe passe par `typing:start`/`typing:stop`, avec `{ conversationId }`', () => {
    const { deps, socket } = buildDeps();
    const connection = createRealtimeConnection({ token: 't', sessionToken: 's' }, deps);

    connection.emitTyping('c-a', true);
    connection.emitTyping('c-a', false);

    expect(socket.emitted).toEqual([
      { event: CLIENT_EVENTS.TYPING_START, payload: { conversationId: 'c-a' } },
      { event: CLIENT_EVENTS.TYPING_STOP, payload: { conversationId: 'c-a' } },
    ]);
  });

  test('`auth:token-expired` et `auth:session-revoked` ferment la session — même geste qu’un 401 HTTP', () => {
    let cleared = 0;
    const { deps, socket } = buildDeps({ onClearSession: () => (cleared += 1) });
    createRealtimeConnection({ token: 't', sessionToken: 's' }, deps);

    socket.fire(SERVER_EVENTS.AUTH_TOKEN_EXPIRED, { code: 'token_expired', message: 'expiré' });
    expect(cleared).toBe(1);

    socket.fire(SERVER_EVENTS.AUTH_SESSION_REVOKED, { code: 'session_revoked', message: 'révoqué', reason: 'admin_revoke' });
    expect(cleared).toBe(2);
  });

  test('reconnexion : l’évènement `online` relance `connect()` si le socket est déconnecté', () => {
    const listeners: Record<string, () => void> = {};
    const windowTarget = {
      addEventListener: (type: 'online', listener: () => void) => {
        listeners[type] = listener;
      },
      removeEventListener: (type: 'online') => {
        delete listeners[type];
      },
    };
    const { deps, socket } = buildDeps({ windowTarget });
    createRealtimeConnection({ token: 't', sessionToken: 's' }, deps);
    expect(socket.connectCalls).toBe(1);

    socket.disconnect();
    listeners.online?.();
    expect(socket.connectCalls).toBe(2);

    // Déjà connecté : `online` ne reconnecte pas une seconde fois pour rien.
    listeners.online?.();
    expect(socket.connectCalls).toBe(2);
  });

  /**
   * LE TROU DE LA COUPURE (revue-correction #5793) — `refetchOnReconnect` ne
   * couvre que le retour de `navigator.onLine` ; un redémarrage de la
   * passerelle ou une coupure du seul socket laisse le navigateur « en ligne »
   * et perd tout `message:new` de l'intervalle. La RE-authentification est le
   * signal, et le rejeu est une invalidation par PRÉFIXE — liste, case du fil
   * et page du fil d'un coup.
   */
  test('une RE-authentification (reconnexion) invalide la liste ET le fil ; la PREMIÈRE ne rejoue rien', async () => {
    const { deps, socket, queryClient } = buildDeps();
    let listFetches = 0;
    let threadFetches = 0;
    await queryClient.fetchQuery({
      queryKey: ['conversations'],
      queryFn: async () => {
        listFetches += 1;
        return [];
      },
    });
    await queryClient.fetchQuery({
      queryKey: messagesQueryKey('c-a'),
      queryFn: async () => {
        threadFetches += 1;
        return { messages: [], hasOlder: false } as MessagesPage;
      },
    });
    expect([listFetches, threadFetches]).toEqual([1, 1]);

    createRealtimeConnection({ token: 't', sessionToken: 's' }, deps);
    socket.fire(SERVER_EVENTS.AUTHENTICATED, { success: true });
    await queryClient.refetchQueries({ type: 'active' });
    // Première authentification : aucun trou à combler, aucune requête de plus
    // (les deux requêtes ci-dessus ne sont plus OBSERVÉES, donc inactives —
    // seule leur péremption pourrait se mesurer).
    expect(queryClient.getQueryState(['conversations'])?.isInvalidated).toBe(false);

    socket.fire(SERVER_EVENTS.AUTHENTICATED, { success: true });
    expect(queryClient.getQueryState(['conversations'])?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(messagesQueryKey('c-a'))?.isInvalidated).toBe(true);
  });

  test('`destroy` démonte les écouteurs, annule les minuteurs et déconnecte', () => {
    const scheduler = fakeScheduler();
    const listeners: Record<string, () => void> = {};
    const windowTarget = {
      addEventListener: (type: 'online', listener: () => void) => {
        listeners[type] = listener;
      },
      removeEventListener: (type: 'online') => {
        delete listeners[type];
      },
    };
    const { deps, socket } = buildDeps({
      windowTarget,
      scheduleTimeout: scheduler.scheduleTimeout,
      clearTimeoutFn: scheduler.clearTimeoutFn,
    });
    const connection = createRealtimeConnection({ token: 't', sessionToken: 's' }, deps);
    socket.fire(SERVER_EVENTS.TYPING_START, { userId: 'u-amina', username: 'amina', conversationId: 'c-a' });

    connection.destroy();

    expect(socket.connected).toBe(false);
    expect(listeners.online).toBeUndefined();
    // Le message reçu après `destroy` n'a plus aucun écouteur pour le lire.
    socket.fire(SERVER_EVENTS.MESSAGE_NEW, socketMessage({}));
    expect(deps.queryClient.getQueryData(messagesQueryKey('c-a'))).toBeUndefined();
    // Idem pour les deux écouteurs ajoutés par #5793 (défauts 1 et 2).
    socket.fire(SERVER_EVENTS.CONVERSATION_UPDATED, {
      conversationId: 'c-a',
      updatedBy: { id: 'u-1' },
      updatedAt: '2026-09-12T10:00:00.000Z',
    });
    socket.fire(SERVER_EVENTS.MESSAGE_TRANSLATION, { messageId: 'm-1', translations: [] });
    expect(deps.queryClient.getQueryData(CONVERSATIONS_QUERY_KEY)).toBeUndefined();
    deps.queryClient.setQueryData(STORY_TRAY_QUERY_KEY, []);
    socket.fire(SERVER_EVENTS.STORY_CREATED, { story: { id: 's-1' } });
    expect(deps.queryClient.getQueryState(STORY_TRAY_QUERY_KEY)?.isInvalidated).toBe(false);
    // Le minuteur de sécurité en attente a été annulé par `destroy`.
    expect(scheduler.scheduled.every((s) => s.cleared)).toBe(true);
  });
});
