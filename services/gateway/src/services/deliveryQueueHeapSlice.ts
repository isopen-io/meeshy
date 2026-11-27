import type { QueuedMessagePayload } from '@meeshy/shared/types/delivery-queue';
import { destroyedAtBound } from './deliveryQueueBound';
import { dedupIdentity, enqueuedAtMillis, normalizedEventType } from './deliveryQueueOrdering';

/**
 * LE TAS DE LA FILE DE REMISE, et ses DEUX usages (#19946).
 *
 * Le tas tient deux choses que rien ne relie :
 * - `outage` — ce qui n'a pas pu atteindre Redis pendant une panne, et ce
 *   qu'une remise Redis ratée y repose (scellé) ;
 * - `unsealed` — depuis #19827, ce qu'on n'a pas PU sceller alors que Redis
 *   se portait bien (en clair, borné en plus par `UnsealedRetentionBudget`).
 *
 * Ils partageaient UNE carte, donc UN plafond de comptes : un incident de la
 * base des clés évinçait l'arriéré d'une panne Redis qui n'avait rien à voir,
 * et réciproquement — et les deux dépendant de Mongo, leur superposition est
 * le cas probable. Chaque usage a désormais sa carte et son plafond : le tas
 * peut tenir deux fois 1 000 × 50 entrées, soit 100 000 charges au pire, la
 * moitié en clair sous le budget de #19945 (5 000 entrées, 16 Mio).
 *
 * Note de capacité : sur ces deux chemins le plafond par compte est
 * `HEAP_MAX_PER_ACCOUNT` = 50, DIX fois moins que les 500 de la tranche
 * durable (`DELIVERY_QUEUE_MAX_PER_USER`). Pendant un incident, l'arriéré
 * qu'un absent peut retrouver chute donc d'un facteur 10 — et chaque entrée
 * détruite à ce plafond se nomme.
 */
export const HEAP_MAX_ACCOUNTS = 1000;
export const HEAP_MAX_PER_ACCOUNT = 50;

export type HeapUse = 'outage' | 'unsealed';

export type HeapSlice = {
  readonly use: HeapUse;
  readonly buckets: Map<string, QueuedMessagePayload[]>;
};

/** Ce qu'un plafond vient de détruire, tel que `noteBoundEviction` le nomme. */
export type BoundEviction = {
  readonly scope: 'enqueue' | 'restore';
  readonly slice: 'redis' | 'memory';
  readonly userId: string;
  readonly destroyed: number;
  readonly cap: number;
  readonly bound: 'per-account' | 'accounts';
  readonly heap?: HeapUse;
};

export type BoundEvictionNote = (eviction: BoundEviction) => void;

export type HeapPutOutcome = 'pushed' | 'dedup' | 'supersede';

export const heapSlice = (use: HeapUse, buckets: Map<string, QueuedMessagePayload[]> = new Map()): HeapSlice => ({ use, buckets });

/**
 * Le plafond de COMPTES : un compte de plus évince le plus ancien de CET
 * usage, et dit combien d'entrées partent avec lui. Avant #19946, ce
 * cinquième chemin ne disait que QUI.
 */
function makeRoomForAccount(slice: HeapSlice, userId: string, scope: BoundEviction['scope'], note: BoundEvictionNote): void {
  if (!(slice.buckets.size >= HEAP_MAX_ACCOUNTS) || slice.buckets.has(userId)) return;
  const oldest = slice.buckets.keys().next().value;
  /* istanbul ignore next -- la carte a toujours une clé quand elle est pleine */
  if (oldest === undefined) return;
  note({
    scope, slice: 'memory', heap: slice.use, bound: 'accounts',
    userId: oldest, destroyed: slice.buckets.get(oldest)?.length ?? 0, cap: HEAP_MAX_ACCOUNTS,
  });
  slice.buckets.delete(oldest);
}

/**
 * Au-delà du plafond par compte, ce qui part est le plus ANCIEN par
 * `enqueuedAt`, jamais la tête du tableau : un événement mutable supplanté
 * sur place garde son créneau d'origine avec un `enqueuedAt` plus récent, et
 * trancher par créneau pourrait détruire l'édition la plus fraîche. Une
 * entrée non datée se range à la FIN (`enqueuedAtMillis`), donc ne s'évince
 * pas. Les survivantes gardent leur ordre d'insertion, dont dépend le
 * départage mémoire-avant-Redis de `byEnqueuedAt`.
 */
function withinAccountCap(slice: HeapSlice, userId: string, entries: readonly QueuedMessagePayload[], note: BoundEvictionNote): QueuedMessagePayload[] {
  const evictCount = entries.length - HEAP_MAX_PER_ACCOUNT;
  if (evictCount <= 0) return [...entries];
  const evicted = new Set(
    entries
      .map((entry, index) => ({ ts: enqueuedAtMillis(entry), index }))
      .sort((a, b) => (a.ts === b.ts ? 0 : a.ts - b.ts))
      .slice(0, evictCount)
      .map(({ index }) => index),
  );
  note({ scope: 'enqueue', slice: 'memory', heap: slice.use, bound: 'per-account', userId, destroyed: evictCount, cap: HEAP_MAX_PER_ACCOUNT });
  return entries.filter((_, index) => !evicted.has(index));
}

/**
 * Pose une entrée dans le tas. Un `new` déjà présent est dédoublonné ; un
 * événement mutable déjà présent est supplanté SUR PLACE (le jumeau Redis le
 * repousse en queue, parce que son plafond tranche par créneau ; celui-ci
 * évince par `enqueuedAt`, garder le créneau n'y coûte rien).
 */
export function putInHeap(slice: HeapSlice, userId: string, entry: QueuedMessagePayload, note: BoundEvictionNote): HeapPutOutcome {
  makeRoomForAccount(slice, userId, 'enqueue', note);
  const existing = slice.buckets.get(userId) ?? [];
  const identity = dedupIdentity(entry);
  const dupIndex = existing.findIndex((queued) => dedupIdentity(queued) === identity);
  if (dupIndex !== -1 && normalizedEventType(entry) === 'new') return 'dedup';
  if (dupIndex !== -1) {
    slice.buckets.set(userId, existing.map((queued, index) => (index === dupIndex ? entry : queued)));
    return 'supersede';
  }
  slice.buckets.set(userId, withinAccountCap(slice, userId, [...existing, entry], note));
  return 'pushed';
}

/**
 * Remet en tête les entrées qu'un drain n'a pas pu rouvrir. `slice(-N)` garde
 * les N DERNIÈRES, donc ce que le plafond détruit ici est pris en TÊTE — les
 * entrées qu'on vient de remettre : une remise peut détruire exactement ce
 * qu'elle remet, et c'est pourquoi elle le dit.
 */
export function restoreInHeap(slice: HeapSlice, userId: string, live: readonly QueuedMessagePayload[], note: BoundEvictionNote): void {
  const existing = slice.buckets.get(userId) ?? [];
  const present = new Set(existing.map(dedupIdentity));
  const restored = live.filter((entry) => !present.has(dedupIdentity(entry)));
  if (restored.length === 0) return;
  makeRoomForAccount(slice, userId, 'restore', note);
  const withRestored = [...restored, ...existing];
  note({
    scope: 'restore', slice: 'memory', heap: slice.use, bound: 'per-account', userId,
    destroyed: destroyedAtBound(withRestored.length, HEAP_MAX_PER_ACCOUNT), cap: HEAP_MAX_PER_ACCOUNT,
  });
  slice.buckets.set(userId, withRestored.slice(-HEAP_MAX_PER_ACCOUNT));
}

/** Retire et rend l'arriéré d'un compte, tous usages confondus. */
export function takeFromHeap(slices: readonly HeapSlice[], userId: string): QueuedMessagePayload[] {
  return slices.flatMap((slice) => {
    const entries = slice.buckets.get(userId) ?? [];
    slice.buckets.delete(userId);
    return entries;
  });
}

export function countInHeap(slices: readonly HeapSlice[], userId: string): number {
  return slices.reduce((total, slice) => total + (slice.buckets.get(userId)?.length ?? 0), 0);
}

/**
 * Retire de chaque usage les entrées que `doomed` désigne, et rend leur
 * nombre. Un compte vidé quitte la carte. Le tas ne porte aucune clé Redis,
 * donc l'index inverse ne le désigne pas : ce balayage par usage est le seul
 * qui retire le clair d'un message détruit qui y vit.
 */
export function sweepHeap(slices: readonly HeapSlice[], doomed: (entry: QueuedMessagePayload) => boolean): number {
  return slices.reduce((removed, slice) => removed + [...slice.buckets.entries()].reduce((count, [userId, entries]) => {
    const kept = entries.filter((entry) => !doomed(entry));
    if (kept.length === entries.length) return count;
    if (kept.length === 0) slice.buckets.delete(userId);
    else slice.buckets.set(userId, kept);
    return count + entries.length - kept.length;
  }, 0), 0);
}
