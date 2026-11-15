import type { LiveSocketWatcher } from '@/lib/api/live-socket-watchers';

export type WatchRealtime = (watcher: LiveSocketWatcher) => () => void;

/**
 * La socket vivante, chargée À LA DEMANDE : le chunk `realtime` est à son plafond
 * de poids, et le chrome différé (Bring, talkie) s'y accroche sans l'embarquer.
 */
export const watchRealtime: WatchRealtime = (watcher) => {
  let live = true;
  let stop: (() => void) | null = null;
  void import('@/lib/api/realtime').then(
    ({ watchLiveSocket }) => {
      if (live) stop = watchLiveSocket(watcher);
    },
    () => undefined,
  );
  return () => {
    live = false;
    stop?.();
  };
};
