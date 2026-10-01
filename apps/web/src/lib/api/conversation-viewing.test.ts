import { afterEach, describe, expect, test } from 'bun:test';

import { CLIENT_EVENTS, SERVER_EVENTS } from '@meeshy/shared/types/socketio-events/event-names';

import type { VisibilitySource } from './app-state-presence';
import {
  acquireConversationViewing,
  bindConversationViewing,
  coverConversationViewing,
  createViewingStore,
  herePeersOf,
  isHereIn,
} from './conversation-viewing';
import type { SocketClient, SocketHandler } from '@/lib/net/socket';

/**
 * « EST DANS LA CONVERSATION » (#8892) — l'écran ouvert au premier plan
 * s'annonce, et les pairs annoncés portent le point couleur primaire.
 */

const VIEWER = 'viewer-1';
const BOB = 'user-bob';
const CAROL = 'user-carol';
const CONV = 'conv-a';

type Emitted = { readonly event: string; readonly payload: unknown };

function fakeSocket(initiallyConnected: boolean) {
  const handlers = new Map<string, Set<SocketHandler>>();
  const emitted: Emitted[] = [];
  let connected = initiallyConnected;
  const socket: SocketClient = {
    get connected() {
      return connected;
    },
    connect: () => undefined,
    disconnect: () => undefined,
    on: (event, handler) => {
      const set = handlers.get(event) ?? new Set<SocketHandler>();
      set.add(handler as SocketHandler);
      handlers.set(event, set);
    },
    off: (event, handler) => {
      handlers.get(event)?.delete(handler as SocketHandler);
    },
    emit: (event, payload) => {
      emitted.push({ event, payload });
    },
  };
  const fire = (event: string, payload?: unknown): void => {
    if (event === SERVER_EVENTS.AUTHENTICATED) connected = true;
    if (event === 'disconnect') connected = false;
    for (const handler of handlers.get(event) ?? []) handler(payload);
  };
  return { socket, emitted, fire, listeners: () => [...handlers.values()].reduce((n, s) => n + s.size, 0) };
}

function fakeVisibility(initial: 'visible' | 'hidden') {
  let state: 'visible' | 'hidden' = initial;
  const handlers = new Set<() => void>();
  const source: VisibilitySource = {
    visibilityState: () => state,
    onChange: (handler) => {
      handlers.add(handler);
      return () => handlers.delete(handler);
    },
  };
  const set = (next: 'visible' | 'hidden'): void => {
    state = next;
    for (const handler of handlers) handler();
  };
  return { source, set };
}

let cleanups: readonly (() => void)[] = [];
afterEach(() => {
  for (const cleanup of [...cleanups].reverse()) cleanup();
  cleanups = [];
});

function setup({ connected = true, visible = 'visible' as 'visible' | 'hidden' } = {}) {
  const fake = fakeSocket(connected);
  const visibility = fakeVisibility(visible);
  const store = createViewingStore();
  const unbind = bindConversationViewing({ socket: fake.socket, visibility: visibility.source, store, viewerId: () => VIEWER });
  cleanups = [...cleanups, unbind];
  return { ...fake, visibility, store };
}

function open(conversationId: string): () => void {
  const release = acquireConversationViewing(conversationId);
  cleanups = [...cleanups, release];
  return release;
}

function cover(): () => void {
  const uncover = coverConversationViewing();
  cleanups = [...cleanups, uncover];
  return uncover;
}

const sent = (emitted: readonly Emitted[]) =>
  emitted.filter((e) => e.event === CLIENT_EVENTS.VIEWING_START || e.event === CLIENT_EVENTS.VIEWING_STOP);

describe('s’annoncer — l’écran de la conversation ouvert', () => {
  test('ouvrir la conversation annonce viewing:start, la fermer annonce viewing:stop', () => {
    const { emitted } = setup();
    const release = open(CONV);
    release();

    expect(sent(emitted)).toEqual([
      { event: CLIENT_EVENTS.VIEWING_START, payload: { conversationId: CONV } },
      { event: CLIENT_EVENTS.VIEWING_STOP, payload: { conversationId: CONV } },
    ]);
  });

  test('deux écrans sur la même conversation ne s’annoncent qu’une fois', () => {
    const { emitted } = setup();
    const first = open(CONV);
    open(CONV);
    first();

    expect(sent(emitted)).toEqual([{ event: CLIENT_EVENTS.VIEWING_START, payload: { conversationId: CONV } }]);
  });

  test('un onglet en arrière-plan ne s’annonce pas, et s’annonce au retour au premier plan', () => {
    const { emitted, visibility } = setup({ visible: 'hidden' });
    open(CONV);
    expect(sent(emitted)).toEqual([]);

    visibility.set('visible');
    expect(sent(emitted)).toEqual([{ event: CLIENT_EVENTS.VIEWING_START, payload: { conversationId: CONV } }]);
  });

  test('une reconnexion ré-annonce la conversation ouverte', () => {
    const { emitted, fire } = setup();
    open(CONV);
    fire('disconnect');
    fire(SERVER_EVENTS.AUTHENTICATED, { success: true });

    expect(sent(emitted)).toEqual([
      { event: CLIENT_EVENTS.VIEWING_START, payload: { conversationId: CONV } },
      { event: CLIENT_EVENTS.VIEWING_START, payload: { conversationId: CONV } },
    ]);
  });

  test('un socket pas encore authentifié n’envoie rien, l’authentification rattrape', () => {
    const { emitted, fire } = setup({ connected: false });
    open(CONV);
    expect(sent(emitted)).toEqual([]);

    fire(SERVER_EVENTS.AUTHENTICATED, { success: true });
    expect(sent(emitted)).toEqual([{ event: CLIENT_EVENTS.VIEWING_START, payload: { conversationId: CONV } }]);
  });
});

describe('couvert — une visionneuse plein écran par-dessus le fil (#9052)', () => {
  const START = { event: CLIENT_EVENTS.VIEWING_START, payload: { conversationId: CONV } };
  const STOP = { event: CLIENT_EVENTS.VIEWING_STOP, payload: { conversationId: CONV } };

  test('ouvrir une image retire la présence, la refermer la rend', () => {
    const { emitted } = setup();
    open(CONV);
    const uncover = cover();
    uncover();

    expect(sent(emitted)).toEqual([START, STOP, START]);
  });

  test('deux couvertures empilées ne rendent la présence qu’à la dernière fermée', () => {
    const { emitted } = setup();
    open(CONV);
    const first = cover();
    const second = cover();
    first();
    expect(sent(emitted)).toEqual([START, STOP]);

    second();
    expect(sent(emitted)).toEqual([START, STOP, START]);
  });

  test('un fil ouvert SOUS une couverture ne s’annonce qu’à sa fermeture', () => {
    const { emitted } = setup();
    const uncover = cover();
    open(CONV);
    expect(sent(emitted)).toEqual([]);

    uncover();
    expect(sent(emitted)).toEqual([START]);
  });

  test('quitter le fil pendant la couverture ne renvoie pas de second viewing:stop', () => {
    const { emitted } = setup();
    const release = open(CONV);
    const uncover = cover();
    release();
    uncover();

    expect(sent(emitted)).toEqual([START, STOP]);
  });

  test('une reconnexion pendant la couverture ne ré-annonce rien', () => {
    const { emitted, fire } = setup();
    open(CONV);
    cover();
    fire('disconnect');
    fire(SERVER_EVENTS.AUTHENTICATED, { success: true });

    expect(sent(emitted)).toEqual([START, STOP]);
  });

  test('le retour au premier plan pendant la couverture ne ré-annonce rien', () => {
    const { emitted, visibility } = setup();
    open(CONV);
    cover();
    visibility.set('hidden');
    visibility.set('visible');

    expect(sent(emitted)).toEqual([START, STOP]);
  });

  test('la levée est idempotente', () => {
    const { emitted } = setup();
    open(CONV);
    const first = cover();
    const second = cover();
    first();
    first();
    expect(sent(emitted)).toEqual([START, STOP]);
    second();
    expect(sent(emitted)).toEqual([START, STOP, START]);
  });
});

describe('les pairs présents — ce que la passerelle annonce', () => {
  test('un pair qui arrive puis repart', () => {
    const { fire, store } = setup();
    fire(SERVER_EVENTS.VIEWING_START, { userId: BOB, conversationId: CONV });
    expect(isHereIn(store.getState(), CONV, BOB)).toBe(true);

    fire(SERVER_EVENTS.VIEWING_STOP, { userId: BOB, conversationId: CONV });
    expect(isHereIn(store.getState(), CONV, BOB)).toBe(false);
  });

  test('l’instantané remplace la liste de la conversation, sans jamais m’y compter', () => {
    const { fire, store } = setup();
    fire(SERVER_EVENTS.VIEWING_START, { userId: CAROL, conversationId: CONV });
    fire(SERVER_EVENTS.VIEWING_SNAPSHOT, { conversationId: CONV, userIds: [BOB, VIEWER] });

    expect(herePeersOf(store.getState(), VIEWER)).toEqual({ [CONV]: [BOB] });
  });

  test('je ne m’annonce jamais moi-même', () => {
    const { fire, store } = setup();
    fire(SERVER_EVENTS.VIEWING_START, { userId: VIEWER, conversationId: CONV });
    expect(herePeersOf(store.getState(), VIEWER)).toEqual({});
  });

  test('une charge mal formée est ignorée', () => {
    const { fire, store } = setup();
    fire(SERVER_EVENTS.VIEWING_START, { userId: 42, conversationId: CONV });
    fire(SERVER_EVENTS.VIEWING_SNAPSHOT, { conversationId: CONV, userIds: 'bob' });
    expect(herePeersOf(store.getState(), VIEWER)).toEqual({});
  });

  test('une coupure efface tout : on ne garde pas ce que la passerelle a retiré', () => {
    const { fire, store } = setup();
    fire(SERVER_EVENTS.VIEWING_START, { userId: BOB, conversationId: CONV });
    fire('disconnect');
    expect(herePeersOf(store.getState(), VIEWER)).toEqual({});
  });

  test('délier retire tous les écouteurs', () => {
    const fake = fakeSocket(true);
    const unbind = bindConversationViewing({
      socket: fake.socket,
      visibility: fakeVisibility('visible').source,
      store: createViewingStore(),
      viewerId: () => VIEWER,
    });
    unbind();
    expect(fake.listeners()).toBe(0);
  });
});
