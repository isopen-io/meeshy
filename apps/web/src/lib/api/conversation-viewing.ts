import { createStore, type StoreApi } from 'zustand/vanilla';

import { CLIENT_EVENTS, SERVER_EVENTS } from '@meeshy/shared/types/socketio-events/event-names';
import type { ViewingActionData, ViewingActivityData } from '@meeshy/shared/types/socketio-events/presence';

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
 * SUSPENDU (#9065, ex-#9052) : l'écran d'appel en grand ne démonte pas le
 * fil, mais l'utilisateur n'y est plus. Tant qu'une suspension est tenue
 * (`suspendConversationViewing`), les conversations tenues sont retirées ; la
 * dernière levée les ré-annonce — réduire l'appel rend la conversation.
 *
 * EN PLEIN ÉCRAN (#9065) : une visionneuse ouverte depuis le fil, elle, ne
 * fait PAS quitter — l'utilisateur regarde ce que la conversation lui a
 * montré. Tant qu'elle est tenue (`focusConversationViewing`), chaque
 * conversation tenue bat `viewing:activity { focus: true }` tout de suite puis
 * toutes les `ACTIVITY_THROTTLE_MS` ; la dernière refermée émet aussitôt une
 * activité simple, hors borne, qui rend le fil au pair. Chez le pair, le focus
 * est tenu `ACTIVITY_HOLD_MS` après le dernier battement, et une activité sans
 * `focus` le relâche sur-le-champ : il est revenu au fil.
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
  readonly focusedByConversation: Readonly<Record<string, readonly string[]>>;
  arrive(conversationId: string, userId: string): void;
  leave(conversationId: string, userId: string): void;
  stir(conversationId: string, userId: string): void;
  rest(conversationId: string, userId: string): void;
  focus(conversationId: string, userId: string): void;
  blur(conversationId: string, userId: string): void;
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

const withJoined = (
  byConversation: ViewingState['byConversation'],
  conversationId: string,
  userId: string,
): ViewingState['byConversation'] => {
  const current = byConversation[conversationId] ?? [];
  return current.includes(userId) ? byConversation : withPeers(byConversation, conversationId, [...current, userId]);
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
    focusedByConversation: {},
    arrive: (conversationId, userId) =>
      set((state) => {
        const byConversation = withJoined(state.byConversation, conversationId, userId);
        return byConversation === state.byConversation ? state : { byConversation };
      }),
    leave: (conversationId, userId) =>
      set((state) => {
        const byConversation = without(state.byConversation, conversationId, userId);
        const activeByConversation = without(state.activeByConversation, conversationId, userId);
        const focusedByConversation = without(state.focusedByConversation, conversationId, userId);
        if (
          byConversation === state.byConversation &&
          activeByConversation === state.activeByConversation &&
          focusedByConversation === state.focusedByConversation
        )
          return state;
        return { byConversation, activeByConversation, focusedByConversation };
      }),
    stir: (conversationId, userId) =>
      set((state) => {
        const activeByConversation = withJoined(state.activeByConversation, conversationId, userId);
        return activeByConversation === state.activeByConversation ? state : { activeByConversation };
      }),
    rest: (conversationId, userId) =>
      set((state) => {
        const activeByConversation = without(state.activeByConversation, conversationId, userId);
        return activeByConversation === state.activeByConversation ? state : { activeByConversation };
      }),
    focus: (conversationId, userId) =>
      set((state) => {
        const focusedByConversation = withJoined(state.focusedByConversation, conversationId, userId);
        return focusedByConversation === state.focusedByConversation ? state : { focusedByConversation };
      }),
    blur: (conversationId, userId) =>
      set((state) => {
        const focusedByConversation = without(state.focusedByConversation, conversationId, userId);
        return focusedByConversation === state.focusedByConversation ? state : { focusedByConversation };
      }),
    replace: (conversationId, userIds) =>
      set((state) => ({ byConversation: withPeers(state.byConversation, conversationId, [...new Set(userIds)]) })),
    clear: () =>
      set((state) =>
        Object.keys(state.byConversation).length === 0 &&
        Object.keys(state.activeByConversation).length === 0 &&
        Object.keys(state.focusedByConversation).length === 0
          ? state
          : { byConversation: {}, activeByConversation: {}, focusedByConversation: {} },
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

/** Ce pair ICI regarde-t-il, en plein écran, un élément de la conversation (#9065) ? */
export function isFocusedIn(state: Pick<ViewingState, 'focusedByConversation'>, conversationId: string, userId: string): boolean {
  return state.focusedByConversation[conversationId]?.includes(userId) ?? false;
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
  readonly focusChanged: () => void;
};

let holders: ReadonlyMap<string, number> = new Map();
let suspensions = 0;
let focusings = 0;
let transport: ViewingTransport | null = null;

const isSuspended = (): boolean => suspensions > 0;
const isFocused = (): boolean => focusings > 0;

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
  if (count === 0 && !isSuspended()) transport?.announce(conversationId);

  let released = false;
  return () => {
    if (released) return;
    released = true;
    const current = holders.get(conversationId) ?? 0;
    holders = withCount(conversationId, current - 1);
    if (current === 1 && !isSuspended()) transport?.withdraw(conversationId);
  };
}

/** L'écran d'appel en grand fait quitter les conversations tenues ; rend la
 * levée, idempotente. */
export function suspendConversationViewing(): () => void {
  suspensions += 1;
  if (suspensions === 1) for (const conversationId of holders.keys()) transport?.withdraw(conversationId);

  let lifted = false;
  return () => {
    if (lifted) return;
    lifted = true;
    suspensions -= 1;
    if (suspensions === 0) {
      for (const conversationId of holders.keys()) transport?.announce(conversationId);
      transport?.focusChanged();
    }
  };
}

/** Une visionneuse plein écran ouverte depuis le fil le garde « ici » et le
 * fait battre (#9065) ; rend la levée, idempotente. */
export function focusConversationViewing(): () => void {
  focusings += 1;
  if (focusings === 1) transport?.focusChanged();

  let lifted = false;
  return () => {
    if (lifted) return;
    lifted = true;
    focusings -= 1;
    if (focusings === 0) transport?.focusChanged();
  };
}

/** L'utilisateur fait défiler, lit un média, écrit ou réagit dans CETTE
 * conversation (#9061) : annoncé s'il y est, borné par le lien. */
export function signalConversationActivity(conversationId: string): void {
  if (!holders.has(conversationId) || isSuspended()) return;
  transport?.stir(conversationId);
}

const repeatEvery = (ms: number, tick: () => void): (() => void) => {
  const timer = setInterval(tick, ms);
  return () => clearInterval(timer);
};

type ViewingEventPayload = { readonly userId: string; readonly conversationId: string; readonly focus?: unknown };
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
  readonly focusBeatMs?: number;
  readonly every?: (ms: number, tick: () => void) => () => void;
}): () => void {
  const {
    socket,
    visibility,
    store,
    viewerId,
    now = Date.now,
    activityHoldMs = ACTIVITY_HOLD_MS,
    focusBeatMs = ACTIVITY_THROTTLE_MS,
    every = repeatEvery,
  } = params;
  let authenticated = socket.connected;
  let lastStirred: ReadonlyMap<string, number> = new Map();
  let stopBeat: (() => void) | undefined;
  const restTimers = new Map<string, ReturnType<typeof setTimeout>>();

  const canAnnounce = (): boolean => authenticated && !isSuspended() && visibility.visibilityState() === 'visible';
  const emit = (
    event: typeof CLIENT_EVENTS.VIEWING_START | typeof CLIENT_EVENTS.VIEWING_STOP | typeof CLIENT_EVENTS.VIEWING_ACTIVITY,
    conversationId: string,
  ): void => {
    const body: ViewingActionData = { conversationId };
    socket.emit(event, body);
  };
  const beatFocus = (): void => {
    if (!canAnnounce()) return;
    for (const conversationId of holders.keys()) {
      const body: ViewingActivityData = { conversationId, focus: true };
      socket.emit(CLIENT_EVENTS.VIEWING_ACTIVITY, body);
    }
  };
  const stirAllNow = (): void => {
    if (!canAnnounce()) return;
    const at = now();
    for (const conversationId of holders.keys()) {
      lastStirred = new Map(lastStirred).set(conversationId, at);
      emit(CLIENT_EVENTS.VIEWING_ACTIVITY, conversationId);
    }
  };
  const stopFocusBeat = (): boolean => {
    const wasBeating = stopBeat !== undefined;
    stopBeat?.();
    stopBeat = undefined;
    return wasBeating;
  };
  const focusChanged = (): void => {
    const wasBeating = stopFocusBeat();
    if (!isFocused()) {
      if (wasBeating) stirAllNow();
      return;
    }
    beatFocus();
    stopBeat = every(focusBeatMs, beatFocus);
  };
  const announceAll = (): void => {
    if (!canAnnounce()) return;
    for (const conversationId of holders.keys()) emit(CLIENT_EVENTS.VIEWING_START, conversationId);
  };
  const rejoin = (): void => {
    announceAll();
    if (isFocused()) beatFocus();
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
    focusChanged,
  };
  transport = own;

  const onAuthenticated = (): void => {
    authenticated = true;
    store.getState().clear();
    rejoin();
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
    const focus = payload.focus === true;
    if (!focus) {
      const focusKey = `focus\u0000${conversationId}\u0000${userId}`;
      clearTimeout(restTimers.get(focusKey));
      restTimers.delete(focusKey);
      store.getState().blur(conversationId, userId);
    }
    const key = `${focus ? 'focus' : 'stir'}\u0000${conversationId}\u0000${userId}`;
    clearTimeout(restTimers.get(key));
    if (focus) store.getState().focus(conversationId, userId);
    else store.getState().stir(conversationId, userId);
    restTimers.set(
      key,
      setTimeout(() => {
        restTimers.delete(key);
        if (focus) store.getState().blur(conversationId, userId);
        else store.getState().rest(conversationId, userId);
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
    if (visibility.visibilityState() === 'visible') rejoin();
  };

  socket.on(SERVER_EVENTS.AUTHENTICATED, onAuthenticated);
  socket.on('disconnect', onDisconnect);
  socket.on(SERVER_EVENTS.VIEWING_START, onStart);
  socket.on(SERVER_EVENTS.VIEWING_STOP, onStop);
  socket.on(SERVER_EVENTS.VIEWING_SNAPSHOT, onSnapshot);
  socket.on(SERVER_EVENTS.VIEWING_ACTIVITY, onActivity);
  const unwatch = visibility.onChange(onVisibility);
  announceAll();
  focusChanged();

  return () => {
    if (transport === own) transport = null;
    socket.off(SERVER_EVENTS.AUTHENTICATED, onAuthenticated);
    socket.off('disconnect', onDisconnect);
    socket.off(SERVER_EVENTS.VIEWING_START, onStart);
    socket.off(SERVER_EVENTS.VIEWING_STOP, onStop);
    socket.off(SERVER_EVENTS.VIEWING_SNAPSHOT, onSnapshot);
    socket.off(SERVER_EVENTS.VIEWING_ACTIVITY, onActivity);
    stopRestTimers();
    stopFocusBeat();
    unwatch();
  };
}
