/**
 * L'HORLOGE À INTERVALLE — GÉNÉRALISATION de `minute-clock.ts` (#5816, E6) :
 * un SEUL minuteur DOM par intervalle, partagé par tous les abonnés, arrêté
 * dès que le dernier se désabonne. `minuteClock` (`60_000`) sert les rangées
 * de la Lentille ; `secondClock` (`1_000`) sert le compte à rebours du lien
 * magique (`use-countdown.ts`) — même dispositif, jamais une seconde copie.
 */

export type IntervalClockScheduler = {
  readonly setInterval: (callback: () => void, delayMs: number) => unknown;
  readonly clearInterval: (id: unknown) => void;
  readonly now: () => number;
};

export type IntervalClock = {
  /** Notifie `listener(now())` à chaque intervalle. Rend la fonction de désabonnement. */
  subscribe(listener: (now: number) => void): () => void;
};

const defaultScheduler: IntervalClockScheduler = {
  setInterval: (callback, delayMs) => setInterval(callback, delayMs),
  clearInterval: (id) => clearInterval(id as ReturnType<typeof setInterval>),
  now: () => Date.now(),
};

export function createIntervalClock(intervalMs: number, scheduler: IntervalClockScheduler = defaultScheduler): IntervalClock {
  const listeners = new Set<(now: number) => void>();
  let timer: unknown = null;

  const tick = (): void => {
    const now = scheduler.now();
    for (const listener of listeners) listener(now);
  };

  return {
    subscribe(listener) {
      listeners.add(listener);
      if (timer === null) timer = scheduler.setInterval(tick, intervalMs);
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

/** L'horloge PARTAGÉE à la seconde — un seul `setInterval` pour tout compte à rebours de l'application. */
export const secondClock = createIntervalClock(1_000);
