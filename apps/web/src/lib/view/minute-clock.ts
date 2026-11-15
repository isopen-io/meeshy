import { createIntervalClock, type IntervalClock, type IntervalClockScheduler } from './interval-clock';

/**
 * L'HORLOGE À LA MINUTE — un SEUL minuteur, partagé par toutes les rangées de
 * la Lentille qui affichent une heure relative (`LensTime`, `components/
 * lens-time.tsx`). Miroir `LentilleRowTimestamp`'s `TimelineView(.periodic(by:
 * 60))` (`LentilleConversationRow.swift:854-870`) — sauf que SwiftUI arme un
 * minuteur PAR VUE alors qu'ici un seul minuteur DOM sert N abonnés : une
 * Lentille de 200 conversations ne doit ouvrir qu'UN SEUL `setInterval`,
 * jamais un par ligne visible (dimension 3, « aucune rétention non bornée »).
 *
 * DEPUIS #5816 (E6) : ce module est une PROJECTION de `interval-clock.ts`
 * (`createIntervalClock(60_000, …)`) — la généralisation qui sert aussi le
 * compte à rebours du lien magique (`secondClock`, `createIntervalClock(1_000, …)`).
 * Le corps a DÉMÉNAGÉ ; le contrat public (`MinuteClockScheduler`,
 * `MinuteClock`, `createMinuteClock`, `minuteClock`) est inchangé.
 */

export type MinuteClockScheduler = IntervalClockScheduler;
export type MinuteClock = IntervalClock;

const MINUTE_MS = 60_000;

export function createMinuteClock(scheduler?: MinuteClockScheduler): MinuteClock {
  return scheduler === undefined ? createIntervalClock(MINUTE_MS) : createIntervalClock(MINUTE_MS, scheduler);
}

/** L'horloge PARTAGÉE de l'application — un seul `setInterval` pour toute la Lentille. */
export const minuteClock = createMinuteClock();
