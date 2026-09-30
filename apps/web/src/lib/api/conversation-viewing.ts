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
 * Une coupure VIDE le magasin : ce que la passerelle a retiré pendant qu'on
 * n'écoutait pas ne doit pas survivre en point violet.
 */

export type ViewingState = {
  readonly byConversation: Readonly<Record<string, readonly string[]>>;
  arrive(conversationId: string, userId: string): void;
  leave(conversationId: string, userId: string): void;
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

export function createViewingStore(): ViewingStoreApi {
  return createStore<ViewingState>((set) => ({
    byConversation: {},
    arrive: (conversationId, userId) =>
      set((state) => {
        const current = state.byConversation[conversationId] ?? [];
        if (current.includes(userId)) return state;
        return { byConversation: withPeers(state.byConversation, conversationId, [...current, userId]) };
      }),
    leave: (conversationId, userId) =>
      set((state) => {
        const current = state.byConversation[conversationId];
        if (current === undefined || !current.includes(userId)) return state;
        return { byConversation: withPeers(state.byConversation, conversationId, current.filter((id) => id !== userId)) };
      }),
    replace: (conversationId, userIds) =>
      set((state) => ({ byConversation: withPeers(state.byConversation, conversationId, [...new Set(userIds)]) })),
    clear: () => set((state) => (Object.keys(state.byConversation).length === 0 ? state : { byConversation: {} })),
  }));
}

export const viewingStore: ViewingStoreApi = createViewingStore();

export function isHereIn(state: Pick<ViewingState, 'byConversation'>, conversationId: string, userId: string): boolean {
  return state.byConversation[conversationId]?.includes(userId) ?? false;
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
};

let holders: ReadonlyMap<string, number> = new Map();
let transport: ViewingTransport | null = null;

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
  if (count === 0) transport?.announce(conversationId);

  let released = false;
  return () => {
    if (released) return;
    released = true;
    const current = holders.get(conversationId) ?? 0;
    holders = withCount(conversationId, current - 1);
    if (current === 1) transport?.withdraw(conversationId);
  };
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
}): () => void {
  const { socket, visibility, store, viewerId } = params;
  let authenticated = socket.connected;

  const canAnnounce = (): boolean => authenticated && visibility.visibilityState() === 'visible';
  const emit = (event: typeof CLIENT_EVENTS.VIEWING_START | typeof CLIENT_EVENTS.VIEWING_STOP, conversationId: string): void => {
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
  };
  transport = own;

  const onAuthenticated = (): void => {
    authenticated = true;
    store.getState().clear();
    announceAll();
  };
  const onDisconnect = (): void => {
    authenticated = false;
    store.getState().clear();
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
  const unwatch = visibility.onChange(onVisibility);
  announceAll();

  return () => {
    if (transport === own) transport = null;
    socket.off(SERVER_EVENTS.AUTHENTICATED, onAuthenticated);
    socket.off('disconnect', onDisconnect);
    socket.off(SERVER_EVENTS.VIEWING_START, onStart);
    socket.off(SERVER_EVENTS.VIEWING_STOP, onStop);
    socket.off(SERVER_EVENTS.VIEWING_SNAPSHOT, onSnapshot);
    unwatch();
  };
}
