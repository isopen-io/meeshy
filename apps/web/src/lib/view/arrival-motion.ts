/**
 * **SEUL LE DERNIER MESSAGE ARRIVÉ S'ANIME** (#11223, décision porteur
 * 2026-10-24) — la règle pure, jumelle d'iOS (`MessageArrivalMotion.swift`) :
 * même énoncé, même fenêtre, mêmes quatre causes.
 *
 * Parmi les messages NOUVEAUX d'un rendu du fil, seul le plus récent reçoit
 * l'animation d'arrivée, et seulement s'il arrive EN TEMPS RÉEL. Un lot chargé
 * d'un coup apparaît sans animation :
 *
 * - `first-render` — aucun message en commun avec le rendu précédent : c'est
 *   l'ouverture du fil, ou une fenêtre entièrement neuve (une autre
 *   conversation, un saut vers un message lointain), jamais une arrivée ;
 * - `pagination` — le plus récent des nouveaux n'est pas en queue du fil :
 *   une page plus ancienne s'est préfixée ;
 * - `catch-up` — le plus récent des nouveaux date de plus de
 *   `ARRIVAL_FRESHNESS_MS` : la reconnexion rattrape ce qui a été dit pendant
 *   la coupure, ce n'est pas ce qui se dit maintenant ;
 * - `realtime` — tout le reste : un message du pair, ou mon propre envoi.
 *
 * La cause se lit sur le RENDU lui-même, jamais sur un canal de côté : le
 * socket, la relecture TanStack et l'outbox écrivent tous dans la même liste,
 * et c'est elle que le lecteur voit changer. Une horloge d'appareil en retard
 * sur le serveur (date future) reste du temps réel — l'écart est borné par le
 * même `<=`, jamais par une valeur absolue. Une date illisible (`NaN`) ne
 * prouve aucune fraîcheur : elle tombe en rattrapage, comme une date absente
 * côté iOS.
 */

export type ArrivalCause = 'first-render' | 'realtime' | 'pagination' | 'catch-up';

/** Un message vu par la règle : son identité stable et sa date de création (ms). */
export type ArrivalEntry = { readonly key: string; readonly createdAt: number };

export type ArrivalInput = {
  /** Les clés du rendu PRÉCÉDENT — aucune en commun avec `next` ⇒ premier rendu. */
  readonly previous: ReadonlySet<string>;
  /** Le rendu courant, du plus ancien au plus récent (l'ordre du fil). */
  readonly next: readonly ArrivalEntry[];
  readonly now: number;
};

/** Au-delà, un message neuf est un rattrapage, pas une arrivée. Même valeur qu'iOS. */
export const ARRIVAL_FRESHNESS_MS = 30_000;

/** La durée de l'animation d'arrivée (`.thread-row-arrival`, `thread-scene.css`). */
export const ARRIVAL_MOTION_MS = 320;

const newestNewOf = ({ previous, next }: ArrivalInput): ArrivalEntry | undefined =>
  next.findLast((entry) => !previous.has(entry.key));

export function arrivalCauseOf(input: ArrivalInput): ArrivalCause | null {
  const newest = newestNewOf(input);
  if (newest === undefined) return null;
  if (!input.next.some((entry) => input.previous.has(entry.key))) return 'first-render';
  if (newest !== input.next.at(-1)) return 'pagination';
  if (!(input.now - newest.createdAt <= ARRIVAL_FRESHNESS_MS)) return 'catch-up';
  return 'realtime';
}

/** La clé du SEUL message à animer, ou `null`. Réduire les animations ⇒ toujours `null`. */
export function animatedArrival(input: ArrivalInput & { readonly reduceMotion: boolean }): string | null {
  if (input.reduceMotion) return null;
  if (arrivalCauseOf(input) !== 'realtime') return null;
  return input.next.at(-1)?.key ?? null;
}
