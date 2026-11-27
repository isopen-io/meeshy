import type { QueuedMessagePayload } from '@meeshy/shared/types/delivery-queue';

/**
 * L'ORDRE de la file de remise, partagé par ses deux tranches (Redis et le tas,
 * #19946) : extrait de `RedisDeliveryQueue.ts` pour que le tas l'applique sans
 * le réécrire.
 */

export function normalizedEventType(entry: QueuedMessagePayload): string {
  return entry.eventType ?? 'new';
}

export function dedupIdentity(entry: QueuedMessagePayload): string {
  return `${entry.dedupKey ?? entry.messageId}\u0000${normalizedEventType(entry)}`;
}

// FIFO replay order across the memory-fallback and Redis-backed slices. The two
// can interleave in time: a message enqueued to Redis while it was healthy may
// be FOLLOWED by an edit/delete for the SAME message that fell back to memory
// during a transient Redis blip. Concatenating memory-first would then replay
// the edit BEFORE the `new` it targets (see the FIFO invariant on ENQUEUE_DEDUP_LUA),
// and the recipient's client drops an edit for a message it hasn't received yet.
// Every entry carries a monotonic `enqueuedAt` stamped at enqueue time, so sort
// by it to restore true FIFO. `Array.prototype.sort` is stable, so entries that
// share a timestamp keep their memory-before-Redis order — preserving the
// outage-only reconciliation contract (memory entries queued during a full
// outage still lead).
//
// `enqueuedAt` est stampé à l'enfilage, donc TOUJOURS présent — pour ce qu'on
// ÉCRIT. Ce qu'on RELIT est autre chose : `parseRawEntries` fait
// `JSON.parse(…) as QueuedMessagePayload`, une AFFIRMATION qui ne vérifie aucun
// champ, sur des octets vieux de 48 h au plus (`DELIVERY_QUEUE_TTL_SECONDS`).
// `new Date(undefined).getTime()` rend `NaN`, et la spec (SortCompare, §23.1.3.30)
// mappe un comparateur qui rend `NaN` sur `+0` : l'entrée se déclare ÉGALE à
// toutes les autres.
//
// Un comparateur non transitif ne désordonne pas seulement l'entrée fautive, il
// rend le tri indéfini pour les entrées SAINES. Mesuré sur cinq entrées :
// `a, c, BAD, b, d` — deux entrées parfaitement datées inversées par la présence
// d'une troisième qui ne l'est pas. C'est exactement l'isolation que la couche
// de désérialisation promet trois fonctions plus haut (« so one corrupt entry
// can never poison a whole drain/peek ») et qui s'arrêtait au `JSON.parse`.
//
// `Number.isFinite` rend donc le comparateur TOTAL : une entrée sans instant
// lisible n'en a pas, et se range à la fin — déterministe, et sans opinion sur
// l'ordre de celles qui en ont un. La ranger plutôt que la JETER est délibéré :
// son message est toujours en base et le drain, destructif, est la seule
// occasion de le rejouer.
export function enqueuedAtMillis(entry: QueuedMessagePayload): number {
  const millis = new Date(entry.enqueuedAt).getTime();
  return Number.isFinite(millis) ? millis : Number.POSITIVE_INFINITY;
}

export function byEnqueuedAt(a: QueuedMessagePayload, b: QueuedMessagePayload): number {
  const left = enqueuedAtMillis(a);
  const right = enqueuedAtMillis(b);
  // Deux entrées non datées : `Infinity - Infinity` rend `NaN`, ce qui
  // réintroduirait le défaut entre elles. Le tri étant stable, `0` les laisse
  // dans leur ordre d'arrivée.
  if (left === right) return 0;
  return left - right;
}
