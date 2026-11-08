import type Redis from 'ioredis';
import type { CacheStore } from './CacheStore';
import type { QueuedMessagePayload } from '@meeshy/shared/types/delivery-queue';
import {
  DELIVERY_QUEUE_MAX_PER_USER,
  DELIVERY_QUEUE_MESSAGE_INDEX_PREFIX,
  DELIVERY_QUEUE_PREFIX,
  DELIVERY_QUEUE_TTL_SECONDS,
} from '@meeshy/shared/types/delivery-queue';
import { carriesMessageText } from '../socketio/queuedEventContract';
import { enhancedLogger } from '../utils/logger-enhanced';
import type { DeliveryQueueSealer } from './deliveryQueueSealing';
import { ServerAtRestUnreadableError } from './messaging/serverAtRest';

const logger = enhancedLogger.child({ module: 'RedisDeliveryQueue' });

// Atomically read-all + delete in a single Redis round-trip.
// Using eval (Lua) instead of pipeline prevents duplicate delivery
// when two workers race to drain the same key simultaneously.
const DRAIN_LUA = `
local entries = redis.call('LRANGE', KEYS[1], 0, -1)
redis.call('DEL', KEYS[1])
return entries
`.trim();

// Idempotent-vs-superseding enqueue, keyed on (dedup identity, eventType).
// The dedup identity is the entry's `dedupKey` if set, else its `messageId` —
// a queued 'new' must NOT block a later 'edited' or 'deleted' for the same
// message — those are distinct events that must all replay on drain, in FIFO
// order, so the recipient's final state matches the sender's (edit/delete
// after an offline 'new' must not be dropped). Reactions set `dedupKey` to
// something finer than messageId (see QueuedMessagePayload.dedupKey) so two
// different reactors on the same message don't collapse into one entry.
//
// 'new' is the only truly IMMUTABLE eventType (a retry of an identical event) —
// a matching 'new' is dropped (return 0), keeping the first entry. Every other
// eventType ('edited'/'deleted'/'reaction-added'/'reaction-removed') is
// MUTABLE: the LATEST payload must win. A message edited twice while a
// recipient is offline enqueues two 'edited' entries under the same dedup
// identity; keeping the first would replay stale intermediate content on
// drain. So a matching mutable entry is SUPERSEDED (return 2) rather than
// dropped — preserving the one-entry-per-(dedup identity, eventType) invariant
// the drain/prune paths rely on while carrying the newest content and
// enqueuedAt.
//
// The superseded entry is REMOVED from its old slot and re-pushed at the TAIL,
// rather than overwritten in place. The two are equivalent for the drain, which
// re-sorts by `enqueuedAt` — but only the tail form keeps slot order equal to
// arrival order, and that equality is what makes the bound below correct: an
// entry superseded in place carries the NEWEST enqueuedAt while sitting at the
// OLDEST slot, so a slot-ordered trim would evict the freshest edit/delete/
// reaction and strand the recipient on stale content. (Exactly the array-slot-
// vs-enqueuedAt divergence the memory path documents at its own eviction.)
// The value is unique per (dedup identity, eventType) — the invariant this
// script maintains and PRUNE_STALE_LUA already relies on — so `LREM … 1 entry`
// removes precisely the entry being superseded.
//
// LTRIM bounds the list to DELIVERY_QUEUE_MAX_PER_USER after every push, from
// the HEAD (`-N .. -1` keeps the newest N arrivals). It is what stops the
// LRANGE scan above from growing with the backlog: the scan can never read more
// than the cap, so the cost of one enqueue no longer depends on how much is
// already queued for that user. See DELIVERY_QUEUE_MAX_PER_USER for the three
// costs this bounds. The supersede path needs no trim — it removes one entry
// and pushes one, leaving the length unchanged.
//
// #16706 — l'INDEX INVERSE `messageId -> clés de file` s'écrit ICI, dans le
// MÊME script, et c'est tout l'argument de cette piste : le tableau de coûts de
// l'issue la chiffrait à « une écriture Redis de plus par destinataire hors
// ligne, sur le chemin le plus chaud », ce qui est vrai d'une COMMANDE et faux
// d'un ALLER-RETOUR. Deux `redis.call` de plus dans un script déjà en vol ne
// coûtent pas une latence réseau ; un `sadd` séparé en coûterait une, et
// DOUBLERAIT le chemin d'enfilage, qui fait déjà une passe par destinataire.
//
// Il n'est écrit que pour les familles qui portent du TEXTE (ARGV[6] === '1',
// décidé par `carriesMessageText` côté TypeScript) : une suppression, une
// épingle ou une réaction n'a pas de clair à purger, donc rien à indexer.
//
// Il est écrit sur les TROIS issues, y compris le dédoublonnage (`return 0`) où
// rien d'autre n'est écrit. Ce n'est pas une symétrie décorative : la seule
// chose que `return 0` prouve est que l'entrée EST déjà en file, et un index qui
// aurait expiré pendant que son entrée survit est exactement l'état où le clair
// redevient introuvable. Deux commandes sur un chemin rare achètent la seule
// propriété qui compte — l'index ne meurt pas avant ce qu'il désigne.
//
// Returns 1 when pushed as a new entry, 0 when an identical 'new' was deduped,
// 2 when a mutable entry was superseded.
// KEYS[1] = queue key, KEYS[2] = message index key,
// ARGV[1] = serialized entry, ARGV[2] = dedup id,
// ARGV[3] = TTL, ARGV[4] = normalized eventType, ARGV[5] = max entries per user,
// ARGV[6] = '1' when the entry carries message text, ARGV[7] = queue key (index member)
const ENQUEUE_DEDUP_LUA = `
local function indexHolder()
  if ARGV[6] == '1' then
    redis.call('SADD', KEYS[2], ARGV[7])
    redis.call('EXPIRE', KEYS[2], tonumber(ARGV[3]))
  end
end
local entries = redis.call('LRANGE', KEYS[1], 0, -1)
for i, entry in ipairs(entries) do
  local ok, decoded = pcall(cjson.decode, entry)
  if ok and decoded then
    local decodedDedupId = decoded.dedupKey or decoded.messageId
    if decodedDedupId == ARGV[2] then
      local decodedEventType = decoded.eventType or 'new'
      if decodedEventType == ARGV[4] then
        if ARGV[4] == 'new' then
          indexHolder()
          return 0
        end
        redis.call('LREM', KEYS[1], 1, entry)
        redis.call('RPUSH', KEYS[1], ARGV[1])
        redis.call('EXPIRE', KEYS[1], tonumber(ARGV[3]))
        indexHolder()
        return 2
      end
    end
  end
end
redis.call('RPUSH', KEYS[1], ARGV[1])
redis.call('LTRIM', KEYS[1], -tonumber(ARGV[5]), -1)
redis.call('EXPIRE', KEYS[1], tonumber(ARGV[3]))
indexHolder()
return 1
`.trim();

// Atomically remove specific expired entries by exact value in a single
// round-trip. Only the entries the caller identified as stale (passed as ARGV)
// are removed; a message enqueued concurrently — AFTER the caller's LRANGE
// snapshot — is a DIFFERENT value and is never touched. The previous
// DEL + RPUSH(fresh) rebuild wiped the whole key then restored only the stale
// snapshot, silently dropping any message enqueued between the read and the
// rewrite (the very read-modify-write race the DRAIN_LUA comment warns about).
// (dedupId, eventType) dedup at enqueue guarantees each raw value is unique,
// so LREM with count 0 removes exactly the intended entry. Returns the count
// actually removed.
// KEYS[1] = queue key, ARGV[1..N] = raw serialized entries to remove
const PRUNE_STALE_LUA = `
local removed = 0
for i = 1, #ARGV do
  removed = removed + redis.call('LREM', KEYS[1], 0, ARGV[i])
end
return removed
`.trim();

// #12822 (M3) — remet en tête de file les entrées scellées qu'un drain n'a pas
// pu rouvrir pour une raison PASSAGÈRE. Une entrée n'est remise que si aucune
// entrée de même identité (dedup identity + eventType) n'est arrivée entre le
// drain et la remise : la plus récente gagne toujours, jamais la remise.
// LPUSH dans l'ordre inverse : la tête garde l'ordre chronologique (le drain
// retrie de toute façon par `enqueuedAt`), et le LTRIM borne par la queue,
// comme à l'enfilage.
// KEYS[1] = queue key, ARGV[1] = TTL, ARGV[2] = max entries per user,
// ARGV[3..] = serialized entries, oldest first
const RESTORE_LUA = `
local entries = redis.call('LRANGE', KEYS[1], 0, -1)
local present = {}
for i, entry in ipairs(entries) do
  local ok, decoded = pcall(cjson.decode, entry)
  if ok and decoded then
    present[(decoded.dedupKey or decoded.messageId) .. '\n' .. (decoded.eventType or 'new')] = true
  end
end
local restored = 0
for i = #ARGV, 3, -1 do
  local ok, decoded = pcall(cjson.decode, ARGV[i])
  if ok and decoded and not present[(decoded.dedupKey or decoded.messageId) .. '\n' .. (decoded.eventType or 'new')] then
    redis.call('LPUSH', KEYS[1], ARGV[i])
    restored = restored + 1
  end
end
if restored > 0 then
  redis.call('LTRIM', KEYS[1], -tonumber(ARGV[2]), -1)
  redis.call('EXPIRE', KEYS[1], tonumber(ARGV[1]))
end
return restored
`.trim();

function queueKey(userId: string): string {
  return `${DELIVERY_QUEUE_PREFIX}${userId}`;
}

/**
 * La clé de l'index inverse d'un message (#16706).
 *
 * Son préfixe est DÉLIBÉRÉMENT hors de `DELIVERY_QUEUE_PREFIX` : `cleanup()`
 * balaie `SCAN MATCH ${DELIVERY_QUEUE_PREFIX}*` et fait un `LRANGE` sur chaque
 * clé appariée. Un `SET` y répondrait `WRONGTYPE`, l'exception tomberait dans le
 * `catch` du balayage, et le nettoyage de TOUTES les files s'arrêterait — un
 * index posé pour empêcher le clair de survivre 48 h aurait désarmé la seule
 * unité qui le fait expirer. Détail : `DELIVERY_QUEUE_MESSAGE_INDEX_PREFIX`.
 */
function messageIndexKey(messageId: string): string {
  return `${DELIVERY_QUEUE_MESSAGE_INDEX_PREFIX}${messageId}`;
}

/**
 * Cette ligne brute est-elle une copie PORTEUSE DE TEXTE de ce message ?
 *
 * Les deux conditions sont indissociables. `messageId` seul purgerait aussi
 * l'annonce de mort qu'on vient d'enfiler pour le même message — c'est-à-dire
 * le seul événement qui dit au client de retirer la bulle, et la purge
 * laisserait alors le message affiché pour toujours chez l'absent : le défaut
 * que `carriesMessageText` existe pour empêcher du côté de la REMISE
 * (#16685), rejoué du côté du STOCKAGE.
 *
 * Une ligne ILLISIBLE rend `false`, et le sens est instruit. On ne peut pas
 * prouver qu'elle porte ce message, donc la détruire reviendrait à effacer un
 * inconnu sur une homonymie supposée. Et ce qu'on laisse n'est pas remis :
 * `parseRawEntries` jette déjà toute ligne informe au drain, et `cleanup()`
 * la retire à son échéance. La fenêtre est bornée, la destruction ne l'est pas.
 */
function isTextBearingCopyOf(raw: string, messageId: string): boolean {
  try {
    const entry = JSON.parse(raw) as QueuedMessagePayload;
    return entry.messageId === messageId && carriesMessageText(entry.eventType);
  } catch {
    return false;
  }
}

// Parse a Redis LRANGE result into typed entries, dropping (not throwing on)
// any value that fails to decode so one corrupt entry can never poison a whole
// drain. `context` names the caller for the diagnostic log line.
//
// #16706 — `'peek'` a quitté cette union avec la méthode qui la portait. La
// garder « au cas où » aurait fait du type une documentation d'un lecteur qui
// n'existe plus, et c'est exactement ce que le retrait de `peek` corrige.
function parseRawEntries(raw: string[], userId: string, context: 'drain'): QueuedMessagePayload[] {
  return raw.flatMap(entry => {
    try {
      return [JSON.parse(entry) as QueuedMessagePayload];
    } catch {
      logger.error(`RedisDeliveryQueue: malformed entry in ${context}, dropping`, { userId, raw: entry.substring(0, 120) });
      return [];
    }
  });
}

function normalizedEventType(entry: QueuedMessagePayload): string {
  return entry.eventType ?? 'new';
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
function enqueuedAtMillis(entry: QueuedMessagePayload): number {
  const millis = new Date(entry.enqueuedAt).getTime();
  return Number.isFinite(millis) ? millis : Number.POSITIVE_INFINITY;
}

function byEnqueuedAt(a: QueuedMessagePayload, b: QueuedMessagePayload): number {
  const left = enqueuedAtMillis(a);
  const right = enqueuedAtMillis(b);
  // Deux entrées non datées : `Infinity - Infinity` rend `NaN`, ce qui
  // réintroduirait le défaut entre elles. Le tri étant stable, `0` les laisse
  // dans leur ordre d'arrivée.
  if (left === right) return 0;
  return left - right;
}

// Dedup identity: the same key enqueue() keeps unique per slice — the entry's
// `dedupKey` if set (reactions scope it to messageId:reactor:emoji), else its
// `messageId` — paired with the normalized eventType. Mirrors ENQUEUE_DEDUP_LUA
// and the memory-path findIndex.
function dedupIdentity(entry: QueuedMessagePayload): string {
  return `${entry.dedupKey ?? entry.messageId}\u0000${normalizedEventType(entry)}`;
}

// Collapse duplicate (dedup identity, eventType) entries left by MERGING the
// memory-fallback and Redis slices. enqueue() enforces one-entry-per-identity
// WITHIN each slice independently (Redis via ENQUEUE_DEDUP_LUA, memory via
// findIndex), but a mid-outage interleave can leave one copy in EACH slice —
// e.g. an 'edited' for message M reached Redis, then a transient blip sent the
// next 'edited' to memory. Concatenating both replays the event twice:
// harmless-but-redundant for an idempotent edit/reaction, a DUPLICATE message
// bubble for a 'new'. Keep only the newest copy per identity — the same
// supersede rule enqueue() applies in-slice — restoring the one-entry-per-
// identity invariant the drain/peek consumers rely on. Input is assumed already
// byEnqueuedAt-sorted (ascending); walking newest→oldest keeps the newest copy
// at its own slot, so the surviving order stays byEnqueuedAt.
function collapseCrossSliceDuplicates(sorted: QueuedMessagePayload[]): QueuedMessagePayload[] {
  const seen = new Set<string>();
  const kept: QueuedMessagePayload[] = [];
  for (let i = sorted.length - 1; i >= 0; i--) {
    const identity = dedupIdentity(sorted[i]);
    if (seen.has(identity)) continue;
    seen.add(identity);
    kept.push(sorted[i]);
  }
  return kept.reverse();
}

// Bounds for the in-process fallback slice only. It holds what could not reach
// Redis during a transient outage, so it bounds GATEWAY HEAP across every user
// at once — a different resource from the durable slice's
// `DELIVERY_QUEUE_MAX_PER_USER`, which bounds Redis CPU, Redis memory and the
// reconnect replay burst. The two caps are deliberately different sizes.
const MEMORY_QUEUE_MAX_USERS = 1000;
const MEMORY_QUEUE_MAX_PER_USER = 50;

/**
 * #12822 (M3) — une entrée scellée qui ne se rouvre pas est JETÉE seulement si
 * le chiffré ne s'authentifie pas ou si la charge est informe : rien ne la
 * rouvrira jamais. Toute autre cause (base des clés injoignable, clé maîtresse
 * absente ou erronée le temps d'un déploiement, clé de données introuvable)
 * peut passer : l'entrée est remise en file, dans sa limite de 48 h.
 */
function isPermanentlyUnreadable(error: unknown): boolean {
  if (error instanceof SyntaxError) return true;
  return error instanceof ServerAtRestUnreadableError
    && (error.reason === 'authentication-failed' || error.reason === 'malformed');
}

function isStillLive(entry: QueuedMessagePayload, now: number): boolean {
  const millis = new Date(entry.enqueuedAt).getTime();
  return Number.isFinite(millis) && now - millis < DELIVERY_QUEUE_TTL_SECONDS * 1000;
}

type ReplayPlan = { readonly replay: QueuedMessagePayload[]; readonly retry: QueuedMessagePayload[] };

/** #12822 — `sealAtRest` : la charge appartient à une conversation chiffrée au repos. */
export type DeliveryQueueEnqueueOptions = { readonly sealAtRest?: boolean };

export class RedisDeliveryQueue {
  private memoryQueue: Map<string, QueuedMessagePayload[]> = new Map();

  constructor(
    private cacheStore: CacheStore,
    private readonly sealer: DeliveryQueueSealer | null = null,
  ) {}

  private getRedis(): Redis | null {
    return this.cacheStore.getNativeClient();
  }

  /**
   * #12822 — FAIL-CLOSED : une entrée à sceller qui ne se scelle pas (aucun
   * sceau, clé maîtresse absente, clé de conversation illisible) n'est PAS
   * enfilée. Le destinataire relira le message en ouvrant la conversation ;
   * le clair ne se pose jamais dans Redis à la place.
   */
  private async sealedForStorage(userId: string, entry: QueuedMessagePayload): Promise<QueuedMessagePayload | null> {
    const refuse = (reason: string): null => {
      logger.error('Offline entry of an at-rest conversation not queued: it cannot be sealed', {
        userId, conversationId: entry.conversationId, messageId: entry.messageId, eventType: normalizedEventType(entry), reason,
      });
      return null;
    };
    if (!this.sealer) return refuse('no-sealer');
    try {
      return await this.sealer.seal(entry, userId);
    } catch (error) {
      return refuse(error instanceof Error && 'code' in error ? String(error.code) : 'seal-failed');
    }
  }

  /**
   * Les entrées scellées sont rouvertes. Celle qui ne se rouvre pas n'est pas
   * rejouée : jetée si rien ne la rouvrira jamais, gardée pour une nouvelle
   * tentative sinon (#12822, M3) — telle qu'elle était stockée, scellée.
   */
  private async openedForReplay(userId: string, entries: QueuedMessagePayload[]): Promise<ReplayPlan> {
    if (!entries.some((entry) => entry.sealedPayload)) return { replay: entries, retry: [] };
    const outcomes = await Promise.all(entries.map(async (entry): Promise<{ replay?: QueuedMessagePayload; retry?: QueuedMessagePayload }> => {
      const { sealedPayload } = entry;
      if (!sealedPayload) return { replay: entry };
      try {
        if (!this.sealer) throw new Error('no-sealer');
        return { replay: await this.sealer.open({ ...entry, sealedPayload }, userId) };
      } catch (error) {
        const permanent = isPermanentlyUnreadable(error);
        logger.error(permanent
          ? 'Sealed offline entry dropped: it will never open'
          : 'Sealed offline entry kept for a later replay: it cannot be opened right now', {
          userId, conversationId: entry.conversationId, messageId: entry.messageId, eventType: normalizedEventType(entry),
          reason: error instanceof ServerAtRestUnreadableError ? error.reason : error instanceof Error && 'code' in error ? String(error.code) : 'open-failed',
        });
        return permanent ? {} : { retry: entry };
      }
    }));
    return {
      replay: outcomes.flatMap((outcome) => (outcome.replay ? [outcome.replay] : [])),
      retry: outcomes.flatMap((outcome) => (outcome.retry ? [outcome.retry] : [])),
    };
  }

  /**
   * #12822 (M3) — remet en file, scellées et à leur instant d'origine, les
   * entrées qu'un drain n'a pas pu rouvrir. Une entrée de plus de 48 h n'est
   * pas remise ; une entrée de même identité arrivée entre-temps l'emporte.
   */
  private async restoreForRetry(userId: string, entries: readonly QueuedMessagePayload[]): Promise<void> {
    const now = Date.now();
    const live = [...entries].filter((entry) => isStillLive(entry, now)).sort(byEnqueuedAt);
    if (live.length === 0) return;
    const redis = this.getRedis();
    if (redis) {
      try {
        await redis.eval(
          RESTORE_LUA, 1, queueKey(userId),
          String(DELIVERY_QUEUE_TTL_SECONDS), String(DELIVERY_QUEUE_MAX_PER_USER),
          ...live.map((entry) => JSON.stringify(entry)),
        );
        return;
      } catch (error) {
        logger.warn('Redis restore failed, keeping the sealed entries in memory', { userId, error });
      }
    }
    const existing = this.memoryQueue.get(userId) ?? [];
    const present = new Set(existing.map(dedupIdentity));
    const restored = live.filter((entry) => !present.has(dedupIdentity(entry)));
    if (restored.length > 0) this.memoryQueue.set(userId, [...restored, ...existing].slice(-MEMORY_QUEUE_MAX_PER_USER));
  }

  async enqueue(userId: string, incoming: QueuedMessagePayload, options: DeliveryQueueEnqueueOptions = {}): Promise<void> {
    const entry = options.sealAtRest ? await this.sealedForStorage(userId, incoming) : incoming;
    if (!entry) return;
    const redis = this.getRedis();
    const serialized = JSON.stringify(entry);
    const dedupId = entry.dedupKey ?? entry.messageId;

    if (redis) {
      try {
        const key = queueKey(userId);
        // `carriesMessageText` décide de l'indexation, et c'est le MÊME
        // prédicat que la garde de vivacité du drain (#16685) : ce qui doit
        // être revérifié avant d'être REMIS est exactement ce qui doit pouvoir
        // être retrouvé pour être PURGÉ. Un second prédicat aurait divergé.
        const indexed = carriesMessageText(entry.eventType);
        const pushed = await redis.eval(
          ENQUEUE_DEDUP_LUA, 2, key, messageIndexKey(entry.messageId),
          serialized, dedupId, String(DELIVERY_QUEUE_TTL_SECONDS), normalizedEventType(entry),
          String(DELIVERY_QUEUE_MAX_PER_USER), indexed ? '1' : '0', userId
        );
        if (pushed === 0) {
          logger.debug('Delivery queue dedup: dedup id already queued', { userId, dedupId, messageId: entry.messageId });
        } else if (pushed === 2) {
          logger.debug('Delivery queue supersede: mutable event re-pushed at tail', { userId, dedupId, messageId: entry.messageId, eventType: normalizedEventType(entry) });
        }
        return;
      } catch (error) {
        logger.warn('Redis enqueue failed, falling back to memory', { userId, error });
      }
    }

    // Evict oldest user bucket when global cap reached
    if (this.memoryQueue.size >= MEMORY_QUEUE_MAX_USERS && !this.memoryQueue.has(userId)) {
      const firstUser = this.memoryQueue.keys().next().value;
      /* istanbul ignore next -- Map always has a key when size >= 1000 */
      if (firstUser !== undefined) {
        logger.warn('Memory delivery queue at capacity, evicting oldest user', { evicted: firstUser });
        this.memoryQueue.delete(firstUser);
      }
    }
    const existing = this.memoryQueue.get(userId) ?? [];
    const dupIndex = existing.findIndex(e => (e.dedupKey ?? e.messageId) === dedupId && normalizedEventType(e) === normalizedEventType(entry));
    if (dupIndex !== -1) {
      if (normalizedEventType(entry) === 'new') {
        logger.debug('Delivery queue dedup (memory): dedup id+eventType already queued', { userId, dedupId, eventType: normalizedEventType(entry) });
        return;
      }
      // Mutable event (edited/deleted/reaction-*): supersede in place with the
      // newest payload. The Redis twin re-pushes at the tail instead, because
      // its bound trims by slot; this slice evicts by `enqueuedAt` below, so
      // keeping the slot costs nothing here.
      this.memoryQueue.set(userId, existing.map((e, i) => (i === dupIndex ? entry : e)));
      logger.debug('Delivery queue supersede (memory): mutable event replaced in place', { userId, dedupId, eventType: normalizedEventType(entry) });
      return;
    }
    const withNew = [...existing, entry];
    if (withNew.length <= MEMORY_QUEUE_MAX_PER_USER) {
      this.memoryQueue.set(userId, withNew);
      return;
    }
    // Over capacity: evict the chronologically-OLDEST entries by `enqueuedAt`,
    // NOT the head array slots. A mutable event superseded in place above keeps
    // its original, earlier slot while carrying a NEWER enqueuedAt, so slot 0 is
    // not necessarily the oldest — slicing by slot could drop the freshest
    // edit/delete/reaction and strand the recipient on stale content after
    // drain() (whose byEnqueuedAt sort cannot recover an entry already evicted
    // here). Same array-slot-vs-enqueuedAt divergence that byEnqueuedAt fixed for
    // the sibling drain path. Survivors keep their insertion order (drain()
    // re-sorts, but the memory-before-Redis tiebreak in byEnqueuedAt relies on
    // stable order).
    const evictCount = withNew.length - MEMORY_QUEUE_MAX_PER_USER;
    const evictIndices = new Set(
      withNew
        .map((e, index) => ({ ts: new Date(e.enqueuedAt).getTime(), index }))
        .sort((a, b) => a.ts - b.ts)
        .slice(0, evictCount)
        .map(({ index }) => index),
    );
    this.memoryQueue.set(userId, withNew.filter((_, index) => !evictIndices.has(index)));
  }

  /**
   * Retire de la file TOUTE copie porteuse de texte d'un message, sur toutes
   * les files qui en gardaient une (#16706).
   *
   * ## Le défaut qu'elle ferme, et pourquoi il n'est pas celui de #16685
   *
   * #16685 a fermé la REMISE : le drain interroge la vivacité du message avant
   * d'émettre, donc un message brûlé, rappelé ou échu ne se rejoue plus. Il
   * n'avait rien changé au STOCKAGE, délibérément. Or
   * `enqueueForOfflineParticipants` écrit `payload: body` VERBATIM, et quand
   * `ExpiredMessagesCleanupService._burn` détruit la ligne — `content: ''`,
   * `encryptedContent: null`, `translations: null`, `metadata: null`, fichiers
   * supprimés — la copie enfilée RESTAIT, en clair, dans
   * `delivery:queue:<userId>` et dans les sauvegardes AOF de Redis, jusqu'au
   * prochain drain de ce destinataire ou à l'expiration du TTL : **48 h**.
   *
   * L'invariant que `_burn` revendique dans son propre commentaire — « le
   * contenu est détruit, c'est l'invariant qui compte » — tenait donc dans
   * Mongo et pas ici. Les conversations `server-at-rest` sont scellées à
   * l'enfilage (#12822) : ce sous-ensemble, et lui seul, était atténué.
   *
   * ## Ce qu'elle ne prétend PAS être
   *
   * Elle est best-effort, et les deux moitiés sont indépendantes PAR
   * CONSTRUCTION. Une entrée que l'index a perdue — Redis indisponible à
   * l'enfilage, repli mémoire, index expiré, entrée évincée par le `LTRIM` —
   * reste refusée à la remise par la garde du drain, qui ne lit que la base.
   * L'une empêche de GARDER, l'autre de REMETTRE, et aucune ne suppose l'autre :
   * c'est ce qui fait que l'échec de celle-ci n'ouvre pas de fuite de
   * livraison, et que l'échec de celle-là n'ouvre pas de fuite au repos.
   *
   * Elle ne touche pas non plus les familles sans texte. L'annonce de mort
   * (`deleted` / `expired`) qui DÉCLENCHE cette purge est elle-même en file pour
   * les mêmes destinataires : la purger retirerait le seul événement qui dit au
   * client de retirer la bulle, et l'absent garderait un message détruit affiché
   * pour toujours — le défaut EXACT que le cadrage de `carriesMessageText`
   * existe pour empêcher, rejoué à l'envers.
   *
   * Rend le nombre d'entrées effectivement retirées, les deux tranches
   * confondues.
   */
  async purgeMessage(messageId: string): Promise<number> {
    // La tranche MÉMOIRE d'abord, et sans condition : elle ne dépend pas de
    // Redis, c'est précisément là que vivent les entrées écrites PENDANT une
    // panne Redis, et un `return` anticipé sur `!redis` les laisserait derrière.
    let removed = this.purgeMemorySlice(messageId);

    const redis = this.getRedis();
    if (!redis) return removed;

    const indexKey = messageIndexKey(messageId);
    try {
      const holders = await redis.smembers(indexKey);
      for (const holder of holders) {
        const key = queueKey(holder);
        const raw = await redis.lrange(key, 0, -1);
        const doomed = raw.filter((entry) => isTextBearingCopyOf(entry, messageId));
        if (doomed.length === 0) continue;
        // `PRUNE_STALE_LUA` retire par VALEUR BRUTE exacte, et c'est ce qui rend
        // la purge sûre contre la course que le commentaire de `DRAIN_LUA`
        // décrit : une entrée enfilée APRÈS notre `LRANGE` est une autre valeur,
        // donc jamais touchée. Un `DEL` + réécriture du reste perdrait ce qui est
        // arrivé entre la lecture et l'écriture — l'erreur que `cleanup()` a déjà
        // commise une fois.
        const pruned = await redis.eval(PRUNE_STALE_LUA, 1, key, ...doomed);
        removed += typeof pruned === 'number' ? pruned : doomed.length;
      }
      await redis.del(indexKey);
    } catch (error) {
      // Best-effort, comme tout ce module : la destruction en base a déjà eu
      // lieu, et la garde de vivacité du drain tient la remise. Lever ici
      // transformerait une suppression réussie en erreur rendue à l'appelant.
      logger.warn('Delivery queue purge failed for a destroyed message', { messageId, error });
    }

    return removed;
  }

  /**
   * La tranche en mémoire, balayée par USAGE et non par index : elle ne porte
   * aucune clé Redis, donc l'index inverse ne la désigne pas. Son coût est borné
   * par `MEMORY_QUEUE_MAX_USERS` × `MEMORY_QUEUE_MAX_PER_USER`, et elle n'est
   * peuplée que pendant une panne Redis.
   */
  private purgeMemorySlice(messageId: string): number {
    let removed = 0;
    for (const [userId, entries] of this.memoryQueue.entries()) {
      const kept = entries.filter(
        (entry) => !(entry.messageId === messageId && carriesMessageText(entry.eventType)),
      );
      if (kept.length === entries.length) continue;
      removed += entries.length - kept.length;
      if (kept.length === 0) this.memoryQueue.delete(userId);
      else this.memoryQueue.set(userId, kept);
    }
    return removed;
  }

  async drain(userId: string): Promise<QueuedMessagePayload[]> {
    const { replay, retry } = await this.openedForReplay(userId, await this.drainStored(userId));
    if (retry.length > 0) await this.restoreForRetry(userId, retry);
    return replay;
  }

  private async drainStored(userId: string): Promise<QueuedMessagePayload[]> {
    const redis = this.getRedis();

    // Entries stashed here were queued during a transient Redis outage before
    // it recovered. Pulled out up front so they're never orphaned: without this,
    // a Redis-reachable drain() would return only the Redis-backed entries and
    // silently leave these sitting in memory forever (see enqueue()'s fallback).
    // Their FIFO position relative to Redis-backed entries is resolved by
    // `byEnqueuedAt` below, not by concatenation order — a mid-sequence blip can
    // leave a memory entry NEWER than a Redis one (e.g. an edit that fell back
    // to memory after its `new` reached Redis).
    const memoryEntries = this.memoryQueue.get(userId) ?? [];
    this.memoryQueue.delete(userId);

    if (redis) {
      try {
        const key = queueKey(userId);
        const rawEntries = await redis.eval(DRAIN_LUA, 1, key);

        const redisEntries = !Array.isArray(rawEntries) ? [] : parseRawEntries(rawEntries as string[], userId, 'drain');
        return collapseCrossSliceDuplicates([...memoryEntries, ...redisEntries].sort(byEnqueuedAt));
      } catch (error) {
        logger.warn('Redis drain failed, falling back to memory', { userId, error });
      }
    }

    // Sort by enqueuedAt for the same reason the Redis-backed path does (line
    // above): a mutable event superseded in place (see enqueue()) keeps its
    // original, earlier array slot but carries a NEWER enqueuedAt, so raw array
    // order can disagree with chronological order. Returning unsorted here would
    // replay a re-added reaction (or a later edit) BEFORE an intervening remove,
    // converging the reconnecting offline user to a state the sender never had.
    return [...memoryEntries].sort(byEnqueuedAt);
  }

  async size(userId: string): Promise<number> {
    const redis = this.getRedis();
    const memoryCount = (this.memoryQueue.get(userId) ?? []).length;

    if (redis) {
      try {
        // Add the memory-fallback slice: entries stashed there during a transient
        // Redis outage are still pending until drain() replays them (drain merges
        // both slices). Returning llen alone would under-report the true backlog.
        return (await redis.llen(queueKey(userId))) + memoryCount;
      } catch (error) {
        logger.warn('Redis size failed, falling back to memory', { userId, error });
      }
    }

    return memoryCount;
  }

  async cleanup(): Promise<number> {
    const cutoff = Date.now() - DELIVERY_QUEUE_TTL_SECONDS * 1000;
    const redis = this.getRedis();
    let totalRemoved = 0;

    if (redis) {
      try {
        let cursor = '0';
        do {
          const [nextCursor, keys] = await redis.scan(
            cursor, 'MATCH', `${DELIVERY_QUEUE_PREFIX}*`, 'COUNT', 100
          );
          cursor = nextCursor;

          for (const key of keys) {
            const entries = await redis.lrange(key, 0, -1);
            const stale = entries.filter(raw => {
              try {
                const parsed = JSON.parse(raw) as QueuedMessagePayload;
                return new Date(parsed.enqueuedAt).getTime() <= cutoff;
              } catch {
                logger.error('RedisDeliveryQueue: malformed entry in cleanup, dropping', { key, raw: raw.substring(0, 120) });
                return true;
              }
            });

            if (stale.length > 0) {
              const removed = await redis.eval(PRUNE_STALE_LUA, 1, key, ...stale);
              totalRemoved += typeof removed === 'number' ? removed : stale.length;
            }
          }
        } while (cursor !== '0');
      } catch (error) {
        logger.warn('Redis cleanup failed, falling back to memory', { error });
      }
    }

    // Always sweep the memory fallback too, regardless of Redis reachability:
    // entries land here during a transient Redis outage and must still expire
    // on schedule even after Redis recovers (drain() reads both, but cleanup
    // must not let them sit unbounded until then).
    for (const [userId, entries] of this.memoryQueue.entries()) {
      const fresh = entries.filter(e => new Date(e.enqueuedAt).getTime() > cutoff);
      const removed = entries.length - fresh.length;
      totalRemoved += removed;

      if (fresh.length === 0) {
        this.memoryQueue.delete(userId);
      } else {
        this.memoryQueue.set(userId, fresh);
      }
    }

    return totalRemoved;
  }
}
