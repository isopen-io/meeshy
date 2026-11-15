import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events/event-names';

import type { SocketClient } from '@/lib/net/socket';

import type { LivePresence, PresenceStoreApi } from './presence-store';

export { createPresenceStore, livePresenceOf, presenceStore } from './presence-store';

/**
 * LA LIAISON de la présence vivante (#10571) — chargée avec la connexion
 * temps réel, jamais dans le socle : le magasin (`presence-store.ts`), que lit
 * chaque pastille, ne tire pas les noms d'événements dans la première peinture.
 */

type ServedStatus = { readonly userId: string; readonly isOnline: boolean; readonly lastActiveAt?: unknown };

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

const isServedStatus = (value: unknown): value is ServedStatus =>
  isRecord(value) && typeof value.userId === 'string' && typeof value.isOnline === 'boolean';

const lastActiveOf = (value: unknown): string | null => {
  if (typeof value === 'string') return value;
  if (value instanceof Date) return value.toISOString();
  return null;
};

const entryOf = (status: ServedStatus): readonly [string, LivePresence] => [
  status.userId,
  { isOnline: status.isOnline, lastActiveAt: lastActiveOf(status.lastActiveAt) },
];

export function bindPresenceLive(params: {
  readonly socket: SocketClient;
  readonly store: PresenceStoreApi;
  readonly viewerId: () => string;
  readonly now?: () => number;
}): () => void {
  const { socket, store, viewerId, now = Date.now } = params;

  const onStatus = (payload: unknown): void => {
    if (!isServedStatus(payload)) return;
    const [userId, presence] = entryOf(payload);
    store.getState().put(userId, presence);
  };
  const onSnapshot = (payload: unknown): void => {
    if (!isRecord(payload) || !Array.isArray(payload.users)) return;
    store.getState().putAll(payload.users.filter(isServedStatus).map(entryOf));
  };
  /* LA FRAPPE NE RAFRAÎCHIT QUE L'ACTIVITÉ (#11412) : forcer `isOnline` gardait
     vert cinq minutes un pair non connecté, puis plus rien — elle le fait
     décroître vert → orange → gris, la connexion restant celle servie. */
  const onTyping = (payload: unknown): void => {
    if (!isRecord(payload) || typeof payload.userId !== 'string' || payload.userId === viewerId()) return;
    const isOnline = store.getState().byUser[payload.userId]?.isOnline ?? false;
    store.getState().put(payload.userId, { isOnline, lastActiveAt: new Date(now()).toISOString() });
  };
  const onDisconnect = (): void => store.getState().markAllOffline();

  socket.on(SERVER_EVENTS.USER_STATUS, onStatus);
  socket.on(SERVER_EVENTS.PRESENCE_SNAPSHOT, onSnapshot);
  socket.on(SERVER_EVENTS.TYPING_START, onTyping);
  socket.on('disconnect', onDisconnect);

  return () => {
    socket.off(SERVER_EVENTS.USER_STATUS, onStatus);
    socket.off(SERVER_EVENTS.PRESENCE_SNAPSHOT, onSnapshot);
    socket.off(SERVER_EVENTS.TYPING_START, onTyping);
    socket.off('disconnect', onDisconnect);
    store.getState().clear();
  };
}
