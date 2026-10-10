import type { SocketClient } from '@/lib/net/socket';

/**
 * **S'ACCROCHER À LA SOCKET VIVANTE** (#9899) — la connexion temps réel est
 * privée à `realtime.ts` et se reconstruit à chaque changement d'identité. Un
 * écran qui veut écouter UN événement le temps où il est ouvert (le fil, pour
 * `message:translation-shared`) ne peut ni capturer la socket — elle sera
 * remplacée — ni ajouter son écoute à `socket.ts`, qui est sur le chemin du
 * démarrage. Il s'inscrit ici : l'observateur reçoit la socket courante, rend
 * de quoi s'en détacher, et la connexion suivante l'accroche à la nouvelle
 * socket sans qu'il ait à le savoir.
 *
 * Même doctrine que `bridgeCalls` : les écoutes d'une connexion se défont avant
 * celles de la suivante, et un observateur qui échoue ne retient pas les autres.
 */
export type LiveSocketWatcher = (socket: SocketClient) => () => void;

type Registration = { readonly watcher: LiveSocketWatcher; readonly detach: (() => void) | null };

export function createLiveSocketWatchers() {
  let current: SocketClient | null = null;
  const registrations = new Map<symbol, Registration>();

  const attach = (watcher: LiveSocketWatcher): Registration => {
    if (current === null) return { watcher, detach: null };
    try {
      return { watcher, detach: watcher(current) };
    } catch {
      return { watcher, detach: null };
    }
  };

  return {
    /** La connexion courante a changé (`null` : fermée) : tous se détachent de l'ancienne, puis s'accrochent à la nouvelle. */
    connect: (socket: SocketClient | null): void => {
      for (const { detach } of registrations.values()) detach?.();
      current = socket;
      for (const [id, { watcher }] of registrations) registrations.set(id, attach(watcher));
    },
    /** Observe la socket courante et toutes les suivantes, jusqu'à ce qu'on cesse. */
    watch: (watcher: LiveSocketWatcher): (() => void) => {
      const id = Symbol('live-socket-watcher');
      registrations.set(id, attach(watcher));
      return () => {
        registrations.get(id)?.detach?.();
        registrations.delete(id);
      };
    },
  };
}
