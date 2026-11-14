import { SHARED_LOCATION_CLIENT_EVENTS } from '@meeshy/shared/types/socketio-events/shared-location-event-names';

import { sessionStore, type SessionStoreApi } from '@/lib/api/session';
import { watchRealtime, type WatchRealtime } from '@/lib/api/watch-realtime';
import type { SocketClient } from '@/lib/net/socket';
import { safeLocalStorage, type SafeStorage } from '@/lib/storage';

import { readSharedLocationAck, sharedLocationFixOf, sharedLocationStopAccepted, type SharedLocationVerdict } from './shared-location-sending';
import { sharedLocationWithdrawalsKey } from './shared-location-roster';
import { createSharedLocationSharingCenter, type SharedLocationEmitter, type SharedLocationFixSource, type SharedLocationSharingCenter } from './shared-location-sharing';

/**
 * **LE CENTRE DE PARTAGE BRANCHÉ SUR LE NAVIGATEUR ET LA SOCKET VIVANTE** (#18345) —
 * `navigator.geolocation` pour les relevés (permission « pendant l'utilisation » du
 * navigateur), la socket temps réel pour `location:share-*`, `localStorage` par compte
 * pour la liste (identifiants et échéances, jamais une position). Un onglet fermé ne
 * publie plus rien : le terme serveur coupe le partage.
 */

/** Au-delà, l'accusé est réputé perdu : le serveur a PU prendre l'envoi (`unconfirmed`). */
export const SHARED_LOCATION_ACK_MS = 8_000;

const OFFLINE: SharedLocationVerdict = { kind: 'refused', outcome: 'offline' };
const UNCONFIRMED: SharedLocationVerdict = { kind: 'refused', outcome: 'unconfirmed' };

export function socketSharedLocationEmitter(socket: () => SocketClient | null): SharedLocationEmitter {
  const emit = (event: string, payload: unknown): Promise<unknown> | null => {
    const live = socket();
    if (live === null || !live.connected || live.emitWithAck === undefined) return null;
    return live.emitWithAck(event, payload, SHARED_LOCATION_ACK_MS);
  };
  const verdictOf = (sent: Promise<unknown> | null): Promise<SharedLocationVerdict> =>
    sent === null ? Promise.resolve(OFFLINE) : sent.then(readSharedLocationAck, () => UNCONFIRMED);
  return {
    start: (payload) => verdictOf(emit(SHARED_LOCATION_CLIENT_EVENTS.SHARED_LOCATION_START, payload)),
    update: (fix) => verdictOf(emit(SHARED_LOCATION_CLIENT_EVENTS.SHARED_LOCATION_UPDATE, fix)),
    stop: () => {
      const sent = emit(SHARED_LOCATION_CLIENT_EVENTS.SHARED_LOCATION_STOP, {});
      return sent === null ? Promise.resolve(false) : sent.then(sharedLocationStopAccepted, () => false);
    },
  };
}

const PERMISSION_DENIED = 1;
const CURRENT_OPTIONS: PositionOptions = { enableHighAccuracy: true, timeout: 15_000, maximumAge: 30_000 };
const FOLLOW_OPTIONS: PositionOptions = { enableHighAccuracy: true, maximumAge: 10_000 };

const fixOfPosition = (position: GeolocationPosition) =>
  sharedLocationFixOf({ latitude: position.coords.latitude, longitude: position.coords.longitude, accuracy: position.coords.accuracy });

export function browserSharedLocationFixSource(
  geolocation: Geolocation | undefined = globalThis.navigator?.geolocation,
  permissions: Permissions | undefined = globalThis.navigator?.permissions,
): SharedLocationFixSource {
  return {
    /* Sans l'API des permissions, on ne sait pas : on répond non, et le centre s'abstient ou arrête. */
    isGranted: async () => {
      if (permissions === undefined) return false;
      try {
        return (await permissions.query({ name: 'geolocation' })).state === 'granted';
      } catch {
        return false;
      }
    },
    currentFix: () =>
      new Promise((resolve) => {
        if (geolocation === undefined) return resolve({ kind: 'unavailable' });
        geolocation.getCurrentPosition(
          (position) => {
            const fix = fixOfPosition(position);
            resolve(fix === null ? { kind: 'unavailable' } : { kind: 'fix', fix });
          },
          (error) => resolve({ kind: error.code === PERMISSION_DENIED ? 'denied' : 'unavailable' }),
          CURRENT_OPTIONS,
        );
      }),
    follow: (onFix) => {
      if (geolocation === undefined) return () => undefined;
      const id = geolocation.watchPosition(
        (position) => {
          const fix = fixOfPosition(position);
          if (fix !== null) onFix(fix);
        },
        () => undefined,
        FOLLOW_OPTIONS,
      );
      return () => geolocation.clearWatch(id);
    },
  };
}

const rosterKey = (userId: string): string => `meeshy.shared-location.roster.u_${userId}`;

const accountOf = (session: SessionStoreApi): string | null => {
  const state = session.getState().session;
  return state.status === 'authenticated' ? state.user.id : null;
};

/**
 * Le centre du compte connecté : un autre compte repart d'une liste vide, et le centre du
 * compte quitté est abandonné. Chaque socket accrochée (connexion, reconnexion) solde les
 * échéances passées pendant que l'onglet dormait ou était hors ligne, et un autre onglet
 * du même compte qui change la liste (événement `storage`) la fait relire ici.
 */
export function createSharedLocationSharingHolder({
  session,
  watch,
  fixes = browserSharedLocationFixSource(),
  storage = safeLocalStorage(),
  schedule = (delay, run) => {
    const id = setTimeout(run, delay);
    return () => clearTimeout(id);
  },
}: {
  readonly session: SessionStoreApi;
  readonly watch: WatchRealtime;
  readonly fixes?: SharedLocationFixSource;
  readonly storage?: SafeStorage;
  readonly schedule?: (delayMs: number, run: () => void) => () => void;
}) {
  let current: { readonly userId: string; readonly center: SharedLocationSharingCenter; readonly unwatch: () => void } | null = null;

  return (): SharedLocationSharingCenter | null => {
    const userId = accountOf(session);
    if (current !== null && current.userId === userId) return current.center;
    current?.center.abandon();
    current?.unwatch();
    current = null;
    if (userId === null) return null;
    let socket: SocketClient | null = null;
    const center = createSharedLocationSharingCenter({
      emitter: socketSharedLocationEmitter(() => socket),
      fixes,
      storage,
      storageKey: rosterKey(userId),
      schedule,
      owner: userId,
      currentAccount: () => accountOf(session),
    });
    const key = rosterKey(userId);
    const onStorage = (event: StorageEvent): void => {
      if (event.key === null || event.key === key || event.key === sharedLocationWithdrawalsKey(key)) center.refresh();
    };
    globalThis.addEventListener?.('storage', onStorage);
    const unwatchSocket = watch((live) => {
      socket = live;
      const ready = (): void => void center.reconcile();
      live.on('connect', ready);
      if (live.connected) ready();
      return () => {
        live.off('connect', ready);
        if (socket === live) socket = null;
      };
    });
    const unwatch = (): void => {
      unwatchSocket();
      globalThis.removeEventListener?.('storage', onStorage);
    };
    current = { userId, center, unwatch };
    return center;
  };
}

/** Le centre de l'onglet : celui du compte connecté, `null` sans compte. */
export const sharedLocationSharingCenter = createSharedLocationSharingHolder({ session: sessionStore, watch: watchRealtime });
