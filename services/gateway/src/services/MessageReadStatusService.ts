/**
 * Service de gestion des statuts de lecture/réception des messages
 *
 * Architecture hybride (Cursor + per-message freeze):
 * - ConversationReadCursor: index rapide du front de lecture/livraison
 *   (`lastReadAt`/`lastDeliveredAt`) — sert au comptage des non-lus.
 * - MessageStatusEntry: date FIGÉE (write-once) de livraison/réception/lecture
 *   PAR message PAR participant, capturée la première fois que le message
 *   franchit le front. Garantit la précision absolue : la date affichée d'un
 *   message ne suit plus le curseur mobile (qui ré-avance à chaque ouverture).
 *   Cf. `freezeMessageStatus` (écriture) + `getMessageStatusDetails` (lecture,
 *   l'entrée figée prime, fallback curseur pour le legacy non figé).
 * - AttachmentStatusEntry est conservé pour le suivi granulaire des médias (audio écouté, vidéo vue).
 */

import { PrismaClient, Message, Prisma } from "@meeshy/shared/prisma/client";
import { resolveParticipantAvatar } from '@meeshy/shared/utils/participant-helpers';
import { enhancedLogger } from '../utils/logger-enhanced';
import { computeContiguousReadPrefix, computeRecipientCount, resolveReadAt, resolveReceivedAt } from '../utils/read-exactness';
import { getExactReadTrackingCutover } from '../config/read-exactness-config';
import { loadPrivacyPreferencesCached } from './preferences/privacy-cache';
import {
  NO_PERSONAL_HIDING,
  applyPersonalHistoryHiding,
  exclusiveFloorMsFor,
  loadPersonalHistoryHiding,
  loadPersonalHistoryHidingByConversation,
  loadPersonalHistoryHidingByUser,
} from './personalHistoryFilter';
import { normalizeLanguageCode } from '@meeshy/shared/utils/language-normalize';
import {
  appendPlaybackStretches,
  parsePlaybackTrace,
  traceCoverage,
} from '../utils/playback-trace';
import {
  mergeViewedLanguages,
  languageBreakdown,
  MAX_VIEWED_LANGUAGES,
} from '../utils/viewed-languages';
import { coveredDurationMs } from '../utils/playback-segments';

// Logger dédié pour MessageReadStatusService
const logger = enhancedLogger.child({ module: 'MessageReadStatusService' });

/**
 * Borne du balayage cherchant jusqu'où le curseur de lecture peut avancer.
 * Protège d'un scan non maîtrisé sur une conversation très en retard : le
 * curseur rattrapera au passage suivant.
 */
const EXACT_CURSOR_SCAN_LIMIT = 500;


// Helper pour retry des transactions en cas de deadlock (P2034)
async function withRetry<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  baseDelayMs: number = 50
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error: any) {
      lastError = error;

      // P2034 = Transaction deadlock/write conflict
      if (error?.code === "P2034" && attempt < maxRetries - 1) {
        // Exponential backoff avec jitter
        const delay = baseDelayMs * Math.pow(2, attempt) + Math.random() * 50;
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }

      throw error;
    }
  }

  throw lastError;
}

// A MongoDB ObjectId hex string is chronologically sortable only to the SECOND
// (leading 4 bytes = creation timestamp); its next 5 bytes are per-process
// random. Two messages created in the same second on DIFFERENT gateway
// processes therefore sort by string in an order unrelated to real recency, so
// the cursor-advance freshness guard orders by the message's `createdAt`
// (millisecond precision) instead — see `buildCursorFreshnessGuard`. Only
// applied when the candidate id looks like a real ObjectId — non-conforming ids
// (tests, legacy data) skip the guard so behavior is unchanged for callers that
// don't use ObjectIds (matches the field's pre-atomic-guard behavior).
const OBJECT_ID_RE = /^[0-9a-f]{24}$/i;

type CursorIdField = "lastDeliveredMessageId" | "lastReadMessageId";
type CursorCreatedAtField =
  | "lastDeliveredMessageCreatedAt"
  | "lastReadMessageCreatedAt";

const CREATED_AT_FIELD_FOR: Record<CursorIdField, CursorCreatedAtField> = {
  lastDeliveredMessageId: "lastDeliveredMessageCreatedAt",
  lastReadMessageId: "lastReadMessageCreatedAt",
};

/**
 * Builds the `OR` half of the cursor-advance `updateMany` WHERE — the atomic
 * freshness guard that decides whether an incoming receipt is newer than what
 * the cursor already records. Ordering is by the message's `createdAt`, NOT its
 * ObjectId hex order (which is only second-accurate and diverges across gateway
 * processes; see `OBJECT_ID_RE`).
 *
 * Returns `null` when no guard applies (the caller then matches on
 * participant+conversation alone):
 *   - non-ObjectId ids (tests / legacy data), preserving the historical
 *     pre-guard behavior;
 *   - an ObjectId whose message could not be resolved to a `createdAt`, which
 *     falls back to the historical ObjectId-order guard rather than dropping it.
 */
export function buildCursorFreshnessGuard(params: {
  idField: CursorIdField;
  createdAtField: CursorCreatedAtField;
  messageId: string;
  messageCreatedAt: Date | null;
}): { OR: Array<Record<string, unknown>> } | null {
  const { idField, createdAtField, messageId, messageCreatedAt } = params;
  if (!OBJECT_ID_RE.test(messageId)) return null;

  if (!messageCreatedAt) {
    return { OR: [{ [idField]: null }, { [idField]: { lt: messageId } }] };
  }

  return {
    OR: [
      // Brand-new cursor: nothing recorded yet.
      { [createdAtField]: null, [idField]: null },
      // Legacy cursor written before createdAt was tracked: fall back to the
      // ObjectId order it was recorded under, until this advance upgrades it.
      { [createdAtField]: null, [idField]: { lt: messageId } },
      // The recorded message is strictly older (correct to the millisecond). A
      // same-instant sibling from another process is left for the next later
      // receipt to carry — a transient stall, never a rollback.
      { [createdAtField]: { lt: messageCreatedAt } },
    ],
  };
}

export class MessageReadStatusService {
  /**
   * Cache statique pour éviter les appels multiples à markMessagesAsReceived/Read
   * Clé: `${userId}:${conversationId}:${type}` -> timestamp du dernier appel
   * TTL: 2 secondes (nettoyé automatiquement)
   */
  private static recentActionCache = new Map<string, number>();

  private static readonly DEDUP_TTL_MS = 2000;
  private static readonly dedupCleanupInterval = (() => {
    const handle = setInterval(() => MessageReadStatusService.cleanupDedupCache(), 30_000);
    handle.unref?.();
    return handle;
  })();

  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Nettoie les entrées expirées du cache de déduplication
   */
  private static cleanupDedupCache(): void {
    const cleanupNow = Date.now();
    const keysToDelete: string[] = [];

    MessageReadStatusService.recentActionCache.forEach((timestamp, key) => {
      if (cleanupNow - timestamp > MessageReadStatusService.DEDUP_TTL_MS) {
        keysToDelete.push(key);
      }
    });

    keysToDelete.forEach((key) =>
      MessageReadStatusService.recentActionCache.delete(key)
    );
  }

  /**
   * Calcule le nombre de messages non lus dans une conversation pour un participant.
   *
   * The unread count is computed FRESH on every call — the cursor's
   * denormalized `unreadCount` field is intentionally ignored because it
   * is only updated on `markAsRead` / `markAsReceived` and never on new
   * message creation. Trusting it produced wildly inflated counts (e.g.
   * 75 for users who had read everything) by silently falling back to a
   * "count all historical messages from others" path.
   *
   * Accepts either a `Participant.id` OR a `User.id` for backwards
   * compatibility with callers that previously passed the room target
   * (`participant.userId || participant.id`). The participant is resolved
   * internally; the senderId-equality check uses the resolved
   * `Participant.id`, not the user-provided identifier.
   *
   * Counting floor: `cursor.lastReadMessageCreatedAt` (the chronological
   * position of the read cursor) → `cursor.lastReadAt` (legacy rows) →
   * `participant.joinedAt`. The position — not the wall-clock `lastReadAt`,
   * which is `now` after an exact partial-prefix read — keeps skipped
   * messages counted (design lecture-exacte §3 : « le badge reste haut »).
   * A new participant therefore sees only messages received since they
   * joined, NOT the entire historical backlog of the conversation.
   *
   * The count is also narrowed by the reader's PERSONAL hiding — the messages
   * they removed from their own view, and the history they cleared. A badge
   * counting messages the list refuses to show is a badge scrolling cannot put
   * out: there is nothing left to scroll.
   */
  async getUnreadCount(
    participantIdOrUserId: string,
    conversationId: string
  ): Promise<number> {
    try {
      // First attempt: treat the caller's id as a Participant.id directly.
      // This is the common path for anonymous users and for callers that
      // already resolved to a participant.
      let cursor = await this.prisma.conversationReadCursor.findUnique({
        where: {
          conversation_participant_cursor: {
            participantId: participantIdOrUserId,
            conversationId,
          },
        },
      });

      // Resolve the actual Participant row. The cursor lookup may have
      // missed because the caller passed a User.id rather than the
      // Participant.id — try resolving via either column.
      const participant = await this.prisma.participant.findFirst({
        where: {
          conversationId,
          isActive: true,
          OR: [
            { id: participantIdOrUserId },
            { userId: participantIdOrUserId },
          ],
        },
        select: { id: true, userId: true, joinedAt: true },
      });

      if (!participant) {
        // Unknown participant in this conversation — refuse to fall back
        // to a "count everything from others" sweep. Returning 0 is the
        // safe default; callers that genuinely need the historical count
        // should pass a known Participant.id.
        return 0;
      }

      // If the first lookup missed and the resolved Participant.id differs
      // from what the caller passed, retry the cursor lookup with the
      // correct id.
      if (!cursor && participant.id !== participantIdOrUserId) {
        cursor = await this.prisma.conversationReadCursor.findUnique({
          where: {
            conversation_participant_cursor: {
              participantId: participant.id,
              conversationId,
            },
          },
        });
      }

      // Plancher = position CHRONOLOGIQUE du curseur, pas l'horloge murale.
      // En mode exact le curseur s'arrête au préfixe contigu : `lastReadAt` vaut
      // `now` (postérieur à tous les messages en base) tandis que
      // `lastReadMessageCreatedAt` est le `createdAt` du dernier message
      // réellement lu. Compter `createdAt > lastReadAt` déclarerait lus les
      // messages sautés — le badge tomberait à 0 (design lecture-exacte §3 :
      // « le badge reste haut »). Repli sur `lastReadAt` pour les curseurs
      // hérités sans clé chronologique, puis `joinedAt`.
      const floor: Date | null =
        cursor?.lastReadMessageCreatedAt ?? cursor?.lastReadAt ?? participant.joinedAt ?? null;

      const hiding = await loadPersonalHistoryHiding(this.prisma, {
        userId: participant.userId,
        conversationId,
      });

      return await this.prisma.message.count({
        where: applyPersonalHistoryHiding(
          {
            conversationId,
            deletedAt: null,
            senderId: { not: participant.id },
            ...(floor ? { createdAt: { gt: floor } } : {}),
          },
          hiding
        ),
      });
    } catch (error) {
      logger.error("[MessageReadStatus] Error getting unread count", error);
      return 0;
    }
  }

  /**
   * Batched variant for multiple participants in the same conversation.
   *
   * Fires on the hottest path — `_updateUnreadCounts` calls this on EVERY `message:new`
   * for every recipient. Each participant's unread count shares the SAME shape — messages
   * after their read floor that they did NOT send themselves — so the only per-participant
   * variance is the `createdAt` floor and the "exclude my own messages" cut. Collapsed into
   * **1 cursor batch + 1 `message.findMany`** (index-backed by
   * `[conversationId, deletedAt, createdAt]`) + in-memory upper-bound binary searches.
   *
   * Semantics match the canonical single-participant `getUnreadCount` and
   * `getUnreadCountsForUser`: exclude **the participant's own** messages (`senderId ≠ p.id`),
   * NOT the new message's sender. (The previous `senderId ≠ <message sender>` predicate
   * under-reported — in a 1:1 it pushed 0 unread on every incoming message — and diverged
   * from the authoritative `getUnreadCountsForUser`. See iter 46 / F23b.)
   *
   * Counting floor per participant: `cursor.lastReadMessageCreatedAt (position)
   * → cursor.lastReadAt (legacy) → joinedAt → null` (no floor). The chronological
   * position — not the wall-clock `lastReadAt` — keeps messages skipped by an
   * exact partial-prefix read counted (design lecture-exacte §3).
   * The `findMany` lower bound is the OLDEST floor across participants, so only the
   * messages any participant could count are fetched once; a `null` floor (never read,
   * no `joinedAt`) drops the bound entirely.
   *
   * Personal hiding is loaded IN PARALLEL with the cursors (2 extra indexed queries,
   * zero extra latency, and none at all for a conversation whose participants are all
   * anonymous — the normal shape behind a share link). It then splits in two, because
   * the two halves of the hiding cost very differently:
   *
   *   - a **history cut-off** is just a stricter floor. It folds into the participant's
   *     own `floorMs` via `exclusiveFloorMsFor`, so those participants stay on the shared
   *     binary search AND raise the query's lower bound — strictly less work than before;
   *   - **individually hidden messages** cannot be expressed as a bound, so those
   *     participants — and only those — take a linear pass over the rows, and only they
   *     make the query select message ids.
   *
   * Applying the hiding HERE and not only on the list path is what keeps the two badges
   * from contradicting each other: this method feeds `conversation:unread-updated`, the
   * live push, while `getUnreadCountsForUser` feeds the list. Fixing one alone would
   * replace a wrong-but-stable badge with a badge that changes value depending on which
   * path last spoke.
   *
   * Returns a Map<participantId, unreadCount>. Accepts pre-resolved participant rows
   * (id + userId + joinedAt) to avoid redundant participant lookups.
   */
  async getUnreadCountsForParticipants(
    participants: ReadonlyArray<{ id: string; userId?: string | null; joinedAt: Date | null }>,
    conversationId: string
  ): Promise<Map<string, number>> {
    if (participants.length === 0) return new Map();

    try {
      const participantIds = participants.map((p) => p.id);

      // Batch fetch all cursors in a single query, alongside the personal hiding of
      // every participant who owns an account. Both are needed before the message
      // query — the cut-off narrows its lower bound — so they run together.
      const [cursors, hidingByUser] = await Promise.all([
        this.prisma.conversationReadCursor.findMany({
          where: { participantId: { in: participantIds }, conversationId },
          select: { participantId: true, lastReadAt: true, lastReadMessageCreatedAt: true },
        }),
        loadPersonalHistoryHidingByUser(this.prisma, {
          userIds: participants.map((p) => p.userId),
          conversationId,
        }),
      ]);
      // Position CHRONOLOGIQUE du curseur, pas l'horloge murale — voir
      // getUnreadCount. En mode exact `lastReadAt = now` déclarerait lus les
      // messages sautés ; `lastReadMessageCreatedAt` est le vrai plancher.
      const cursorMap = new Map(
        cursors.map((c) => [c.participantId, c.lastReadMessageCreatedAt ?? c.lastReadAt])
      );

      // Per-participant counting floor (ms). `cursor position → joinedAt → null`
      // — identical reduction to the single-participant
      // `(lastReadMessageCreatedAt ?? lastReadAt) ?? p.joinedAt ?? null` — then
      // raised by the reader's own history cut-off, which is nothing but a
      // stricter floor once restated as an exclusive bound.
      const floors = participants.map((p) => {
        const hiding = (p.userId ? hidingByUser.get(p.userId) : undefined) ?? NO_PERSONAL_HIDING;
        const readFloorMs = ((cursorMap.get(p.id) ?? p.joinedAt)?.getTime() ?? null) as number | null;
        const cutoffMs = exclusiveFloorMsFor(hiding);
        const floorMs =
          cutoffMs === null ? readFloorMs : readFloorMs === null ? cutoffMs : Math.max(readFloorMs, cutoffMs);
        return {
          id: p.id,
          floorMs,
          hiddenMessageIds: hiding.hiddenMessageIds.length > 0 ? new Set(hiding.hiddenMessageIds) : null,
        };
      });

      // Only a reader who hid INDIVIDUAL messages needs the rows to carry their ids.
      // Everyone else — the overwhelming majority — keeps the exact projection this
      // method has always fetched.
      const needsMessageIds = floors.some((f) => f.hiddenMessageIds !== null);

      // A null floor counts every candidate message (no lower bound). If ANY participant
      // is unbounded we must fetch the full history; otherwise the oldest floor is enough.
      // Reduce (not `Math.min(...spread)`): this fires on the hottest path
      // (`_updateUnreadCounts` on EVERY `message:new`) and `floors` has one entry per
      // participant. A public/global conversation at the platform's 100k+ scale can exceed
      // V8's argument-spread ceiling (~131k), where `Math.min(...arr)` throws
      // `RangeError: Maximum call stack size exceeded` — swallowed by the catch below,
      // silently zeroing unread counts for the whole conversation. `reduce` is O(n) with no
      // per-argument stack cost, so it holds for any group size.
      const hasUnboundedFloor = floors.some((f) => f.floorMs === null);
      const minFloorMs = hasUnboundedFloor
        ? null
        : floors.reduce(
            (min, f) => ((f.floorMs as number) < min ? (f.floorMs as number) : min),
            Infinity
          );

      // ONE query for all participants. No `senderId` filter here — the "exclude my own
      // messages" cut is per-participant, applied in memory below. `orderBy createdAt asc`
      // walks the index in order, so per-sender buckets stay ascending.
      const rows = (await this.prisma.message.findMany({
        where: {
          conversationId,
          deletedAt: null,
          ...(minFloorMs !== null ? { createdAt: { gt: new Date(minFloorMs) } } : {}),
        },
        select: needsMessageIds
          ? { id: true, createdAt: true, senderId: true }
          : { createdAt: true, senderId: true },
        orderBy: { createdAt: "asc" },
      })) as Array<{ id?: string; createdAt: Date; senderId: string }>;

      // All candidate timestamps (ascending) + per-sender buckets, so each participant's
      // own messages can be subtracted. `countAbove` is a binary search that assumes
      // ascending order and runs on BOTH `allTimestamps` AND every `bySender` bucket, so
      // BOTH must be sorted. The DB already returns index order (`orderBy createdAt asc`),
      // but sorting both is a defensive net that keeps the result correct regardless of
      // source ordering — sorting only the total while leaving the per-sender subtrahend
      // in raw row order would miscount the own-message cut (yielding a bogus, even
      // negative, unread count) the moment rows ever arrived unordered.
      const allTimestamps = rows.map((r) => r.createdAt.getTime()).sort((a, b) => a - b);
      const bySender = new Map<string, number[]>();
      for (const r of rows) {
        const bucket = bySender.get(r.senderId);
        if (bucket) bucket.push(r.createdAt.getTime());
        else bySender.set(r.senderId, [r.createdAt.getTime()]);
      }
      for (const bucket of bySender.values()) bucket.sort((a, b) => a - b);

      // countAbove(ts, F) = number of timestamps strictly > F. Upper-bound binary search on
      // an ascending array: first index where ts > F → `length - lo`. Strict `>` mirrors
      // `createdAt: { gt: floor }` (a message at exactly the floor is not counted). `null`
      // floor counts the whole array.
      const countAbove = (sorted: number[], floorMs: number | null): number => {
        if (floorMs === null) return sorted.length;
        let lo = 0;
        let hi = sorted.length;
        while (lo < hi) {
          const mid = (lo + hi) >>> 1;
          if (sorted[mid] > floorMs) hi = mid;
          else lo = mid + 1;
        }
        return sorted.length - lo;
      };

      // unread(p) = (all messages after p's floor) − (p's OWN messages after p's floor).
      // Both `allTimestamps` and each bucket are sorted ascending above, so the same
      // binary search is valid on either.
      //
      // A reader who hid individual messages cannot be counted by a bound — set
      // membership is not an interval — so they fall to a linear pass over the same
      // rows. `hiddenMessageIds !== null` implies `needsMessageIds`, so `r.id` is
      // present exactly where it is read.
      const countExcludingHidden = (f: (typeof floors)[number], hidden: Set<string>): number =>
        rows.filter(
          (r) =>
            r.senderId !== f.id &&
            (f.floorMs === null || r.createdAt.getTime() > f.floorMs) &&
            !hidden.has(r.id as string)
        ).length;

      return new Map(
        floors.map((f) => {
          if (f.hiddenMessageIds !== null) return [f.id, countExcludingHidden(f, f.hiddenMessageIds)];
          const own = bySender.get(f.id) ?? [];
          return [f.id, countAbove(allTimestamps, f.floorMs) - countAbove(own, f.floorMs)];
        })
      );
    } catch (error) {
      logger.error("[MessageReadStatus] Error batch-computing unread counts", error);
      return new Map(participants.map((p) => [p.id, 0]));
    }
  }

  /**
   * Calcule le unreadCount pour plusieurs conversations d'un utilisateur.
   * Version optimisée iter-4 : 2 + N requêtes au lieu de 4 × N.
   *   1. participant.findMany  — résout les Participants du user (1 query)
   *   2. cursor.findMany       — batch tous les cursors (1 query)
   *   3. message.count × N    — comptage en parallèle (N queries)
   * Returns 0 for any conversation in which the participant cannot be resolved.
   *
   * Le masquage personnel est chargé PAR CONVERSATION (2 requêtes batchées) :
   * une coupure d'historique appartient à un couple (utilisateur, conversation),
   * jamais à l'utilisateur seul. Appliquer la coupure d'une conversation aux
   * autres viderait des badges qui n'ont rien à se reprocher.
   */
  async getUnreadCountsForUser(
    userId: string,
    conversationIds: string[]
  ): Promise<Map<string, number>> {
    if (conversationIds.length === 0) return new Map();
    try {
      const unreadCounts = new Map<string, number>();
      conversationIds.forEach((id) => unreadCounts.set(id, 0));

      // 1. Batch participant lookup for this user across all conversations
      const participants = await this.prisma.participant.findMany({
        where: {
          conversationId: { in: conversationIds },
          isActive: true,
          OR: [{ id: userId }, { userId }],
        },
        select: { id: true, userId: true, conversationId: true, joinedAt: true },
      });

      if (participants.length === 0) return unreadCounts;

      // 2. Batch cursor lookup for all resolved participants, alongside the
      // personal hiding of each conversation — neither depends on the other, and
      // both must land before the counts.
      //
      // `userId` peut être un Participant.id (appelant anonyme) : la résolution
      // passe par la ligne Participant, seule à connaître le compte réel. Un
      // participant sans compte ne possède ni préférence ni suppression
      // personnelle — la recherche est alors sautée entièrement.
      const participantIds = participants.map((p) => p.id);
      const resolvedUserId = participants.find((p) => p.userId)?.userId ?? null;
      const [cursors, hidingByConversation] = await Promise.all([
        this.prisma.conversationReadCursor.findMany({
          where: { participantId: { in: participantIds } },
          select: { participantId: true, lastReadAt: true, lastReadMessageCreatedAt: true },
        }),
        loadPersonalHistoryHidingByConversation(this.prisma, {
          userId: resolvedUserId,
          conversationIds: participants.map((p) => p.conversationId),
        }),
      ]);
      // Position CHRONOLOGIQUE du curseur, pas l'horloge murale — voir
      // getUnreadCount. En mode exact `lastReadAt = now` déclarerait lus les
      // messages sautés ; `lastReadMessageCreatedAt` est le vrai plancher.
      const cursorMap = new Map(
        cursors.map((c) => [c.participantId, c.lastReadMessageCreatedAt ?? c.lastReadAt])
      );

      // 3. Parallel message counts — one per participant (= one per conversation)
      await Promise.all(
        participants.map(async (p) => {
          const cursorFloor = cursorMap.get(p.id) ?? null;
          const floor: Date | null = cursorFloor ?? p.joinedAt ?? null;
          const count = await this.prisma.message.count({
            where: applyPersonalHistoryHiding(
              {
                conversationId: p.conversationId,
                deletedAt: null,
                senderId: { not: p.id },
                ...(floor ? { createdAt: { gt: floor } } : {}),
              },
              hidingByConversation.get(p.conversationId) ?? NO_PERSONAL_HIDING
            ),
          });
          unreadCounts.set(p.conversationId, count);
        })
      );

      return unreadCounts;
    } catch (error) {
      logger.error("[MessageReadStatus] Error getting unread counts for user", error);
      return new Map();
    }
  }

  /**
   * @deprecated Utiliser getUnreadCountsForUser(userId, conversationIds) — iter-4.
   * Conservé pour la compatibilité des appelants qui passent participantIds.
   */
  async getUnreadCountsForConversations(
    participantIds: string[],
    conversationIds: string[]
  ): Promise<Map<string, number>> {
    // Délègue vers la nouvelle méthode en passant le premier participantId comme userId.
    // En pratique l'appelant dans core.ts résout déjà un userId unique.
    const userId = participantIds[0];
    if (!userId) return new Map();
    return this.getUnreadCountsForUser(userId, conversationIds);
  }

  /**
   * Avance atomiquement `lastDeliveredMessageId`/`lastReadMessageId` sur
   * `ConversationReadCursor`. Un `upsert` ne peut pas porter de condition de
   * garde au-delà de la clé unique — la décision "stale ou non" ne peut donc
   * pas être évaluée sur un snapshot lu avant l'écriture (TOCTOU : deux appels
   * concurrents pour des messages différents liraient tous deux le même
   * curseur "pas encore avancé", et celui qui écrit en dernier gagnerait même
   * si son message est plus ancien). Ici la garde de fraîcheur fait partie du
   * WHERE de l'`updateMany`, évaluée atomiquement par MongoDB au moment de
   * l'écriture — même schéma que la garde `lastMessageAt` de
   * `MessageHandler.handleMessageDelete`. Retourne `true` si le curseur a été
   * créé ou avancé, `false` si l'appel était stale (message déjà dépassé).
   */
  private async _advanceCursor(params: {
    participantId: string;
    conversationId: string;
    messageId: string;
    now: Date;
    idField: "lastDeliveredMessageId" | "lastReadMessageId";
    atField: "lastDeliveredAt" | "lastReadAt";
    resetUnreadCount: boolean;
    // Whether a cursor row was seen on the best-effort read the caller already
    // did (for the freeze-window bound). Existence rarely changes between
    // that read and this write — once created, a cursor row is only ever
    // removed by cleanup jobs — so it's safe to use as a hint for whether a
    // updateMany miss means "stale" vs. "needs create", without an extra query.
    cursorExists: boolean;
  }): Promise<boolean> {
    const { participantId, conversationId, messageId, now, idField, atField, resetUnreadCount, cursorExists } = params;

    const createdAtField = CREATED_AT_FIELD_FOR[idField];

    // Resolve the incoming message's createdAt — the chronological key the guard
    // orders by. Best-effort: if it can't be read (message deleted between send
    // and receipt, or a non-ObjectId test id), buildCursorFreshnessGuard falls
    // back to the historical ObjectId-order guard.
    let messageCreatedAt: Date | null = null;
    if (OBJECT_ID_RE.test(messageId)) {
      try {
        const message = await this.prisma.message.findUnique({
          where: { id: messageId },
          select: { createdAt: true },
        });
        messageCreatedAt = message?.createdAt ?? null;
      } catch {
        messageCreatedAt = null;
      }
    }

    const guardWhere = {
      participantId,
      conversationId,
      ...(buildCursorFreshnessGuard({ idField, createdAtField, messageId, messageCreatedAt }) ?? {}),
    };
    const advanceData = {
      [idField]: messageId,
      [atField]: now,
      // Never overwrite a recorded createdAt with null — write-forward only, so
      // an unresolved incoming createdAt can't erase the guard's ordering key.
      ...(messageCreatedAt ? { [createdAtField]: messageCreatedAt } : {}),
      ...(resetUnreadCount ? { unreadCount: 0 } : {}),
      version: { increment: 1 },
    };

    const advanced = await this.prisma.conversationReadCursor.updateMany({
      where: guardWhere,
      data: advanceData,
    });
    if (advanced.count > 0) return true;
    if (cursorExists) return false; // Genuinely stale: existing row is already at/past this message.

    try {
      await this.prisma.conversationReadCursor.create({
        data: {
          participantId,
          conversationId,
          [idField]: messageId,
          [atField]: now,
          ...(messageCreatedAt ? { [createdAtField]: messageCreatedAt } : {}),
          unreadCount: 0,
          version: 0,
        },
      });
      return true;
    } catch (error: any) {
      // Unique constraint: a concurrent call created the row between our
      // best-effort read and this create — retry the guarded update once.
      if (error?.code === "P2002") {
        const retried = await this.prisma.conversationReadCursor.updateMany({
          where: guardWhere,
          data: advanceData,
        });
        return retried.count > 0;
      }
      throw error;
    }
  }

  /**
   * Marque les messages comme reçus pour un utilisateur connecté
   * Simplifié: Met à jour le curseur `lastDeliveredAt` UNIQUEMENT.
   */
  async markMessagesAsReceived(
    participantId: string,
    conversationId: string,
    latestMessageId?: string
  ): Promise<void> {
    // Hoisted so the catch below can release the dedup key when the write
    // fails — a poisoned key would otherwise swallow every retry within the
    // TTL and silently drop the delivery receipt.
    let dedupKey: string | undefined;
    try {
      // Resolve the effective target message id BEFORE the dedup gate. When the
      // caller omits latestMessageId, the dedup key must reflect the ACTUAL
      // newest message — not the constant "latest" — otherwise two argument-less
      // calls that resolve to DIFFERENT newest messages collide on one key and
      // the second is silently dropped by the TTL gate, stalling the delivery
      // advance for up to the full window even though a newer message arrived.
      let messageId = latestMessageId;
      if (!messageId) {
        const latestMessage = await this.prisma.message.findFirst({
          where: { conversationId, deletedAt: null },
          orderBy: { createdAt: "desc" },
          select: { id: true },
        });

        if (!latestMessage) return;
        messageId = latestMessage.id;
      }

      // Keyed by the RESOLVED messageId so a genuinely newer message always
      // produces a distinct key and is never swallowed by the TTL gate — only
      // identical repeats (same message within the TTL) are deduped.
      dedupKey = `${participantId}:${conversationId}:received:${messageId}`;
      const dedupNow = Date.now();
      const lastCall = MessageReadStatusService.recentActionCache.get(dedupKey);

      if (
        lastCall &&
        dedupNow - lastCall < MessageReadStatusService.DEDUP_TTL_MS
      ) {
        return;
      }

      MessageReadStatusService.recentActionCache.set(dedupKey, dedupNow);
      if (MessageReadStatusService.recentActionCache.size > 100) {
        MessageReadStatusService.cleanupDedupCache();
      }

      const now = new Date();

      // Best-effort: only bounds the freeze window, never fails the cursor
      // advance below (which is now the sole source of truth for staleness).
      let prevDeliveredAt: Date | null = null;
      let cursorExists = false;
      try {
        const prevCursor = await this.prisma.conversationReadCursor.findUnique({
          where: {
            conversation_participant_cursor: { participantId, conversationId },
          },
          select: { lastDeliveredAt: true },
        });
        prevDeliveredAt = prevCursor?.lastDeliveredAt ?? null;
        cursorExists = prevCursor != null;
      } catch {
        prevDeliveredAt = null;
      }

      // Out-of-order delivery receipt (e.g. two devices/retries racing): the
      // guard is evaluated atomically inside the write, never on a snapshot
      // read earlier — see _advanceCursor. Never rolls the cursor back to an
      // older message than what's already recorded.
      const advanced = await this._advanceCursor({
        participantId,
        conversationId,
        messageId,
        now,
        idField: "lastDeliveredMessageId",
        atField: "lastDeliveredAt",
        resetUnreadCount: false,
        cursorExists,
      });
      if (!advanced) {
        logger.info(
          `[MessageReadStatus] Ignoring stale received receipt for participant ${participantId} in conversation ${conversationId}`
        );
        return;
      }

      // Précision absolue : fige `deliveredAt`/`receivedAt` par message
      // nouvellement livré (write-once), pour persister la date de réception
      // de CHAQUE message au lieu de la dériver du curseur mobile.
      await this.freezeMessageStatus({
        participantId,
        conversationId,
        since: prevDeliveredAt,
        at: now,
        field: "deliveredAt",
      });

      logger.info(
        `[MessageReadStatus] Participant ${participantId} received update in conversation ${conversationId}`
      );
    } catch (error) {
      // Release the dedup key so a retry within the TTL is not swallowed by the
      // gate — the failed attempt recorded nothing, so the receipt must still
      // be markable. Deleting an already-cleared / never-set key is a no-op.
      if (dedupKey) {
        MessageReadStatusService.recentActionCache.delete(dedupKey);
      }
      logger.error(
        "[MessageReadStatus] Error marking messages as received:",
        error
      );
      throw error;
    }
  }

  /**
   * Marque les messages comme lus pour un utilisateur
   * Simplifié: Met à jour `lastReadAt` dans `ConversationReadCursor`.
   */
  /**
   * @param options.messageIds Identifiants des messages RÉELLEMENT affichés,
   *   rapportés par le client. Quand ils sont fournis, le gel `readAt` est borné
   *   à ces messages. En leur absence — binaires clients déjà distribués, qui
   *   postent un corps vide — on retombe sur la fenêtre temporelle historique,
   *   qui sur-déclare.
   * @see docs/superpowers/specs/2026-07-24-read-exactness-design.md
   */
  async markMessagesAsRead(
    participantId: string,
    conversationId: string,
    latestMessageId?: string,
    options?: {
      readonly messageIds?: readonly string[];
      /**
       * Version linguistique affichée pendant que ces messages défilaient sous
       * les yeux du lecteur — la résolution de la conversation. Une bascule sur
       * une bulle précise passe par {@link recordMessageLanguageView}.
       */
      readonly language?: string | null;
      /** Exceptions par message — cf. `freezeMessageStatus`. */
      readonly messageLanguages?: Readonly<Record<string, string>>;
      /**
       * Message le plus récent, ATTEINT par le lecteur. Fait sauter le curseur
       * de non-lus jusque-là — donc vide le badge — sans figer un seul `readAt`
       * de plus. Cf. `MarkReadBodySchema.caughtUpToMessageId`.
       */
      readonly caughtUpToMessageId?: string;
    }
  ): Promise<number> {
    // Hoisted so the catch below can release the dedup key when the write
    // fails — a poisoned key would otherwise swallow every retry within the
    // TTL and silently drop the read receipt.
    let dedupKey: string | undefined;
    const exactMessageIds = options?.messageIds;
    // La cascade « conversation lue → notifications lues » est INDÉPENDANTE de
    // l'avancement du curseur : elle part avant tous les early-returns
    // (conversation vide, dédup, receipt périmé). Sinon une réaction/mention
    // arrivée sur un message déjà lu laisse sa notification non lue à vie — le
    // curseur ne bougeant plus, l'ancien emplacement (fin de méthode) n'était
    // plus jamais atteint.
    this.syncConversationNotifications(participantId, conversationId);
    try {
      // Resolve the effective target message id BEFORE the dedup gate. When the
      // caller omits latestMessageId, the dedup key must reflect the ACTUAL
      // newest message — not the constant "latest" — otherwise two argument-less
      // calls that resolve to DIFFERENT newest messages collide on one key and
      // the second is silently dropped by the TTL gate, so the read cursor never
      // advances to the newer message until the window expires.
      let messageId = latestMessageId;
      if (!messageId) {
        const latestMessage = await this.prisma.message.findFirst({
          where: { conversationId, deletedAt: null },
          orderBy: { createdAt: "desc" },
          select: { id: true },
        });
        if (!latestMessage) return 0;
        messageId = latestMessage.id;
      }

      // La garde de déduplication est indexée sur le message le plus RÉCENT de
      // la conversation. En mode exact, deux lots successifs de messages
      // affichés partagent ce même message : la clé serait identique et le
      // second lot silencieusement avalé, donc perdu. La garde est neutralisée
      // dans ce mode — les écritures y sont write-once, donc déjà idempotentes,
      // et elle n'y protégeait que d'un travail redondant marginal.
      if (!exactMessageIds) {
        dedupKey = `${participantId}:${conversationId}:read:${messageId}`;
        const dedupNow = Date.now();
        const lastCall = MessageReadStatusService.recentActionCache.get(dedupKey);

        if (
          lastCall &&
          dedupNow - lastCall < MessageReadStatusService.DEDUP_TTL_MS
        ) {
          return 0;
        }
        MessageReadStatusService.recentActionCache.set(dedupKey, dedupNow);
      }

      const now = new Date();

      // Lecture best-effort du front précédent : sert uniquement à borner la
      // fenêtre du gel. Une erreur ici ne doit pas faire échouer le marquage
      // (on retombe sur `null` = gel depuis l'origine, lui-même résilient).
      let prevReadAt: Date | null = null;
      let prevDeliveredAt: Date | null = null;
      let cursorExists = false;
      try {
        const prevCursor = await this.prisma.conversationReadCursor.findUnique({
          where: {
            conversation_participant_cursor: { participantId, conversationId },
          },
          select: { lastReadAt: true, lastDeliveredAt: true },
        });
        prevReadAt = prevCursor?.lastReadAt ?? null;
        prevDeliveredAt = prevCursor?.lastDeliveredAt ?? null;
        cursorExists = prevCursor != null;
      } catch {
        prevReadAt = null;
        prevDeliveredAt = null;
      }

      // Out-of-order read receipt (e.g. a second, staler device catching up
      // after a fresher one already advanced the cursor): the guard is
      // evaluated atomically inside the write, never on a snapshot read
      // earlier — see _advanceCursor. Never rolls the read cursor back to an
      // older message — that would resurrect already-read messages as unread.
      let frozenCount = 0;
      if (exactMessageIds) {
        // MODE EXACT — l'ordre est inversé par rapport au mode hérité : on fige
        // d'abord, car un message affiché EST lu, que le curseur puisse avancer
        // ou non. Le curseur ne s'aligne qu'ensuite, sur ce qui est réellement lu.
        frozenCount = await this.freezeMessageStatus({
          participantId,
          conversationId,
          since: prevReadAt,
          at: now,
          field: "readAt",
          messageIds: exactMessageIds,
          language: options?.language,
          messageLanguages: options?.messageLanguages,
        });

        const cursorTarget = await this._computeExactReadCursorTarget({
          participantId,
          conversationId,
          since: prevReadAt,
        });

        // `null` = le message suivant immédiatement le curseur n'a pas été vu.
        // Le curseur ne bouge pas : sauter au bas d'une conversation ne doit
        // pas figer un `readAt` sur ce qui a été survolé.
        if (cursorTarget) {
          await this._advanceCursor({
            participantId,
            conversationId,
            messageId: cursorTarget,
            now,
            cursorExists,
            idField: "lastReadMessageId",
            atField: "lastReadAt",
            resetUnreadCount: false,
          });
        }

        // Rattrapage : le lecteur a ATTEINT le dernier message. Le curseur
        // saute jusque-là et le badge tombe, sans qu'aucun `readAt`
        // supplémentaire n'ait été figé au-dessus — les accusés de lecture
        // restent le reflet exact de ce qui a été affiché. Après l'avance par
        // préfixe contigu, jamais avant : la garde de fraîcheur de
        // `_advanceCursor` ignorerait alors la seconde comme périmée.
        if (options?.caughtUpToMessageId) {
          await this._advanceCursor({
            participantId,
            conversationId,
            messageId: options.caughtUpToMessageId,
            now,
            cursorExists: cursorExists || cursorTarget != null,
            idField: "lastReadMessageId",
            atField: "lastReadAt",
            resetUnreadCount: true,
          });
        }
      } else {
        const advanced = await this._advanceCursor({
          participantId,
          conversationId,
          messageId,
          now,
          cursorExists,
          idField: "lastReadMessageId",
          atField: "lastReadAt",
          resetUnreadCount: true,
        });
        if (!advanced) {
          logger.info(
            `[MessageReadStatus] Ignoring stale read receipt for participant ${participantId} in conversation ${conversationId}`
          );
          return 0;
        }

        // Précision absolue : fige un `MessageStatusEntry.readAt` par message
        // nouvellement franchi (write-once). Sans cela, le statut "lu" de chaque
        // message suivrait le curseur mobile `lastReadAt`, qui ré-avance à
        // `now` à chaque ouverture — collapsant tous les anciens messages à la
        // même date. Le curseur reste l'index rapide ; la date par message est
        // gelée à la première lecture.
        frozenCount = await this.freezeMessageStatus({
          participantId,
          conversationId,
          since: prevReadAt,
          at: now,
          field: "readAt",
          language: options?.language,
          messageLanguages: options?.messageLanguages,
        });
      }

      // Read implies delivered: a message can never be read without first having
      // been delivered. When a recipient opens a conversation whose newest
      // message was never marked received (they were offline when it arrived, so
      // no delivery receipt / auto-deliver ran), advancing only the read cursor
      // leaves the delivery frontier behind the read frontier — the sender then
      // sees the "read" tick ahead of the "delivered" tick (readCount > deliveredCount),
      // an impossible state. Also advance the delivery cursor and freeze
      // deliveredAt/receivedAt for the same window. Both operations are idempotent
      // (the cursor guard no-ops when delivery is already ahead; the freeze is
      // write-once), so this is a cheap no-op on the healthy delivered-then-read path.
      const deliveredAdvanced = await this._advanceCursor({
        participantId,
        conversationId,
        messageId,
        now,
        // Le vrai `cursorExists`, pas un `true` codé en dur : en mode exact où le
        // curseur de lecture n'a pas avancé (message suivant non lu) ET où aucun
        // curseur n'existait, l'avance de lecture n'a rien créé — coder `true`
        // fait alors interpréter le miss de l'`updateMany` comme « déjà en
        // avance », donc SANS création : le curseur de livraison reste inexistant
        // et le gel `deliveredAt` est sauté, laissant l'état impossible
        // « lu > livré ». Le vrai flag crée le curseur de livraison quand il
        // manque ; la course concurrente reste couverte par le catch P2002 de
        // `_advanceCursor`. Sur le chemin sain (curseur déjà là), l'`updateMany`
        // matche et le flag n'est jamais consulté.
        cursorExists,
        idField: "lastDeliveredMessageId",
        atField: "lastDeliveredAt",
        resetUnreadCount: false,
      });
      if (deliveredAdvanced) {
        await this.freezeMessageStatus({
          participantId,
          conversationId,
          since: prevDeliveredAt,
          at: now,
          field: "deliveredAt",
        });
      }

      logger.info(
        `[MessageReadStatus] Participant ${participantId} marked conversation ${conversationId} as read`
      );

      return frozenCount;
    } catch (error) {
      // Release the dedup key so a retry within the TTL is not swallowed by the
      // gate — the failed attempt recorded nothing, so the receipt must still
      // be markable. Deleting an already-cleared / never-set key is a no-op.
      if (dedupKey) {
        MessageReadStatusService.recentActionCache.delete(dedupKey);
      }
      logger.error(
        "[MessageReadStatus] Error marking messages as read:",
        error
      );
      throw error;
    }
  }

  /**
   * Cascade « conversation lue → notifications de la conversation lues ».
   *
   * Fire-and-forget avec sa propre clé de dédup (même TTL que les receipts) :
   * les flushs rapprochés du client (IntersectionObserver web ~1/s) ne
   * déclenchent qu'un update Mongo par fenêtre, tout en restant indépendants
   * des gardes du curseur de lecture. Utilise le NotificationService PARTAGÉ
   * (câblé `io`) quand il est enregistré, pour que `notification:counts`
   * atteigne réellement les clients — le repli local reste correct pour les
   * écritures DB.
   */
  private syncConversationNotifications(
    participantId: string,
    conversationId: string
  ): void {
    const dedupKey = `${participantId}:${conversationId}:notif-sync`;
    const now = Date.now();
    const lastCall = MessageReadStatusService.recentActionCache.get(dedupKey);
    if (lastCall && now - lastCall < MessageReadStatusService.DEDUP_TTL_MS) {
      return;
    }
    MessageReadStatusService.recentActionCache.set(dedupKey, now);

    void (async () => {
      try {
        const participant = await this.prisma.participant.findUnique({
          where: { id: participantId },
          select: { userId: true },
        });
        if (!participant?.userId) return;

        const { getSharedNotificationService } = await import(
          "./notifications/notification-service-registry"
        );
        let notificationService = getSharedNotificationService();
        if (!notificationService) {
          const { NotificationService } = await import(
            "./notifications/NotificationService"
          );
          notificationService = new NotificationService(this.prisma);
        }
        await notificationService.markConversationNotificationsAsRead(
          participant.userId,
          conversationId
        );
      } catch (notifError) {
        // Best-effort : libérer la clé pour qu'un rappel dans le TTL retente.
        MessageReadStatusService.recentActionCache.delete(dedupKey);
        logger.warn(
          "[MessageReadStatus] Error syncing notifications:",
          notifError
        );
      }
    })().catch((error: unknown) =>
      // La garde du SITE, disjointe de celle du corps (leçon 230). Le `catch`
      // ci-dessus décrit ce que l'IIFE sait rattraper ; celui-ci décrit ce
      // qu'elle ne sait PAS — un rejet du `catch` lui-même, ou de la seule
      // instruction qui le précède. Une promesse détachée n'a pas d'appelant
      // pour porter son rejet, et Node 22 y répond en arrêtant le process.
      logger.warn("[MessageReadStatus] notification sync rejected", { error })
    );
  }

  /**
   * Participants dont le propriétaire a désactivé ses accusés de lecture.
   *
   * Ils sortent du **numérateur et du dénominateur** des statuts exposés aux
   * autres. Les retirer du seul numérateur rendrait le total définitivement
   * inatteignable, ce qui trahirait leur existence ; garder le compteur en
   * masquant leur nom laisserait déduire trivialement qu'ils ont lu.
   *
   * Une seule requête indexée, sur la clé issue de sa source de vérité plutôt
   * que dupliquée ici. Les participants anonymes et bots n'ont pas de `userId`,
   * donc pas de préférence stockée : ils restent visibles (défaut `true`).
   *
   * Repli **ouvert** en cas d'erreur — tout le monde reste visible. C'est la
   * convention déjà retenue par `PrivacyPreferencesService.fetchFromDatabase`,
   * et échouer fermé masquerait les accusés de TOUS sur un incident transitoire.
   *
   * @see docs/superpowers/specs/2026-07-24-read-exactness-design.md
   */
  /**
   * Ne garde que les participants dont les accusés peuvent être MONTRÉS.
   *
   * Version publique de la règle ci-dessus, pour les appelants qui exposent des
   * accusés NOMINATIFS (horodatage + identité) et non un simple compteur. Elle
   * répond à la question telle qu'un appelant se la pose — « lesquels ai-je le
   * droit de montrer ? » — plutôt que de lui livrer l'ensemble des exclus, dont
   * la seule taille trahirait déjà combien de participants se sont retirés.
   *
   * Sans elle, un appelant hors de ce service n'a d'autre choix que de relire
   * `UserPreference` lui-même — c'est-à-dire de réimplémenter la règle, ce qui
   * l'a déjà fait diverger une fois (cf. `services/gateway/decisions.md`
   * § 2026-08-13).
   */
  async filterReadReceiptVisible<T extends { id: string; userId?: string | null }>(
    participants: ReadonlyArray<T>
  ): Promise<T[]> {
    const optedOut = await this._loadReadReceiptOptOuts(participants);
    return participants.filter((p) => !optedOut.has(p.id));
  }

  private async _loadReadReceiptOptOuts(
    participants: ReadonlyArray<{ id: string; userId?: string | null }>
  ): Promise<Set<string>> {
    const participantsByUserId = new Map<string, string[]>();
    for (const participant of participants) {
      if (!participant.userId) continue;
      const known = participantsByUserId.get(participant.userId);
      if (known) known.push(participant.id);
      else participantsByUserId.set(participant.userId, [participant.id]);
    }

    if (participantsByUserId.size === 0) return new Set();

    const excluded = new Set<string>();

    try {
      // Même résolveur ET même cache que les cinq autres portes de diffusion :
      // la règle « où la préférence est-elle rangée ? » n'a qu'un seul endroit,
      // et sa mémoire aussi. La lire ici en propre l'avait déjà fait diverger
      // une fois (cf. `decisions.md` § 2026-08-13), puis une seconde fois en
      // silence en n'interrogeant que les lignes clé/valeur héritées que
      // l'application n'écrit plus (§ 2026-08-16) ; la mémoïser ici en propre
      // rendait cette porte SOURDE aux purges d'écriture (§ 2026-08-16 bis).
      const stored = await loadPrivacyPreferencesCached(this.prisma, [
        ...participantsByUserId.keys(),
      ]);

      for (const [userId, participantIds] of participantsByUserId) {
        if (stored.get(userId)?.showReadReceipts !== false) continue;
        for (const participantId of participantIds) excluded.add(participantId);
      }
      return excluded;
    } catch (error) {
      logger.error(
        "[MessageReadStatus] _loadReadReceiptOptOuts failed — everyone stays visible:",
        error
      );
      return new Set();
    }
  }

  /**
   * Détermine jusqu'où le curseur de lecture peut avancer sans franchir un
   * message non lu, en repartant de sa position courante.
   *
   * Le compteur de non-lus dérive du curseur (`createdAt > lastReadAt`) : le
   * laisser sauter par-dessus des messages jamais affichés reviendrait à les
   * déclarer lus par ricochet, ce que tout ce lot corrige. On s'arrête donc au
   * premier trou.
   *
   * Résilient : ne jette jamais — à défaut, le curseur reste en place et
   * rattrapera au passage suivant.
   */
  private async _computeExactReadCursorTarget(params: {
    participantId: string;
    conversationId: string;
    since: Date | null;
  }): Promise<string | null> {
    const { participantId, conversationId, since } = params;
    try {
      const candidates = await this.prisma.message.findMany({
        where: {
          conversationId,
          deletedAt: null,
          senderId: { not: participantId },
          ...(since ? { createdAt: { gt: since } } : {}),
        },
        orderBy: { createdAt: "asc" },
        take: EXACT_CURSOR_SCAN_LIMIT,
        select: { id: true },
      });
      if (candidates.length === 0) return null;

      const orderedIds = candidates.map((m) => m.id);
      const readEntries = await this.prisma.messageStatusEntry.findMany({
        where: {
          messageId: { in: orderedIds },
          participantId,
          readAt: { not: null },
        },
        select: { messageId: true },
      });

      return computeContiguousReadPrefix(
        orderedIds,
        new Set(readEntries.map((e) => e.messageId))
      );
    } catch (error) {
      logger.error(
        `[MessageReadStatus] _computeExactReadCursorTarget failed for participant ${participantId} in conversation ${conversationId}:`,
        error
      );
      return null;
    }
  }

  /**
   * Fige (write-once) la date de livraison/lecture par message pour les
   * messages d'une fenêtre temporelle nouvellement franchie par un
   * participant. Chaque champ (`deliveredAt`/`receivedAt` ou `readAt`) n'est
   * écrit qu'une seule fois : une entrée déjà figée n'est jamais réécrite, ce
   * qui garantit la précision historique (le curseur, lui, ré-avance à chaque
   * ouverture). Résilient : ne jette jamais — une erreur ici ne doit pas faire
   * échouer le marquage du curseur.
   */
  private async freezeMessageStatus(params: {
    participantId: string;
    conversationId: string;
    since: Date | null;
    at: Date;
    field: "readAt" | "deliveredAt";
    /**
     * Restreint le gel aux messages réellement affichés. Une liste VIDE est
     * significative — « rien n'a été affiché » — et ne retombe donc pas sur la
     * fenêtre. Seule l'absence du paramètre déclenche le repli historique.
     * Réservé à `readAt` : un message récupéré est livré même s'il n'a jamais
     * été affiché, donc la fenêtre reste correcte pour `deliveredAt`.
     */
    messageIds?: readonly string[];
    /**
     * Version linguistique affichée au lecteur. Contrairement à l'horodatage,
     * elle n'est PAS write-once : un lecteur qui bascule sur la traduction a
     * réellement consulté les deux versions, et les deux doivent apparaître.
     * Ignorée pour `deliveredAt` — une livraison n'a pas de langue.
     */
    language?: string | null;
    /**
     * EXCEPTIONS à `language`, par message. La langue rendue n'est pas toujours
     * celle que le lecteur préfère : sans traduction disponible, c'est
     * l'ORIGINAL qui s'affiche. Le client ne déclare que ce qui diffère.
     */
    messageLanguages?: Readonly<Record<string, string>>;
    /** @returns nombre d'entrées RÉELLEMENT figées par cet appel. */
  }): Promise<number> {
    const { participantId, conversationId, since, at, field, messageIds } = params;
    const defaultLanguage =
      field === "readAt" ? normalizeLanguageCode(params.language) : undefined;
    const perMessage = field === "readAt" ? params.messageLanguages : undefined;
    const languageFor = (messageId: string): string | undefined =>
      normalizeLanguageCode(perMessage?.[messageId]) ?? defaultLanguage;
    const anyLanguage = Boolean(defaultLanguage) || Boolean(perMessage && Object.keys(perMessage).length);
    try {
      const messages = await this.prisma.message.findMany({
        where: {
          // Ces trois gardes tiennent dans les deux modes : une liste d'ids
          // forgée par un client ne permet pas de marquer lu un message d'une
          // autre conversation, supprimé, ou émis par le participant lui-même.
          conversationId,
          deletedAt: null,
          senderId: { not: participantId },
          ...(messageIds
            ? { id: { in: [...messageIds] } }
            : { createdAt: { lte: at, ...(since ? { gt: since } : {}) } }),
        },
        select: { id: true },
      });

      if (messages.length === 0) return 0;
      const ids = messages.map((m) => m.id);

      const existing = await this.prisma.messageStatusEntry.findMany({
        where: { messageId: { in: ids }, participantId },
        select: {
          messageId: true,
          deliveredAt: true,
          readAt: true,
          viewedLanguages: true,
        },
      });
      const existingIds = new Set(existing.map((e) => e.messageId));
      const toCreate = ids.filter((id) => !existingIds.has(id));

      let frozen = 0;
      if (toCreate.length > 0) {
        const created = await this.prisma.messageStatusEntry.createMany({
          data: toCreate.map((messageId) =>
            field === "readAt"
              ? {
                  messageId,
                  conversationId,
                  participantId,
                  readAt: at,
                  ...(languageFor(messageId)
                    ? { viewedLanguages: [languageFor(messageId) as string] }
                    : {}),
                }
              : {
                  messageId,
                  conversationId,
                  participantId,
                  deliveredAt: at,
                  receivedAt: at,
                }
          ),
        });
        frozen += created?.count ?? toCreate.length;
      }

      // Write-once: ne renseigne le champ que sur les entrées où il est encore
      // nul (ex: une entrée créée par la livraison reçoit ensuite son `readAt`).
      const toUpdate = existing
        .filter((e) => (field === "readAt" ? e.readAt === null : e.deliveredAt === null))
        .map((e) => e.messageId);

      if (toUpdate.length > 0) {
        const updated = await this.prisma.messageStatusEntry.updateMany({
          where:
            field === "readAt"
              ? { messageId: { in: toUpdate }, participantId, readAt: null }
              : { messageId: { in: toUpdate }, participantId, deliveredAt: null },
          data: field === "readAt" ? { readAt: at } : { deliveredAt: at, receivedAt: at },
        });
        frozen += updated?.count ?? toUpdate.length;
      }

      // La langue s'UNIONNE, là où l'horodatage se fige. Seules les entrées qui
      // ne la connaissent pas encore sont réécrites : sur le chemin courant — le
      // lecteur ne change pas de langue entre deux lots — cette passe n'écrit
      // rien du tout. Les entrées créées ci-dessus l'ont déjà reçue.
      if (anyLanguage) {
        // Regroupé par langue : un lot lu d'une traite n'en compte qu'une, donc
        // un seul `updateMany`. Les exceptions (message resté dans sa langue
        // d'origine faute de traduction) forment les groupes suivants.
        const byLanguage = new Map<string, string[]>();
        for (const entry of existing) {
          const code = languageFor(entry.messageId);
          if (!code) continue;
          // Re-normalise l'existant via le SSOT avant la dédup : une locale
          // complète héritée (`fr-FR`) désigne la même version que `fr`, et ne
          // doit ni rouvrir un push doublon ni gonfler le plafond.
          const known = mergeViewedLanguages(entry.viewedLanguages, []);
          if (known.includes(code)) continue;
          if (known.length >= MAX_VIEWED_LANGUAGES) continue;
          byLanguage.set(code, [...(byLanguage.get(code) ?? []), entry.messageId]);
        }

        for (const [code, ids] of byLanguage) {
          await this.prisma.messageStatusEntry.updateMany({
            where: { messageId: { in: ids }, participantId },
            data: { viewedLanguages: { push: code } },
          });
        }
      }

      return frozen;
    } catch (error) {
      logger.error(
        `[MessageReadStatus] freezeMessageStatus(${field}) failed for participant ${participantId} in conversation ${conversationId}:`,
        error
      );
      // Ne jette jamais : une erreur de gel ne doit pas faire échouer le
      // marquage du curseur. Rien n'a été figé, le compte est donc nul.
      return 0;
    }
  }

  /**
   * Récupère le statut de lecture d'un message spécifique via les curseurs
   */
  async getMessageReadStatus(
    messageId: string,
    conversationId: string
  ): Promise<{
    messageId: string;
    totalMembers: number;
    receivedCount: number;
    readCount: number;
    notSeenCount: number;
    receivedBy: Array<{ participantId: string; displayName: string; avatarURL: string | null; receivedAt: Date }>;
    readBy: Array<{
      participantId: string;
      displayName: string;
      avatarURL: string | null;
      readAt: Date;
      viewedLanguages: string[];
    }>;
    notSeenBy: Array<{ participantId: string; displayName: string; avatarURL: string | null }>;
    attachmentConsumption: Array<{
      attachmentId: string;
      participants: Array<{
        participantId: string;
        displayName: string;
        avatarURL: string | null;
        lastPlayPositionMs: number | null;
        listenedComplete: boolean;
        lastWatchPositionMs: number | null;
        watchedComplete: boolean;
        listenCoverage: Array<{ startMs: number; endMs: number }>;
        watchCoverage: Array<{ startMs: number; endMs: number }>;
        listenStretchCount: number;
        watchStretchCount: number;
        viewCount: number;
        viewedLanguages: string[];
      }>;
      languageBreakdown: Array<{ language: string; count: number }>;
    }>;
    /** Répartition des LECTEURS du message par version linguistique consultée. */
    languageBreakdown: Array<{ language: string; count: number }>;
  }> {
    try {
      const message = await this.prisma.message.findUnique({
        where: { id: messageId },
        select: { createdAt: true, senderId: true },
      });

      if (!message) throw new Error(`Message ${messageId} not found`);

      const allParticipants = await this.prisma.participant.findMany({
        where: { conversationId, isActive: true },
        select: {
          id: true,
          userId: true,
          displayName: true,
          avatar: true,
          user: { select: { avatar: true } },
        },
      });

      // Filtré EN AMONT : les opt-out disparaissent ainsi du dénominateur
      // (`totalMembers`) comme du numérateur, sans traitement séparé.
      const optedOut = await this._loadReadReceiptOptOuts(allParticipants);
      const participants = allParticipants.filter((p) => !optedOut.has(p.id));

      // Denominator = active recipients EXCLUDING the sender, by IDENTITY. A
      // blind `participants.length - 1` drops an active recipient when the
      // sender has LEFT the conversation (absent from `participants`), lighting
      // up "received/read by all" one recipient too early. Mirrors
      // `computeRecipientCount` (messages route) and `getLatestMessageSummary`.
      const totalMembers = participants.filter(p => p.id !== message.senderId).length;

      // NOTE: `include: { participant }` is intentionally avoided here.
      // Prisma + MongoDB does not enforce referential integrity on relation
      // fields, so a `ConversationReadCursor` can outlive its `Participant`
      // (e.g. participant deleted / banned / data migration). When that
      // happens, `include` lifts the JOIN to strict mode and Prisma raises
      // `PrismaClientUnknownRequestError: Inconsistent query result: Field
      // participant is required to return data, got null instead`, which
      // crashes the entire endpoint. We therefore read the cursors raw and
      // join the participants we already loaded above in JS.
      const cursors = await this.prisma.conversationReadCursor.findMany({
        where: {
          conversationId,
          participantId: { not: message.senderId },
        },
        select: {
          participantId: true,
          lastDeliveredAt: true,
          lastReadAt: true,
        },
      });

      const participantById = new Map(
        participants.map(p => [p.id, p])
      );

      // Précision absolue : les dates FIGÉES par message (write-once) priment
      // sur la dérivation curseur — exactement comme `getMessageStatusDetails`.
      // Le curseur `lastDeliveredAt`/`lastReadAt` ré-avance à chaque ouverture
      // de conversation : l'utiliser ici afficherait la DERNIÈRE visite du
      // participant, pas le moment où il a réellement reçu / lu CE message
      // (incohérence de gestion de statut). Le fallback curseur ne sert que
      // pour les messages franchis AVANT l'introduction du gel (legacy).
      const frozenEntries = await this.prisma.messageStatusEntry.findMany({
        where: { messageId },
        select: {
          participantId: true,
          deliveredAt: true,
          receivedAt: true,
          readAt: true,
          viewedLanguages: true,
        },
      });
      const frozenByParticipant = new Map(
        frozenEntries.map(e => [e.participantId, e])
      );

      const receivedBy: Array<{
        participantId: string;
        displayName: string;
        avatarURL: string | null;
        receivedAt: Date;
      }> = [];
      const readBy: Array<{
        participantId: string;
        displayName: string;
        avatarURL: string | null;
        readAt: Date;
        /**
         * Versions linguistiques dans lesquelles ce lecteur a consulté le
         * message. Vide pour une lecture antérieure à la mesure, ou pour un
         * client qui ne rapporte pas encore sa langue.
         */
        viewedLanguages: string[];
      }> = [];

      const cursorByParticipant = new Map(cursors.map(c => [c.participantId, c]));

      // Énumère l'UNION des participants ayant un curseur ET de ceux ayant une
      // entrée figée (`MessageStatusEntry`) pour CE message. `cleanupObsoleteCursors`
      // peut supprimer un curseur (son `lastReadMessageId` pointe vers un message
      // effacé) alors que le reçu figé write-once de CE message-ci survit : énumérer
      // par les seuls curseurs ferait disparaître silencieusement ce reçu. Le sender
      // est exclu (les curseurs le filtrent déjà ; le gel ne crée jamais d'entrée
      // pour l'auteur de son propre message).
      const evaluatedParticipantIds = new Set<string>();
      for (const c of cursors) evaluatedParticipantIds.add(c.participantId);
      for (const e of frozenEntries) {
        if (e.participantId !== message.senderId) evaluatedParticipantIds.add(e.participantId);
      }

      for (const participantId of evaluatedParticipantIds) {
        const participant = participantById.get(participantId);
        if (!participant) continue; // orphan/inactive — participant deleted/banned/inactive

        const avatarURL = resolveParticipantAvatar(participant);

        const cursor = cursorByParticipant.get(participantId);
        const cursorDelivered =
          cursor?.lastDeliveredAt && cursor.lastDeliveredAt >= message.createdAt
            ? cursor.lastDeliveredAt
            : null;
        const frozen = frozenByParticipant.get(participantId);
        const readAt = resolveReadAt({
          frozenReadAt: frozen?.readAt ?? null,
          cursorLastReadAt: cursor?.lastReadAt ?? null,
          messageCreatedAt: message.createdAt,
          cutover: getExactReadTrackingCutover(),
        });
        // « On ne lit pas ce qu'on n'a pas reçu » — la lecture est le
        // DERNIER repli de la réception. Sans elle, un participant qui
        // marque lu sans accusé de livraison comptait comme lecteur sans
        // compter comme destinataire : `Distribué 0` en face de `Lu 2`.
        const receivedAt = resolveReceivedAt({
          frozenReceivedAt: frozen?.receivedAt ?? null,
          frozenDeliveredAt: frozen?.deliveredAt ?? null,
          cursorDeliveredAt: cursorDelivered,
          readAt,
        });

        if (receivedAt) {
          receivedBy.push({
            participantId,
            displayName: participant.displayName,
            avatarURL,
            receivedAt,
          });
        }

        if (readAt) {
          readBy.push({
            participantId,
            displayName: participant.displayName,
            avatarURL,
            readAt,
            viewedLanguages: frozen?.viewedLanguages ?? [],
          });
        }
      }

      // Per-attachment, per-participant media consumption (audio/video positions).
      // Mirrors the read-receipt detail above: surfaces how far EACH
      // participant — author included (user 2026-08-18 : « remonter les
      // lectures de l'audio même si c'est l'auteur qui le lit ») — listened
      // to an audio / watched a video on this message. Read straight from
      // AttachmentStatusEntry (per-user rows the gateway already persists on
      // consumption). Exposed with the same visibility as receivedBy/readBy —
      // no extra privacy gate (parity with read receipts).
      const consumptionEntries = await this.prisma.attachmentStatusEntry.findMany({
        where: {
          messageId,
        },
        select: {
          attachmentId: true,
          participantId: true,
          lastPlayPositionMs: true,
          listenedComplete: true,
          lastWatchPositionMs: true,
          watchedComplete: true,
          listenSegments: true,
          watchSegments: true,
          viewCount: true,
          viewedLanguages: true,
        },
      });

      const consumptionByAttachment = new Map<
        string,
        Array<{
          participantId: string;
          displayName: string;
          avatarURL: string | null;
          lastPlayPositionMs: number | null;
          listenedComplete: boolean;
          lastWatchPositionMs: number | null;
          watchedComplete: boolean;
          /**
           * Portions réellement parcourues, un passage réécouté ne comptant
           * qu'une fois — de quoi dessiner une barre de couverture. C'est le
           * RÉSUMÉ : la trace détaillée, avec les motifs d'arrêt, n'est servie
           * que par `getAttachmentStatusDetails`, à l'ouverture de la feuille.
           */
          listenCoverage: Array<{ startMs: number; endMs: number }>;
          watchCoverage: Array<{ startMs: number; endMs: number }>;
          /** Nombre d'écoutes / visionnages ININTERROMPUS. */
          listenStretchCount: number;
          watchStretchCount: number;
          /** Nombre d'ouvertures, pour une image. */
          viewCount: number;
          viewedLanguages: string[];
        }>
      >();

      for (const entry of consumptionEntries) {
        const participant = participantById.get(entry.participantId);
        if (!participant) continue; // orphan entry — participant deleted/banned/inactive

        const listenTrace = parsePlaybackTrace(entry.listenSegments);
        const watchTrace = parsePlaybackTrace(entry.watchSegments);

        // Ne garder que les lignes porteuses d'un signal de consommation. Le
        // compteur d'ouvertures et les langues comptent désormais au même titre
        // que la position : une image ouverte trois fois est une consommation,
        // même sans piste de lecture.
        const hasMediaSignal =
          entry.lastPlayPositionMs != null ||
          entry.listenedComplete ||
          entry.lastWatchPositionMs != null ||
          entry.watchedComplete ||
          entry.viewCount > 0 ||
          listenTrace.length > 0 ||
          watchTrace.length > 0 ||
          (entry.viewedLanguages?.length ?? 0) > 0;
        if (!hasMediaSignal) continue;

        const list = consumptionByAttachment.get(entry.attachmentId) ?? [];
        list.push({
          participantId: entry.participantId,
          displayName: participant.displayName,
          avatarURL: resolveParticipantAvatar(participant),
          lastPlayPositionMs: entry.lastPlayPositionMs ?? null,
          listenedComplete: entry.listenedComplete,
          lastWatchPositionMs: entry.lastWatchPositionMs ?? null,
          watchedComplete: entry.watchedComplete,
          listenCoverage: traceCoverage(listenTrace),
          watchCoverage: traceCoverage(watchTrace),
          listenStretchCount: listenTrace.length,
          watchStretchCount: watchTrace.length,
          viewCount: entry.viewCount ?? 0,
          viewedLanguages: entry.viewedLanguages ?? [],
        });
        consumptionByAttachment.set(entry.attachmentId, list);
      }

      const attachmentConsumption = Array.from(consumptionByAttachment.entries()).map(
        ([attachmentId, participants]) => ({
          attachmentId,
          participants,
          // Répartition par langue du média lui-même, calculée sur les SEULS
          // participants déjà retenus ci-dessus : ceux qui refusent les accusés
          // de lecture sont sortis en amont et ne doivent pas reparaître par ce
          // biais.
          languageBreakdown: languageBreakdown(participants),
        })
      );

      // Compute not-seen participants (active but no cursor matching this message)
      const receivedIds = new Set(receivedBy.map(r => r.participantId));
      const readIds = new Set(readBy.map(r => r.participantId));
      const notSeenBy: Array<{ participantId: string; displayName: string; avatarURL: string | null }> = [];

      for (const p of participants) {
        if (p.id === message.senderId) continue;
        if (receivedIds.has(p.id) || readIds.has(p.id)) continue;
        notSeenBy.push({
          participantId: p.id,
          displayName: p.displayName,
          avatarURL: resolveParticipantAvatar(p),
        });
      }

      return {
        messageId,
        totalMembers,
        receivedCount: receivedBy.length,
        readCount: readBy.length,
        notSeenCount: notSeenBy.length,
        receivedBy,
        readBy,
        notSeenBy,
        attachmentConsumption,
        // Prisme linguistique du message : combien de lecteurs par version.
        // Dérivé de `readBy`, donc déjà purgé des participants qui refusent les
        // accusés de lecture. Un lecteur qui a basculé compte dans chacune des
        // versions qu'il a consultées — la somme peut dépasser `readCount`, et
        // c'est exact.
        languageBreakdown: languageBreakdown(readBy),
      };
    } catch (error) {
      logger.error(
        "[MessageReadStatus] Error getting message read status:",
        error
      );
      throw error;
    }
  }

  /**
   * Récupère les statuts de lecture pour plusieurs messages via les curseurs.
   *
   * Rend AUSSI les deux dates de seuil `deliveredToAllAt` / `readByAllAt` —
   * l'instant où le DERNIER destinataire a été servi, `null` tant qu'il en
   * manque un. Les colonnes homonymes de la ligne `Message` n'ont aucun
   * écrivain (`updateMessageComputedStatus` est un no-op assumé depuis le
   * passage aux curseurs) : les routes qui les lisaient servaient donc `null`
   * en permanence, y compris quand toute la conversation avait lu. Les dates se
   * dérivent ici de la MÊME union curseur/reçu figé que les compteurs, et
   * respectent donc le même retrait des opt-out `showReadReceipts`.
   */
  async getConversationReadStatuses(
    conversationId: string,
    messageIds: string[]
  ): Promise<
    Map<
      string,
      {
        totalMembers: number;
        receivedCount: number;
        readCount: number;
        deliveredToAllAt: Date | null;
        readByAllAt: Date | null;
      }
    >
  > {
    try {
      // Les quatre lectures ne dépendent pas les unes des autres : les tenir en
      // séquence coûtait quatre allers-retours sur le chemin de rattrapage le
      // plus chaud du produit (la liste de messages les demande à chaque
      // démarrage à froid). Seul `_loadReadReceiptOptOuts` doit attendre — il
      // lui faut les participants.
      const [messages, allActiveParticipants, cursors, frozenEntries] = await Promise.all([
        this.prisma.message.findMany({
          where: { id: { in: messageIds }, conversationId },
          select: { id: true, createdAt: true, senderId: true },
        }),
        this.prisma.participant.findMany({
          where: { conversationId, isActive: true },
          select: { id: true, userId: true },
        }),
        this.prisma.conversationReadCursor.findMany({
          where: { conversationId },
          select: { participantId: true, lastReadAt: true, lastDeliveredAt: true },
        }),
        // Précision absolue : les dates FIGÉES par message (write-once) priment sur
        // la dérivation curseur — même règle que `getMessageReadStatus` /
        // `getMessageStatusDetails`. Sans cette union, un curseur supprimé par
        // `cleanupObsoleteCursors` (son `lastReadMessageId` pointe vers un message
        // effacé) ferait disparaître un reçu de livraison/lecture figé toujours
        // valide → cette variante batch sous-comptait par rapport aux deux
        // méthodes mono-message pour EXACTEMENT les mêmes données.
        this.prisma.messageStatusEntry.findMany({
          where: { messageId: { in: messageIds }, conversationId },
          select: {
            messageId: true,
            participantId: true,
            deliveredAt: true,
            receivedAt: true,
            readAt: true,
          },
        }),
      ]);

      // Même règle que les trois autres lecteurs : l'opt-out est retiré avant
      // tout comptage, donc absent du numérateur comme du dénominateur.
      const optedOut = await this._loadReadReceiptOptOuts(allActiveParticipants);
      const activeParticipantIds = new Set(
        allActiveParticipants.filter(p => !optedOut.has(p.id)).map(p => p.id)
      );

      // Only consider cursors from active participants
      const activeCursors = cursors.filter(c => activeParticipantIds.has(c.participantId));
      const cursorByParticipant = new Map(activeCursors.map(c => [c.participantId, c]));

      const frozenByMessage = new Map<
        string,
        Map<string, { deliveredAt: Date | null; receivedAt: Date | null; readAt: Date | null }>
      >();
      for (const e of frozenEntries) {
        let inner = frozenByMessage.get(e.messageId);
        if (!inner) {
          inner = new Map();
          frozenByMessage.set(e.messageId, inner);
        }
        inner.set(e.participantId, e);
      }

      const statusMap = new Map<
        string,
        {
          totalMembers: number;
          receivedCount: number;
          readCount: number;
          deliveredToAllAt: Date | null;
          readByAllAt: Date | null;
        }
      >();

      for (const msg of messages) {
        const totalMembers = computeRecipientCount(activeParticipantIds, msg.senderId);
        let receivedCount = 0;
        let readCount = 0;
        // Le seuil « tous servis » date du DERNIER destinataire servi, jamais
        // du premier : c'est l'instant où la promesse devient vraie.
        let lastReceivedAt: Date | null = null;
        let lastReadAt: Date | null = null;

        // Union des participants ayant un curseur actif ET de ceux ayant un reçu
        // figé actif pour CE message (sender exclu). Un participant figé-seul
        // (curseur nettoyé) reste compté ; un figé dont le participant n'est plus
        // actif est ignoré — parité exacte avec `getMessageReadStatus`.
        const frozenForMsg = frozenByMessage.get(msg.id);
        const evaluatedParticipantIds = new Set<string>();
        for (const c of activeCursors) {
          if (c.participantId !== msg.senderId) evaluatedParticipantIds.add(c.participantId);
        }
        if (frozenForMsg) {
          for (const participantId of frozenForMsg.keys()) {
            if (participantId !== msg.senderId && activeParticipantIds.has(participantId)) {
              evaluatedParticipantIds.add(participantId);
            }
          }
        }

        for (const participantId of evaluatedParticipantIds) {
          const cursor = cursorByParticipant.get(participantId);
          const cursorDelivered =
            cursor?.lastDeliveredAt && cursor.lastDeliveredAt >= msg.createdAt
              ? cursor.lastDeliveredAt
              : null;
          const frozen = frozenForMsg?.get(participantId);
          const readAt = resolveReadAt({
            frozenReadAt: frozen?.readAt ?? null,
            cursorLastReadAt: cursor?.lastReadAt ?? null,
            messageCreatedAt: msg.createdAt,
            cutover: getExactReadTrackingCutover(),
          });
          // « On ne lit pas ce qu'on n'a pas reçu » — la lecture est le
          // DERNIER repli de la réception. Sans elle, un participant qui
          // marque lu sans accusé de livraison comptait comme lecteur sans
          // compter comme destinataire : `Distribué 0` en face de `Lu 2`.
          const receivedAt = resolveReceivedAt({
            frozenReceivedAt: frozen?.receivedAt ?? null,
            frozenDeliveredAt: frozen?.deliveredAt ?? null,
            cursorDeliveredAt: cursorDelivered,
            readAt,
          });

          if (receivedAt) {
            receivedCount++;
            if (!lastReceivedAt || receivedAt > lastReceivedAt) lastReceivedAt = receivedAt;
          }
          if (readAt) {
            readCount++;
            if (!lastReadAt || readAt > lastReadAt) lastReadAt = readAt;
          }
        }

        // Aucune garde `totalMembers > 0` n'est nécessaire, et en ajouter une
        // serait du code qu'aucun test ne peut rougir : `totalMembers` ne vaut
        // zéro que si l'ensemble des destinataires évalués est vide, auquel cas
        // les deux maxima sont `null` de toute façon. Le seuil trivialement
        // franchi rend donc déjà `null`.
        statusMap.set(msg.id, {
          totalMembers,
          receivedCount,
          readCount,
          deliveredToAllAt: receivedCount >= totalMembers ? lastReceivedAt : null,
          readByAllAt: readCount >= totalMembers ? lastReadAt : null,
        });
      }

      return statusMap;
    } catch (error) {
      logger.error(
        "[MessageReadStatus] Error getting conversation read statuses:",
        error
      );
      throw error;
    }
  }

  async getMessageStatusDetails(
    messageId: string,
    options: {
      offset?: number;
      limit?: number;
      filter?: "all" | "delivered" | "read" | "unread";
    } = {}
  ): Promise<{
    statuses: Array<{
      participantId: string;
      displayName: string;
      avatar?: string | null;
      deliveredAt: Date | null;
      receivedAt: Date | null;
      readAt: Date | null;
      readDevice?: string | null;
    }>;
    pagination: {
      total: number;
      limit: number;
      offset: number;
      hasMore: boolean;
    };
  }> {
    const { offset = 0, limit = 20, filter = "all" } = options;

    try {
      const message = await this.prisma.message.findUnique({
        where: { id: messageId },
        select: { createdAt: true, conversationId: true },
      });

      if (!message) throw new Error("Message not found");

      // See `getMessageReadStatus` for the rationale: avoid `include` to
      // prevent Prisma from crashing on orphan cursors.
      const cursors = await this.prisma.conversationReadCursor.findMany({
        where: { conversationId: message.conversationId },
        select: {
          participantId: true,
          lastDeliveredAt: true,
          lastReadAt: true,
        },
      });

      // Précision absolue : les dates figées par message (write-once) priment
      // sur la dérivation curseur. Le fallback curseur ne sert que pour les
      // messages lus AVANT l'introduction du gel (legacy, sans entrée).
      const frozenEntries = await this.prisma.messageStatusEntry.findMany({
        where: { messageId },
        select: {
          participantId: true,
          deliveredAt: true,
          receivedAt: true,
          readAt: true,
          readDevice: true,
        },
      });
      const frozenByParticipant = new Map(
        frozenEntries.map(e => [e.participantId, e])
      );
      const cursorByParticipant = new Map(cursors.map(c => [c.participantId, c]));

      // UNION des participants ayant un curseur ET de ceux ayant un reçu figé
      // survivant (cf. getMessageReadStatus) : un curseur supprimé par
      // `cleanupObsoleteCursors` ne doit pas effacer un reçu de livraison/lecture
      // figé. Les rows participant sont résolues sur l'union — pas seulement sur
      // les ids de curseurs — sinon l'info d'affichage (displayName/avatar) du
      // participant figé-seul manquerait.
      const evaluatedParticipantIds = Array.from(new Set([
        ...cursors.map(c => c.participantId),
        ...frozenEntries.map(e => e.participantId),
      ]));

      const allParticipants = evaluatedParticipantIds.length
        ? await this.prisma.participant.findMany({
            where: {
              id: { in: evaluatedParticipantIds },
              isActive: true,
            },
            select: {
              id: true,
              userId: true,
              displayName: true,
              avatar: true,
              user: { select: { avatar: true } },
            },
          })
        : [];

      // Absents de `participantById`, les opt-out sont ignorés par la boucle
      // (`continue` sur participant introuvable) et disparaissent donc aussi
      // bien de la liste que de son total.
      const optedOut = await this._loadReadReceiptOptOuts(allParticipants);
      const participants = allParticipants.filter(p => !optedOut.has(p.id));

      const participantById = new Map(
        participants.map(p => [p.id, p])
      );

      let results: Array<{
        participantId: string;
        displayName: string;
        avatar?: string | null;
        deliveredAt: Date | null;
        receivedAt: Date | null;
        readAt: Date | null;
        readDevice?: string | null;
      }> = [];

      for (const participantId of evaluatedParticipantIds) {
        const participant = participantById.get(participantId);
        if (!participant) continue; // orphan or inactive

        const cursor = cursorByParticipant.get(participantId);
        const cursorDelivered =
          cursor?.lastDeliveredAt && cursor.lastDeliveredAt >= message.createdAt
            ? cursor.lastDeliveredAt
            : null;
        const frozen = frozenByParticipant.get(participantId);
        const deliveredAt = frozen?.deliveredAt ?? cursorDelivered;
        const readAt = resolveReadAt({
          frozenReadAt: frozen?.readAt ?? null,
          cursorLastReadAt: cursor?.lastReadAt ?? null,
          messageCreatedAt: message.createdAt,
          cutover: getExactReadTrackingCutover(),
        });
        // « On ne lit pas ce qu'on n'a pas reçu » — la lecture est le
        // DERNIER repli de la réception. Sans elle, un participant qui
        // marque lu sans accusé de livraison comptait comme lecteur sans
        // compter comme destinataire : `Distribué 0` en face de `Lu 2`.
        const receivedAt = resolveReceivedAt({
          frozenReceivedAt: frozen?.receivedAt ?? null,
          frozenDeliveredAt: frozen?.deliveredAt ?? null,
          cursorDeliveredAt: cursorDelivered,
          readAt,
        });
        const readDevice = frozen?.readDevice ?? null;

        if (filter === "delivered" && !deliveredAt) continue;
        if (filter === "read" && !readAt) continue;
        if (filter === "unread" && readAt) continue;

        results.push({
          participantId,
          displayName: participant.displayName,
          avatar: resolveParticipantAvatar(participant),
          deliveredAt,
          receivedAt,
          readAt,
          readDevice,
        });
      }

      const total = results.length;
      const pagedResults = results.slice(offset, offset + limit);

      return {
        statuses: pagedResults,
        pagination: {
          total,
          limit,
          offset,
          hasMore: offset + limit < total,
        },
      };
    } catch (error) {
      logger.error(
        "[MessageReadStatus] Error getting message status details:",
        error
      );
      throw error;
    }
  }

  async getAttachmentStatusDetails(
    attachmentId: string,
    options: {
      offset?: number;
      limit?: number;
      filter?: "all" | "viewed" | "downloaded" | "listened" | "watched";
    } = {}
  ): Promise<{
    statuses: Array<{
      participantId: string;
      username: string;
      avatar?: string | null;
      viewedAt: Date | null;
      downloadedAt: Date | null;
      listenedAt: Date | null;
      watchedAt: Date | null;
      listenCount: number;
      watchCount: number;
      listenedComplete: boolean;
      watchedComplete: boolean;
      lastPlayPositionMs: number | null;
      lastWatchPositionMs: number | null;
      /**
       * Trace de l'interaction : une entrée par écoute réellement continue,
       * dans l'ordre du temps, avec ce qui y a mis fin. Servie ici et nulle
       * part ailleurs — c'est la vue de détail, ouverte à la demande.
       */
      listenStretches: Array<{ startMs: number; endMs: number; endedBy: string }>;
      watchStretches: Array<{ startMs: number; endMs: number; endedBy: string }>;
      /** Portions parcourues, doublons fusionnés — pour la barre de couverture. */
      listenCoverage: Array<{ startMs: number; endMs: number }>;
      watchCoverage: Array<{ startMs: number; endMs: number }>;
      /**
       * Durée réellement couverte. Comparée à `totalListenDurationMs`, qui
       * compte les replays, l'écart dit que des passages ont été REVUS.
       */
      coveredListenMs: number;
      coveredWatchMs: number;
      /** Nombre d'ouvertures d'une image. */
      viewCount: number;
      /** Versions linguistiques consommées par ce participant. */
      viewedLanguages: string[];
    }>;
    /** Répartition des consommateurs par version linguistique. */
    languageBreakdown: Array<{ language: string; count: number }>;
    pagination: {
      total: number;
      limit: number;
      offset: number;
      hasMore: boolean;
    };
  }> {
    const { offset = 0, limit = 20, filter = "all" } = options;

    try {
      // Jumelle EXACTE de `getMessageStatusDetails` : la consommation d'un
      // participant `showReadReceipts = false` sort de la vue servie aux
      // AUTRES — position, couverture, trace et langues comprises. La règle est
      // serveur-autoritaire (cf. `_loadReadReceiptOptOuts`, appelée par les
      // quatre autres lecteurs texte), et l'exclusion se pose sur la REQUÊTE
      // pour que `total`, la page, `hasMore` et `languageBreakdown` (calculé sur
      // la page) restent cohérents entre eux. Le versant « je vois ma propre
      // ligne » reste la règle d'équité côté client, comme pour le texte.
      //
      // On charge d'abord les consommateurs DISTINCTS de la pièce jointe pour
      // résoudre l'opt-out, puis on réutilise ces lignes participant pour
      // l'affichage (mêmes champs que l'ancien `include`) — pas de seconde
      // requête. Résilient à une entrée orpheline : `include: { participant }`
      // est évité (même risque que `ConversationReadCursor`).
      const consumerRows = await this.prisma.attachmentStatusEntry.findMany({
        where: { attachmentId },
        select: { participantId: true },
        distinct: ["participantId"],
      });
      const participants = consumerRows.length
        ? await this.prisma.participant.findMany({
            where: { id: { in: consumerRows.map(r => r.participantId) } },
            select: {
              id: true,
              userId: true,
              displayName: true,
              avatar: true,
              user: { select: { avatar: true } },
            },
          })
        : [];
      const optedOut = await this._loadReadReceiptOptOuts(participants);

      const whereClause: any = { attachmentId };
      if (optedOut.size > 0) whereClause.participantId = { notIn: [...optedOut] };
      if (filter === "viewed") whereClause.viewedAt = { not: null };
      else if (filter === "downloaded")
        whereClause.downloadedAt = { not: null };
      else if (filter === "listened") whereClause.listenedAt = { not: null };
      else if (filter === "watched") whereClause.watchedAt = { not: null };

      const total = await this.prisma.attachmentStatusEntry.count({
        where: whereClause,
      });

      const statuses = await this.prisma.attachmentStatusEntry.findMany({
        where: whereClause,
        take: limit,
        skip: offset,
        orderBy: { createdAt: "desc" },
        select: {
          participantId: true,
          viewedAt: true,
          downloadedAt: true,
          listenedAt: true,
          watchedAt: true,
          listenCount: true,
          watchCount: true,
          listenedComplete: true,
          watchedComplete: true,
          lastPlayPositionMs: true,
          lastWatchPositionMs: true,
          listenSegments: true,
          watchSegments: true,
          viewCount: true,
          viewedLanguages: true,
        },
      });

      const participantById = new Map(
        participants.map(p => [p.id, p])
      );

      const enrichedStatuses = statuses
        .map((s) => {
          const participant = participantById.get(s.participantId);
          if (!participant) return null; // skip orphan rows
          const listenStretches = parsePlaybackTrace(s.listenSegments);
          const watchStretches = parsePlaybackTrace(s.watchSegments);
          const listenCoverage = traceCoverage(listenStretches);
          const watchCoverage = traceCoverage(watchStretches);
          return {
            participantId: s.participantId,
            username: participant.displayName || "Unknown",
            avatar: resolveParticipantAvatar(participant),
            viewedAt: s.viewedAt,
            downloadedAt: s.downloadedAt,
            listenedAt: s.listenedAt,
            watchedAt: s.watchedAt,
            listenCount: s.listenCount,
            watchCount: s.watchCount,
            listenedComplete: s.listenedComplete,
            watchedComplete: s.watchedComplete,
            lastPlayPositionMs: s.lastPlayPositionMs,
            lastWatchPositionMs: s.lastWatchPositionMs,
            listenStretches,
            watchStretches,
            listenCoverage,
            watchCoverage,
            coveredListenMs: coveredDurationMs(listenCoverage),
            coveredWatchMs: coveredDurationMs(watchCoverage),
            viewCount: s.viewCount ?? 0,
            viewedLanguages: s.viewedLanguages ?? [],
          };
        })
        .filter((s): s is NonNullable<typeof s> => s !== null);

      return {
        statuses: enrichedStatuses,
        // Calculée sur la PAGE, comme le reste de la charge : au-delà, il
        // faudrait relire toute la table pour un chiffre que la pagination
        // rendrait de toute façon incohérent avec ce qui est affiché.
        languageBreakdown: languageBreakdown(enrichedStatuses),
        pagination: {
          total,
          limit,
          offset,
          hasMore: offset + statuses.length < total,
        },
      };
    } catch (error) {
      logger.error(
        "[MessageReadStatus] Error getting attachment status details:",
        error
      );
      throw error;
    }
  }

  /**
   * Enregistre qu'un message précis a été consulté dans une version linguistique
   * donnée — la bascule sur une bulle, sans changer la langue de la conversation.
   *
   * N'écrit que sur une entrée EXISTANTE : la lecture elle-même est établie par
   * `markMessagesAsRead`, appelé juste avant sur le même chemin. Créer ici
   * reviendrait à déclarer lu un message sur la seule foi d'un choix de langue.
   *
   * Résilient : une bascule perdue ne doit pas faire échouer la requête.
   */
  async recordMessageLanguageView(
    participantId: string,
    messageId: string,
    language: string | null | undefined
  ): Promise<void> {
    const code = normalizeLanguageCode(language);
    if (!code) return;

    try {
      const entry = await this.prisma.messageStatusEntry.findFirst({
        where: { messageId, participantId },
        select: { id: true, viewedLanguages: true },
      });

      if (!entry) return;
      if (entry.viewedLanguages?.includes(code)) return;
      if ((entry.viewedLanguages?.length ?? 0) >= MAX_VIEWED_LANGUAGES) return;

      await this.prisma.messageStatusEntry.update({
        where: { id: entry.id },
        data: { viewedLanguages: { push: code } },
      });
    } catch (error) {
      logger.error(
        `[MessageReadStatus] recordMessageLanguageView failed for message ${messageId}:`,
        error
      );
    }
  }

  async markAudioAsListened(
    participantId: string,
    attachmentId: string,
    options?: {
      playPositionMs?: number;
      listenDurationMs?: number;
      complete?: boolean;
      /** Écoutes réellement continues depuis le dernier rapport. */
      stretches?: readonly unknown[];
      /** Version linguistique consommée (piste traduite, transcription). */
      language?: string | null;
    }
  ): Promise<void> {
    try {
      const attachment = await this.prisma.messageAttachment.findUnique({
        where: { id: attachmentId },
        select: {
          id: true,
          messageId: true,
          message: { select: { conversationId: true } },
        },
      });

      if (!attachment) {
        throw new Error(`Attachment ${attachmentId} not found`);
      }

      const now = new Date();

      await withRetry(() =>
        this.prisma.$transaction(async (tx) => {
          // La trace et l'ensemble des langues s'ACCUMULENT : il faut connaître
          // l'état courant pour y ajouter, ce qu'un upsert seul ne permet pas.
          // Lu dans la transaction, et le conflit d'unicité (attachment,
          // participant) fait rejouer l'ensemble via `withRetry`.
          const previous = await tx.attachmentStatusEntry.findUnique({
            where: {
              attachment_participant_status: { attachmentId, participantId },
            },
            select: { listenSegments: true, viewedLanguages: true },
          });

          const trace = appendPlaybackStretches(
            parsePlaybackTrace(previous?.listenSegments),
            options?.stretches ?? []
          );
          const viewedLanguages = mergeViewedLanguages(
            previous?.viewedLanguages,
            options?.language
          );

          await tx.attachmentStatusEntry.upsert({
            where: {
              attachment_participant_status: { attachmentId, participantId },
            },
            create: {
              attachmentId,
              messageId: attachment.messageId,
              conversationId: attachment.message.conversationId,
              participantId,
              listenedAt: now,
              listenCount: 1,
              lastPlayPositionMs: options?.playPositionMs,
              totalListenDurationMs: options?.listenDurationMs || 0,
              listenedComplete: options?.complete || false,
              listenSegments: trace,
              viewedLanguages,
            },
            update: {
              listenedAt: now,
              listenCount: { increment: 1 },
              lastPlayPositionMs: options?.playPositionMs,
              totalListenDurationMs: options?.listenDurationMs
                ? { increment: options.listenDurationMs }
                : undefined,
              listenedComplete: options?.complete,
              listenSegments: trace,
              viewedLanguages,
            },
          });
        })
      );

      await this.updateAttachmentComputedStatus(attachmentId);
    } catch (error) {
      logger.error(
        "[MessageReadStatus] Error marking audio as listened:",
        error
      );
      throw error;
    }
  }

  async markVideoAsWatched(
    participantId: string,
    attachmentId: string,
    options?: {
      watchPositionMs?: number;
      watchDurationMs?: number;
      complete?: boolean;
      /** Visionnages réellement continus depuis le dernier rapport. */
      stretches?: readonly unknown[];
      /** Version linguistique consommée (sous-titres, piste doublée). */
      language?: string | null;
    }
  ): Promise<void> {
    try {
      const attachment = await this.prisma.messageAttachment.findUnique({
        where: { id: attachmentId },
        select: {
          id: true,
          messageId: true,
          message: { select: { conversationId: true } },
        },
      });

      if (!attachment) {
        throw new Error(`Attachment ${attachmentId} not found`);
      }

      const now = new Date();

      await withRetry(() =>
        this.prisma.$transaction(async (tx) => {
          // Même raison que pour l'audio : la trace s'accumule, donc se lit
          // avant de s'écrire. Voir `markAudioAsListened`.
          const previous = await tx.attachmentStatusEntry.findUnique({
            where: {
              attachment_participant_status: { attachmentId, participantId },
            },
            select: { watchSegments: true, viewedLanguages: true },
          });

          const trace = appendPlaybackStretches(
            parsePlaybackTrace(previous?.watchSegments),
            options?.stretches ?? []
          );
          const viewedLanguages = mergeViewedLanguages(
            previous?.viewedLanguages,
            options?.language
          );

          await tx.attachmentStatusEntry.upsert({
            where: {
              attachment_participant_status: { attachmentId, participantId },
            },
            create: {
              attachmentId,
              messageId: attachment.messageId,
              conversationId: attachment.message.conversationId,
              participantId,
              watchedAt: now,
              watchCount: 1,
              lastWatchPositionMs: options?.watchPositionMs,
              totalWatchDurationMs: options?.watchDurationMs || 0,
              watchedComplete: options?.complete || false,
              watchSegments: trace,
              viewedLanguages,
            },
            update: {
              watchedAt: now,
              watchCount: { increment: 1 },
              lastWatchPositionMs: options?.watchPositionMs,
              totalWatchDurationMs: options?.watchDurationMs
                ? { increment: options.watchDurationMs }
                : undefined,
              watchedComplete: options?.complete,
              watchSegments: trace,
              viewedLanguages,
            },
          });
        })
      );

      await this.updateAttachmentComputedStatus(attachmentId);
    } catch (error) {
      logger.error(
        "[MessageReadStatus] Error marking video as watched:",
        error
      );
      throw error;
    }
  }

  async markImageAsViewed(
    participantId: string,
    attachmentId: string,
    options?: {
      viewDurationMs?: number;
      wasZoomed?: boolean;
      /** Version linguistique de la légende ou du texte incrusté consulté. */
      language?: string | null;
    }
  ): Promise<void> {
    try {
      const attachment = await this.prisma.messageAttachment.findUnique({
        where: { id: attachmentId },
        select: {
          id: true,
          messageId: true,
          message: { select: { conversationId: true } },
        },
      });

      if (!attachment) {
        throw new Error(`Attachment ${attachmentId} not found`);
      }

      const now = new Date();

      await withRetry(() =>
        this.prisma.$transaction(async (tx) => {
          const previous = await tx.attachmentStatusEntry.findUnique({
            where: {
              attachment_participant_status: { attachmentId, participantId },
            },
            select: { viewedLanguages: true },
          });

          const viewedLanguages = mergeViewedLanguages(
            previous?.viewedLanguages,
            options?.language
          );

          await tx.attachmentStatusEntry.upsert({
            where: {
              attachment_participant_status: { attachmentId, participantId },
            },
            create: {
              attachmentId,
              messageId: attachment.messageId,
              conversationId: attachment.message.conversationId,
              participantId,
              viewedAt: now,
              viewCount: 1,
              viewDurationMs: options?.viewDurationMs,
              wasZoomed: options?.wasZoomed || false,
              viewedLanguages,
            },
            update: {
              viewedAt: now,
              // `viewedAt` était écrasé sans rien compter : une image regardée
              // dix fois se lisait comme une image entrevue une seule.
              viewCount: { increment: 1 },
              viewDurationMs: options?.viewDurationMs,
              wasZoomed: options?.wasZoomed,
              viewedLanguages,
            },
          });
        })
      );

      await this.updateAttachmentComputedStatus(attachmentId);
    } catch (error) {
      logger.error(
        "[MessageReadStatus] Error marking image as viewed:",
        error
      );
      throw error;
    }
  }

  async markAttachmentAsDownloaded(
    participantId: string,
    attachmentId: string
  ): Promise<void> {
    try {
      const attachment = await this.prisma.messageAttachment.findUnique({
        where: { id: attachmentId },
        select: {
          id: true,
          messageId: true,
          message: { select: { conversationId: true } },
        },
      });

      if (!attachment) {
        throw new Error(`Attachment ${attachmentId} not found`);
      }

      const now = new Date();

      await withRetry(() =>
        this.prisma.$transaction(async (tx) => {
          await tx.attachmentStatusEntry.upsert({
            where: {
              attachment_participant_status: { attachmentId, participantId },
            },
            create: {
              attachmentId,
              messageId: attachment.messageId,
              conversationId: attachment.message.conversationId,
              participantId,
              downloadedAt: now,
            },
            update: {
              downloadedAt: now,
            },
          });
        })
      );

      await this.updateAttachmentComputedStatus(attachmentId);
    } catch (error) {
      logger.error(
        "[MessageReadStatus] Error marking attachment as downloaded:",
        error
      );
      throw error;
    }
  }

  async getAttachmentStatus(
    attachmentId: string,
    participantId: string
  ): Promise<{
    viewed: boolean;
    downloaded: boolean;
    listened: boolean;
    watched: boolean;
    listenCount: number;
    watchCount: number;
    listenedComplete: boolean;
    watchedComplete: boolean;
    lastPlayPositionMs: number | null;
    lastWatchPositionMs: number | null;
  } | null> {
    try {
      const status = await this.prisma.attachmentStatusEntry.findUnique({
        where: {
          attachment_participant_status: { attachmentId, participantId },
        },
      });

      if (!status) {
        return null;
      }

      return {
        viewed: !!status.viewedAt,
        downloaded: !!status.downloadedAt,
        listened: !!status.listenedAt,
        watched: !!status.watchedAt,
        listenCount: status.listenCount,
        watchCount: status.watchCount,
        listenedComplete: status.listenedComplete,
        watchedComplete: status.watchedComplete,
        lastPlayPositionMs: status.lastPlayPositionMs,
        lastWatchPositionMs: status.lastWatchPositionMs,
      };
    } catch (error) {
      logger.error(
        "[MessageReadStatus] Error getting attachment status:",
        error
      );
      return null;
    }
  }

  async getLatestMessageSummary(
    conversationId: string
  ): Promise<{ totalMembers: number; deliveredCount: number; readCount: number }> {
    try {
      const latestMessage = await this.prisma.message.findFirst({
        where: { conversationId, deletedAt: null },
        orderBy: { createdAt: 'desc' },
        select: { id: true, createdAt: true, senderId: true }
      });

      if (!latestMessage) {
        return { totalMembers: 0, deliveredCount: 0, readCount: 0 };
      }

      const allActiveParticipants = await this.prisma.participant.findMany({
        where: { conversationId, isActive: true, id: { not: latestMessage.senderId } },
        select: { id: true, userId: true }
      });

      // Ce résumé alimente les events READ_STATUS_UPDATED diffusés à toute la
      // conversation. Sans ce filtre, la lecture d'un participant opt-out y
      // ressortait, contournant le gate d'émission posé côté route.
      const optedOut = await this._loadReadReceiptOptOuts(allActiveParticipants);
      const activeParticipants = allActiveParticipants.filter(p => !optedOut.has(p.id));
      const totalMembers = activeParticipants.length;
      const activeIds = new Set(activeParticipants.map(p => p.id));

      const cursors = await this.prisma.conversationReadCursor.findMany({
        where: { conversationId, participantId: { not: latestMessage.senderId } },
        select: { participantId: true, lastDeliveredAt: true, lastReadAt: true }
      });

      // Only count cursors from active participants
      const activeCursors = cursors.filter(c => activeIds.has(c.participantId));
      const cursorByParticipant = new Map(activeCursors.map(c => [c.participantId, c]));

      // Précision absolue : les dates FIGÉES par message (write-once) priment sur la
      // dérivation curseur — même union que getMessageReadStatus /
      // getConversationReadStatuses / getMessageStatusDetails. Sans elle, un curseur
      // supprimé par `cleanupObsoleteCursors` (son lastReadMessageId pointe vers un
      // message effacé) ferait disparaître un reçu de livraison/lecture figé toujours
      // valide, et ce résumé — qui alimente le champ `summary` des events
      // READ_STATUS_UPDATED émis à l'expéditeur — sous-compterait par rapport aux
      // méthodes mono-message (coche livré/lu qui régresse chez l'expéditeur).
      const frozenEntries = await this.prisma.messageStatusEntry.findMany({
        where: { messageId: latestMessage.id, conversationId },
        select: { participantId: true, deliveredAt: true, receivedAt: true, readAt: true }
      });
      const frozenByParticipant = new Map(
        frozenEntries
          .filter(e => e.participantId !== latestMessage.senderId && activeIds.has(e.participantId))
          .map(e => [e.participantId, e])
      );

      // Union des participants ayant un curseur actif ET de ceux ayant un reçu figé
      // survivant pour CE message (sender exclu, inactifs ignorés) — parité exacte
      // avec les trois méthodes sœurs.
      const evaluatedParticipantIds = new Set<string>([
        ...activeCursors.map(c => c.participantId),
        ...frozenByParticipant.keys(),
      ]);

      let deliveredCount = 0;
      let readCount = 0;
      for (const participantId of evaluatedParticipantIds) {
        const cursor = cursorByParticipant.get(participantId);
        const cursorDelivered =
          cursor?.lastDeliveredAt && cursor.lastDeliveredAt >= latestMessage.createdAt
            ? cursor.lastDeliveredAt
            : null;
        const frozen = frozenByParticipant.get(participantId);
        const readAt = resolveReadAt({
          frozenReadAt: frozen?.readAt ?? null,
          cursorLastReadAt: cursor?.lastReadAt ?? null,
          messageCreatedAt: latestMessage.createdAt,
          cutover: getExactReadTrackingCutover(),
        });
        // « On ne lit pas ce qu'on n'a pas reçu » — la lecture est le
        // DERNIER repli de la réception. Sans elle, un participant qui
        // marque lu sans accusé de livraison comptait comme lecteur sans
        // compter comme destinataire : `Distribué 0` en face de `Lu 2`.
        const receivedAt = resolveReceivedAt({
          frozenReceivedAt: frozen?.receivedAt ?? null,
          frozenDeliveredAt: frozen?.deliveredAt ?? null,
          cursorDeliveredAt: cursorDelivered,
          readAt,
        });

        if (receivedAt) deliveredCount++;
        if (readAt) readCount++;
      }

      return { totalMembers, deliveredCount, readCount };
    } catch (error) {
      logger.error('[MessageReadStatus] Error computing summary:', error);
      return { totalMembers: 0, deliveredCount: 0, readCount: 0 };
    }
  }

  // No-op method replacing legacy implementation
  async updateMessageComputedStatus(messageId: string): Promise<void> {
    // Legacy: Computed fields are no longer stored on Message to improve write performance.
    // Read statuses are computed dynamically via cursors.
    return;
  }

  private async updateAttachmentComputedStatus(
    attachmentId: string
  ): Promise<void> {
    try {
      const attachment = await this.prisma.messageAttachment.findUnique({
        where: { id: attachmentId },
        select: {
          id: true,
          messageId: true,
          mimeType: true,
          message: {
            select: {
              conversationId: true,
              senderId: true,
            },
          },
        },
      });

      if (!attachment) return;

      const authorId = attachment.message.senderId;
      const conversationId = attachment.message.conversationId;

      const totalParticipants = await this.prisma.participant.count({
        where: {
          conversationId,
          isActive: true,
          id: { not: authorId },
        },
      });

      // Deux jeux de compteurs (user 2026-08-18 : « remonter les lectures
      // de l'audio même si c'est l'auteur qui le lit ») :
      // - AFFICHÉS (`viewedCount`/`downloadedCount`/`consumedCount`) :
      //   auteur INCLUS — sa lecture compte comme celle de n'importe qui ;
      // - COMPLÉTUDE (`…ByAllAt`) : auteur EXCLU des deux côtés de la
      //   comparaison — sinon sa propre écoute allumerait « écouté par
      //   tous » avant qu'un seul destinataire n'ait ouvert le vocal.
      //
      // `participant: { conversationId }` sur CHAQUE requête : les lignes
      // HÉRITÉES du bug d'identifiant (participantId = User.id, écrites
      // avant le correctif de la route) ne référencent aucun Participant —
      // sans ce filtre elles comptaient double (l'upsert post-correctif crée
      // une seconde ligne pour le même humain) et passaient TOUJOURS
      // l'exclusion auteur (User.id ≠ Participant.id de l'auteur), allumant
      // des « écouté par tous » fantômes. Même règle d'orphelines que les
      // lectures (`if (!participant) return null`).
      const [
        viewedCount, downloadedCount, listenedCount, watchedCount,
        viewedCountOthers, downloadedCountOthers, listenedCountOthers, watchedCountOthers,
      ] =
        await Promise.all([
          this.prisma.attachmentStatusEntry.count({
            where: { attachmentId, viewedAt: { not: null }, participant: { conversationId } },
          }),
          this.prisma.attachmentStatusEntry.count({
            where: { attachmentId, downloadedAt: { not: null }, participant: { conversationId } },
          }),
          this.prisma.attachmentStatusEntry.count({
            where: { attachmentId, listenedAt: { not: null }, participant: { conversationId } },
          }),
          this.prisma.attachmentStatusEntry.count({
            where: { attachmentId, watchedAt: { not: null }, participant: { conversationId } },
          }),
          this.prisma.attachmentStatusEntry.count({
            where: {
              attachmentId,
              viewedAt: { not: null },
              participantId: { not: authorId },
              participant: { conversationId },
            },
          }),
          this.prisma.attachmentStatusEntry.count({
            where: {
              attachmentId,
              downloadedAt: { not: null },
              participantId: { not: authorId },
              participant: { conversationId },
            },
          }),
          this.prisma.attachmentStatusEntry.count({
            where: {
              attachmentId,
              listenedAt: { not: null },
              participantId: { not: authorId },
              participant: { conversationId },
            },
          }),
          this.prisma.attachmentStatusEntry.count({
            where: {
              attachmentId,
              watchedAt: { not: null },
              participantId: { not: authorId },
              participant: { conversationId },
            },
          }),
        ]);

      const isAudio = attachment.mimeType.startsWith("audio/");
      const isVideo = attachment.mimeType.startsWith("video/");
      const consumedCount = isAudio
        ? listenedCount
        : isVideo
        ? watchedCount
        : viewedCount;

      let viewedByAllAt: Date | null = null;
      let downloadedByAllAt: Date | null = null;
      let listenedByAllAt: Date | null = null;
      let watchedByAllAt: Date | null = null;

      if (totalParticipants > 0) {
        if (viewedCountOthers >= totalParticipants) {
          const last = await this.prisma.attachmentStatusEntry.findFirst({
            where: {
              attachmentId,
              viewedAt: { not: null },
              participantId: { not: authorId },
              participant: { conversationId },
            },
            orderBy: { viewedAt: "desc" },
            select: { viewedAt: true },
          });
          viewedByAllAt = last?.viewedAt || null;
        }

        if (downloadedCountOthers >= totalParticipants) {
          const last = await this.prisma.attachmentStatusEntry.findFirst({
            where: {
              attachmentId,
              downloadedAt: { not: null },
              participantId: { not: authorId },
              participant: { conversationId },
            },
            orderBy: { downloadedAt: "desc" },
            select: { downloadedAt: true },
          });
          downloadedByAllAt = last?.downloadedAt || null;
        }

        if (listenedCountOthers >= totalParticipants && isAudio) {
          const last = await this.prisma.attachmentStatusEntry.findFirst({
            where: {
              attachmentId,
              listenedAt: { not: null },
              participantId: { not: authorId },
              participant: { conversationId },
            },
            orderBy: { listenedAt: "desc" },
            select: { listenedAt: true },
          });
          listenedByAllAt = last?.listenedAt || null;
        }

        if (watchedCountOthers >= totalParticipants && isVideo) {
          const last = await this.prisma.attachmentStatusEntry.findFirst({
            where: {
              attachmentId,
              watchedAt: { not: null },
              participantId: { not: authorId },
              participant: { conversationId },
            },
            orderBy: { watchedAt: "desc" },
            select: { watchedAt: true },
          });
          watchedByAllAt = last?.watchedAt || null;
        }
      }

      await this.prisma.messageAttachment.update({
        where: { id: attachmentId },
        data: {
          viewedCount,
          downloadedCount,
          consumedCount,
          viewedByAllAt,
          downloadedByAllAt,
          listenedByAllAt,
          watchedByAllAt,
        },
      });
    } catch (error) {
      logger.error(
        "[MessageReadStatus] Error updating attachment computed status:",
        error
      );
    }
  }

  async cleanupObsoleteCursors(conversationId: string): Promise<number> {
    try {
      const cursors = await this.prisma.conversationReadCursor.findMany({
        where: { conversationId },
        select: { id: true, lastReadMessageId: true },
      });

      if (cursors.length === 0) {
        return 0;
      }

      const messageIds = cursors
        .map((c) => c.lastReadMessageId)
        .filter((id): id is string => id !== null);

      const existingMessages = await this.prisma.message.findMany({
        where: {
          id: { in: messageIds },
          deletedAt: null,
        },
        select: { id: true },
      });

      const existingMessageIds = new Set(existingMessages.map((m) => m.id));

      const obsoleteCursorIds = cursors
        .filter(
          (c) =>
            c.lastReadMessageId && !existingMessageIds.has(c.lastReadMessageId)
        )
        .map((c) => c.id);

      if (obsoleteCursorIds.length > 0) {
        await this.prisma.conversationReadCursor.deleteMany({
          where: { id: { in: obsoleteCursorIds } },
        });
      }

      logger.info(
        `✅ [MessageReadStatus] Cleaned up ${obsoleteCursorIds.length} obsolete cursors in conversation ${conversationId}`
      );
      return obsoleteCursorIds.length;
    } catch (error) {
      logger.error("[MessageReadStatus] Error cleaning up cursors", error);
      throw error;
    }
  }
}
