/**
 * L'HORLOGE À LA MINUTE — un SEUL minuteur, partagé par toutes les rangées de
 * la Lentille qui affichent une heure relative (`LensTime`, `components/
 * lens-time.tsx`). Miroir `LentilleRowTimestamp`'s `TimelineView(.periodic(by:
 * 60))` (`LentilleConversationRow.swift:854-870`) — sauf que SwiftUI arme un
 * minuteur PAR VUE alors qu'ici un seul minuteur DOM sert N abonnés : une
 * Lentille de 200 conversations ne doit ouvrir qu'UN SEUL `setInterval`,
 * jamais un par ligne visible (dimension 3, « aucune rétention non bornée »).
 *
 * Aucun minuteur tant que personne n'est abonné ; le dernier désabonnement
 * l'éteint. Le PLANIFICATEUR (`setInterval`/`clearInterval`/`now`) est
 * INJECTABLE — même discipline que `reading-mode/scene.ts` (`now`) — pour
 * qu'un témoin puisse avancer le temps sans horloge réelle.
 */

export type MinuteClockScheduler = {
  readonly setInterval: (callback: () => void, delayMs: number) => unknown;
  readonly clearInterval: (id: unknown) => void;
  readonly now: () => number;
};

export type MinuteClock = {
  /** Notifie `listener(now())` à chaque minute. Rend la fonction de désabonnement. */
  subscribe(listener: (now: number) => void): () => void;
};

const MINUTE_MS = 60_000;

const defaultScheduler: MinuteClockScheduler = {
  setInterval: (callback, delayMs) => setInterval(callback, delayMs),
  clearInterval: (id) => clearInterval(id as ReturnType<typeof setInterval>),
  now: () => Date.now(),
};

export function createMinuteClock(scheduler: MinuteClockScheduler = defaultScheduler): MinuteClock {
  const listeners = new Set<(now: number) => void>();
  let timer: unknown = null;

  const tick = (): void => {
    const now = scheduler.now();
    for (const listener of listeners) listener(now);
  };

  return {
    subscribe(listener) {
      listeners.add(listener);
      if (timer === null) timer = scheduler.setInterval(tick, MINUTE_MS);
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0 && timer !== null) {
          scheduler.clearInterval(timer);
          timer = null;
        }
      };
    },
  };
}

/** L'horloge PARTAGÉE de l'application — un seul `setInterval` pour toute la Lentille. */
export const minuteClock = createMinuteClock();
