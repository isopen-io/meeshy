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

  /**
   * SE DÉTACHER EST AUSSI FAILLIBLE QUE S'ACCROCHER (#20304). La règle du
   * module — « un observateur qui échoue ne retient pas les autres » — ne
   * distingue pas les deux sens, et seul l'un des deux était gardé : un adieu
   * qui lève interrompait la boucle et laissait les observateurs SUIVANTS
   * accrochés à la socket morte, ou empêchait une inscription de partir.
   * Aucun détachement du dépôt ne lève aujourd'hui (ce sont des `socket.off`)
   * — c'était donc un piège armé, pas une panne.
   */
  const release = (detach: (() => void) | null): void => {
    try {
      detach?.();
    } catch {
      /* L'adieu raté ne regarde que lui. */
    }
  };

  return {
    /** La connexion courante a changé (`null` : fermée) : tous se détachent de l'ancienne, puis s'accrochent à la nouvelle. */
    connect: (socket: SocketClient | null): void => {
      for (const { detach } of registrations.values()) release(detach);
      current = socket;
      for (const [id, { watcher }] of registrations) registrations.set(id, attach(watcher));
    },
    /** Observe la socket courante et toutes les suivantes, jusqu'à ce qu'on cesse. */
    watch: (watcher: LiveSocketWatcher): (() => void) => {
      const id = Symbol('live-socket-watcher');
      registrations.set(id, attach(watcher));
      return () => {
        release(registrations.get(id)?.detach ?? null);
        registrations.delete(id);
      };
    },
  };
}
