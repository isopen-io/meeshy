import { createStore, type StoreApi } from 'zustand/vanilla';

import { CLIENT_EVENTS, SERVER_EVENTS } from '@meeshy/shared/types/socketio-events/event-names';
import type { ViewingActionData } from '@meeshy/shared/types/socketio-events/presence';

import type { VisibilitySource } from './app-state-presence';
import type { SocketClient } from '@/lib/net/socket';

/**
 * « EST DANS LA CONVERSATION » (#8892) — miroir de la passerelle
 * (`ConversationViewingHandler.ts`).
 *
 * DEUX MOITIÉS. L'ÉMISSION : un écran de fil TIENT sa conversation
 * (`acquireConversationViewing`, compté comme `publication-rooms.ts`) et le
 * lien l'annonce tant que l'onglet est au premier plan. L'arrière-plan n'émet
 * rien : `presence:app-state` (`app-state-presence.ts`) suffit à la passerelle
 * pour retirer le lecteur de toutes ses conversations. La RÉCEPTION : les pairs
 * annoncés vivent dans `viewingStore`, par conversation, que la liste ET
 * l'en-tête lisent — la passerelle diffuse dans la room, et chaque socket est
 * dans toutes ses rooms.
 *
 * COUVERT (#9052) : une visionneuse plein écran posée par-dessus le fil ne le
 * démonte pas, mais l'utilisateur n'y est plus. Tant qu'une couverture est
 * tenue (`coverConversationViewing`), les conversations tenues sont retirées ;
 * la dernière couverture levée les ré-annonce.
 *
 * ACTIF (#9061) : un pair ICI qui regarde, écoute ou agit — `viewing:activity`
 * — porte un point qui PULSE ; il redevient simplement là quand l'activité se
 * tait plus de `ACTIVITY_HOLD_MS`. L'émission est bornée à une toutes les
 * `ACTIVITY_THROTTLE_MS`, et seulement pour une conversation tenue et annoncée.
 *
 * Une coupure VIDE le magasin : ce que la passerelle a retiré pendant qu'on
 * n'écoutait pas ne doit pas survivre en point violet.
 */

export type ViewingState = {
  readonly byConversation: Readonly<Record<string, readonly string[]>>;
  readonly activeByConversation: Readonly<Record<string, readonly string[]>>;
  arrive(conversationId: string, userId: string): void;
  leave(conversationId: string, userId: string): void;
  stir(conversationId: string, userId: string): void;
  rest(conversationId: string, userId: string): void;
  replace(conversationId: string, userIds: readonly string[]): void;
  clear(): void;
};

export type ViewingStoreApi = StoreApi<ViewingState>;

const withPeers = (
  byConversation: ViewingState['byConversation'],
  conversationId: string,
  userIds: readonly string[],
): ViewingState['byConversation'] => {
  if (userIds.length > 0) return { ...byConversation, [conversationId]: userIds };
  const { [conversationId]: _removed, ...rest } = byConversation;
  return rest;
};

const without = (
  byConversation: ViewingState['byConversation'],
  conversationId: string,
  userId: string,
): ViewingState['byConversation'] => {
  const current = byConversation[conversationId];
  if (current === undefined || !current.includes(userId)) return byConversation;
  return withPeers(byConversation, conversationId, current.filter((id) => id !== userId));
};

/** Le temps qu'un pair reste ACTIF après sa dernière activité reçue (#9061). */
export const ACTIVITY_HOLD_MS = 4_000;
/** L'écart minimal entre deux `viewing:activity` d'une même conversation. */
export const ACTIVITY_THROTTLE_MS = 2_000;

export function createViewingStore(): ViewingStoreApi {
  return createStore<ViewingState>((set) => ({
    byConversation: {},
    activeByConversation: {},
    arrive: (conversationId, userId) =>
      set((state) => {
        const current = state.byConversation[conversationId] ?? [];
        if (current.includes(userId)) return state;
        return { byConversation: withPeers(state.byConversation, conversationId, [...current, userId]) };
      }),
    leave: (conversationId, userId) =>
      set((state) => {
        const byConversation = without(state.byConversation, conversationId, userId);
        const activeByConversation = without(state.activeByConversation, conversationId, userId);
        if (byConversation === state.byConversation && activeByConversation === state.activeByConversation) return state;
        return { byConversation, activeByConversation };
      }),
    stir: (conversationId, userId) =>
      set((state) => {
        const current = state.activeByConversation[conversationId] ?? [];
        if (current.includes(userId)) return state;
        return { activeByConversation: withPeers(state.activeByConversation, conversationId, [...current, userId]) };
      }),
    rest: (conversationId, userId) =>
      set((state) => {
        const activeByConversation = without(state.activeByConversation, conversationId, userId);
        return activeByConversation === state.activeByConversation ? state : { activeByConversation };
      }),
    replace: (conversationId, userIds) =>
      set((state) => ({ byConversation: withPeers(state.byConversation, conversationId, [...new Set(userIds)]) })),
    clear: () =>
      set((state) =>
        Object.keys(state.byConversation).length === 0 && Object.keys(state.activeByConversation).length === 0
          ? state
          : { byConversation: {}, activeByConversation: {} },
      ),
  }));
}

export const viewingStore: ViewingStoreApi = createViewingStore();

export function isHereIn(state: Pick<ViewingState, 'byConversation'>, conversationId: string, userId: string): boolean {
  return state.byConversation[conversationId]?.includes(userId) ?? false;
}

/** Ce pair ICI regarde-t-il, écoute-t-il ou agit-il en ce moment (#9061) ? */
export function isActiveIn(state: Pick<ViewingState, 'activeByConversation'>, conversationId: string, userId: string): boolean {
  return state.activeByConversation[conversationId]?.includes(userId) ?? false;
}

/** `conversationId → pairs présents`, le lecteur exclu — l'écran de liste
 * s'abonne une fois et distribue (motif `typistNamesOf`). */
export function herePeersOf(
  state: Pick<ViewingState, 'byConversation'>,
  viewerId: string,
): Readonly<Record<string, readonly string[]>> {
  return Object.fromEntries(
    Object.entries(state.byConversation)
      .map(([conversationId, userIds]) => [conversationId, userIds.filter((id) => id !== viewerId)] as const)
      .filter(([, userIds]) => userIds.length > 0),
  );
}

type ViewingTransport = {
  readonly announce: (conversationId: string) => void;
  readonly withdraw: (conversationId: string) => void;
  readonly stir: (conversationId: string) => void;
};

let holders: ReadonlyMap<string, number> = new Map();
let coverings = 0;
let transport: ViewingTransport | null = null;

const isCovered = (): boolean => coverings > 0;

const withCount = (conversationId: string, count: number): ReadonlyMap<string, number> => {
  const next = new Map(holders);
  if (count <= 0) next.delete(conversationId);
  else next.set(conversationId, count);
  return next;
};

/** Tenir la conversation tant que l'écran est monté ; rend la main-levée,
 * idempotente. */
export function acquireConversationViewing(conversationId: string): () => void {
  const count = holders.get(conversationId) ?? 0;
  holders = withCount(conversationId, count + 1);
  if (count === 0 && !isCovered()) transport?.announce(conversationId);

  let released = false;
  return () => {
    if (released) return;
    released = true;
    const current = holders.get(conversationId) ?? 0;
    holders = withCount(conversationId, current - 1);
    if (current === 1 && !isCovered()) transport?.withdraw(conversationId);
  };
}

/** Une vue plein écran couvre le fil tant qu'elle est montée ; rend la
 * levée, idempotente. */
export function coverConversationViewing(): () => void {
  coverings += 1;
  if (coverings === 1) for (const conversationId of holders.keys()) transport?.withdraw(conversationId);

  let lifted = false;
  return () => {
    if (lifted) return;
    lifted = true;
    coverings -= 1;
    if (coverings === 0) for (const conversationId of holders.keys()) transport?.announce(conversationId);
  };
}

/** L'utilisateur fait défiler, lit un média, écrit ou réagit dans CETTE
 * conversation (#9061) : annoncé s'il y est, borné par le lien. */
export function signalConversationActivity(conversationId: string): void {
  if (!holders.has(conversationId) || isCovered()) return;
  transport?.stir(conversationId);
}

type ViewingEventPayload = { readonly userId: string; readonly conversationId: string };
type ViewingSnapshotPayload = { readonly conversationId: string; readonly userIds: readonly string[] };

function isViewingEvent(payload: unknown): payload is ViewingEventPayload {
  if (typeof payload !== 'object' || payload === null) return false;
  const p = payload as Record<string, unknown>;
  return typeof p.userId === 'string' && typeof p.conversationId === 'string';
}

function isViewingSnapshot(payload: unknown): payload is ViewingSnapshotPayload {
  if (typeof payload !== 'object' || payload === null) return false;
  const p = payload as Record<string, unknown>;
  return typeof p.conversationId === 'string' && Array.isArray(p.userIds) && p.userIds.every((id) => typeof id === 'string');
}

export function bindConversationViewing(params: {
  readonly socket: SocketClient;
  readonly visibility: VisibilitySource;
  readonly store: ViewingStoreApi;
  readonly viewerId: () => string;
  readonly now?: () => number;
  readonly activityHoldMs?: number;
}): () => void {
  const { socket, visibility, store, viewerId, now = Date.now, activityHoldMs = ACTIVITY_HOLD_MS } = params;
  let authenticated = socket.connected;
  let lastStirred: ReadonlyMap<string, number> = new Map();
  const restTimers = new Map<string, ReturnType<typeof setTimeout>>();

  const canAnnounce = (): boolean => authenticated && !isCovered() && visibility.visibilityState() === 'visible';
  const emit = (
    event: typeof CLIENT_EVENTS.VIEWING_START | typeof CLIENT_EVENTS.VIEWING_STOP | typeof CLIENT_EVENTS.VIEWING_ACTIVITY,
    conversationId: string,
  ): void => {
    const body: ViewingActionData = { conversationId };
    socket.emit(event, body);
  };
  const announceAll = (): void => {
    if (!canAnnounce()) return;
    for (const conversationId of holders.keys()) emit(CLIENT_EVENTS.VIEWING_START, conversationId);
  };

  const own: ViewingTransport = {
    announce: (conversationId) => {
      if (canAnnounce()) emit(CLIENT_EVENTS.VIEWING_START, conversationId);
    },
    withdraw: (conversationId) => {
      if (authenticated) emit(CLIENT_EVENTS.VIEWING_STOP, conversationId);
    },
    stir: (conversationId) => {
      if (!canAnnounce()) return;
      const at = now();
      const last = lastStirred.get(conversationId);
      if (last !== undefined && at - last < ACTIVITY_THROTTLE_MS) return;
      lastStirred = new Map(lastStirred).set(conversationId, at);
      emit(CLIENT_EVENTS.VIEWING_ACTIVITY, conversationId);
    },
  };
  transport = own;

  const onAuthenticated = (): void => {
    authenticated = true;
    store.getState().clear();
    announceAll();
  };
  const stopRestTimers = (): void => {
    for (const timer of restTimers.values()) clearTimeout(timer);
    restTimers.clear();
  };
  const onDisconnect = (): void => {
    authenticated = false;
    stopRestTimers();
    store.getState().clear();
  };
  const onActivity = (payload: unknown): void => {
    if (!isViewingEvent(payload) || payload.userId === viewerId()) return;
    const { conversationId, userId } = payload;
    const key = `${conversationId}\u0000${userId}`;
    clearTimeout(restTimers.get(key));
    store.getState().stir(conversationId, userId);
    restTimers.set(
      key,
      setTimeout(() => {
        restTimers.delete(key);
        store.getState().rest(conversationId, userId);
      }, activityHoldMs),
    );
  };
  const onStart = (payload: unknown): void => {
    if (!isViewingEvent(payload) || payload.userId === viewerId()) return;
    store.getState().arrive(payload.conversationId, payload.userId);
  };
  const onStop = (payload: unknown): void => {
    if (!isViewingEvent(payload)) return;
    store.getState().leave(payload.conversationId, payload.userId);
  };
  const onSnapshot = (payload: unknown): void => {
    if (!isViewingSnapshot(payload)) return;
    const me = viewerId();
    store.getState().replace(payload.conversationId, payload.userIds.filter((id) => id !== me));
  };
  const onVisibility = (): void => {
    if (visibility.visibilityState() === 'visible') announceAll();
  };

  socket.on(SERVER_EVENTS.AUTHENTICATED, onAuthenticated);
  socket.on('disconnect', onDisconnect);
  socket.on(SERVER_EVENTS.VIEWING_START, onStart);
  socket.on(SERVER_EVENTS.VIEWING_STOP, onStop);
  socket.on(SERVER_EVENTS.VIEWING_SNAPSHOT, onSnapshot);
  socket.on(SERVER_EVENTS.VIEWING_ACTIVITY, onActivity);
  const unwatch = visibility.onChange(onVisibility);
  announceAll();

  return () => {
    if (transport === own) transport = null;
    socket.off(SERVER_EVENTS.AUTHENTICATED, onAuthenticated);
    socket.off('disconnect', onDisconnect);
    socket.off(SERVER_EVENTS.VIEWING_START, onStart);
    socket.off(SERVER_EVENTS.VIEWING_STOP, onStop);
    socket.off(SERVER_EVENTS.VIEWING_SNAPSHOT, onSnapshot);
    socket.off(SERVER_EVENTS.VIEWING_ACTIVITY, onActivity);
    stopRestTimers();
    unwatch();
  };
}
