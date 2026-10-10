import { callStore, type CallStoreApi } from './call-store';
import { shellCallSnapshot } from './shell-call';

/**
 * **L'ÉCRAN RESTE ALLUMÉ PENDANT UN APPEL** (#8701) — la coque Android pose
 * `FLAG_KEEP_SCREEN_ON` (`MeeshyCallPlugin.startCallService`), iOS
 * `isIdleTimerDisabled` (`CallManager.swift`). Le web demande un verrou
 * d'écran tant que l'appel vit (mêmes phases que le service de la coque :
 * `shellCallSnapshot`), et le relâche à la fin.
 *
 * Le navigateur relâche seul le verrou quand la page est masquée : il est
 * redemandé au retour au premier plan. Un refus (politique de permissions,
 * batterie faible) n'est pas retenté à chaque changement du magasin — il
 * l'est au prochain retour au premier plan ou au prochain appel.
 */

export type WakeLockSentinelLike = {
  readonly released: boolean;
  readonly release: () => Promise<void>;
};

export type WakeLockLike = { readonly request: (type: 'screen') => Promise<WakeLockSentinelLike> };

export type CallWakeLockEnvironment = {
  readonly wakeLock: WakeLockLike | undefined;
  readonly store: Pick<CallStoreApi, 'getState' | 'subscribe'>;
  readonly visible: () => boolean;
  readonly onVisibilityChange: (listener: () => void) => () => void;
};

export function bindCallWakeLock(env: CallWakeLockEnvironment): () => void {
  const { wakeLock } = env;
  if (wakeLock === undefined) return () => undefined;
  let held: WakeLockSentinelLike | null = null;
  let pending = false;
  let refused = false;

  const live = (): boolean => shellCallSnapshot(env.store.getState().call).active;
  const letGo = (sentinel: WakeLockSentinelLike): void => {
    if (!sentinel.released) void sentinel.release().catch(() => undefined);
  };

  const acquire = (): void => {
    if (pending || refused || (held !== null && !held.released) || !env.visible()) return;
    pending = true;
    wakeLock.request('screen').then(
      (sentinel) => {
        pending = false;
        if (live()) held = sentinel;
        else letGo(sentinel);
      },
      () => {
        pending = false;
        refused = true;
      },
    );
  };

  const release = (): void => {
    refused = false;
    if (held !== null) letGo(held);
    held = null;
  };

  const sync = (): void => (live() ? acquire() : release());
  const stopStore = env.store.subscribe(sync);
  const stopVisibility = env.onVisibilityChange(() => {
    refused = false;
    sync();
  });
  sync();
  return () => {
    stopStore();
    stopVisibility();
    release();
  };
}

let started = false;

/** Les réels : `navigator.wakeLock` et la visibilité du document. */
export function startCallWakeLock(): void {
  if (started || typeof navigator === 'undefined' || typeof document === 'undefined') return;
  started = true;
  bindCallWakeLock({
    wakeLock: (navigator as Navigator & { readonly wakeLock?: WakeLockLike }).wakeLock,
    store: callStore,
    visible: () => document.visibilityState === 'visible',
    onVisibilityChange: (listener) => {
      document.addEventListener('visibilitychange', listener);
      return () => document.removeEventListener('visibilitychange', listener);
    },
  });
}
