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
import { enhancedLogger } from '../utils/logger-enhanced';

// Logger dédié pour MessageReadStatusService
const logger = enhancedLogger.child({ module: 'MessageReadStatusService' });


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
   * Counting floor: `cursor.lastReadAt` → `participant.joinedAt`. A new
   * participant therefore sees only messages received since they joined,
   * NOT the entire historical backlog of the conversation.
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
        select: { id: true, joinedAt: true },
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

      const floor: Date | null = cursor?.lastReadAt ?? participant.joinedAt ?? null;

      return await this.prisma.message.count({
        where: {
          conversationId,
          deletedAt: null,
          senderId: { not: participant.id },
          ...(floor ? { createdAt: { gt: floor } } : {}),
        },
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
   * Counting floor per participant: `cursor.lastReadAt → joinedAt → null` (no floor).
   * The `findMany` lower bound is the OLDEST floor across participants, so only the
   * messages any participant could count are fetched once; a `null` floor (never read,
   * no `joinedAt`) drops the bound entirely.
   *
   * Returns a Map<participantId, unreadCount>. Accepts pre-resolved participant rows
   * (id + joinedAt) to avoid redundant participant lookups.
   */
  async getUnreadCountsForParticipants(
    participants: ReadonlyArray<{ id: string; joinedAt: Date | null }>,
    conversationId: string
  ): Promise<Map<string, number>> {
    if (participants.length === 0) return new Map();

    try {
      const participantIds = participants.map((p) => p.id);

      // Batch fetch all cursors in a single query
      const cursors = await this.prisma.conversationReadCursor.findMany({
        where: { participantId: { in: participantIds }, conversationId },
        select: { participantId: true, lastReadAt: true },
      });
      const cursorMap = new Map(cursors.map((c) => [c.participantId, c.lastReadAt]));

      // Per-participant counting floor (ms). `lastReadAt → joinedAt → null` — identical
      // reduction to the single-participant `lastReadAt ?? p.joinedAt ?? null`.
      const floors = participants.map((p) => ({
        id: p.id,
        floorMs: ((cursorMap.get(p.id) ?? p.joinedAt)?.getTime() ?? null) as number | null,
      }));

      // A null floor counts every candidate message (no lower bound). If ANY participant
      // is unbounded we must fetch the full history; otherwise the oldest floor is enough.
      const hasUnboundedFloor = floors.some((f) => f.floorMs === null);
      const minFloorMs = hasUnboundedFloor
        ? null
        : Math.min(...floors.map((f) => f.floorMs as number));

      // ONE query for all participants. No `senderId` filter here — the "exclude my own
      // messages" cut is per-participant, applied in memory below. `orderBy createdAt asc`
      // walks the index in order, so per-sender buckets stay ascending.
      const rows = await this.prisma.message.findMany({
        where: {
          conversationId,
          deletedAt: null,
          ...(minFloorMs !== null ? { createdAt: { gt: new Date(minFloorMs) } } : {}),
        },
        select: { createdAt: true, senderId: true },
        orderBy: { createdAt: "asc" },
      });

      // All candidate timestamps (ascending) + per-sender buckets, so each participant's
      // own messages can be subtracted. JS sort is a defensive net (the DB already returns
      // index order) so the binary search holds regardless of source ordering.
      const allTimestamps = rows.map((r) => r.createdAt.getTime()).sort((a, b) => a - b);
      const bySender = new Map<string, number[]>();
      for (const r of rows) {
        const bucket = bySender.get(r.senderId);
        if (bucket) bucket.push(r.createdAt.getTime());
        else bySender.set(r.senderId, [r.createdAt.getTime()]);
      }

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
      // Buckets share the ascending order of `rows`, so they're valid for the same search.
      return new Map(
        floors.map((f) => {
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
        select: { id: true, conversationId: true, joinedAt: true },
      });

      if (participants.length === 0) return unreadCounts;

      // 2. Batch cursor lookup for all resolved participants
      const participantIds = participants.map((p) => p.id);
      const cursors = await this.prisma.conversationReadCursor.findMany({
        where: { participantId: { in: participantIds } },
        select: { participantId: true, lastReadAt: true },
      });
      const cursorMap = new Map(cursors.map((c) => [c.participantId, c.lastReadAt]));

      // 3. Parallel message counts — one per participant (= one per conversation)
      await Promise.all(
        participants.map(async (p) => {
          const lastReadAt = cursorMap.get(p.id) ?? null;
          const floor: Date | null = lastReadAt ?? p.joinedAt ?? null;
          const count = await this.prisma.message.count({
            where: {
              conversationId: p.conversationId,
              deletedAt: null,
              senderId: { not: p.id },
              ...(floor ? { createdAt: { gt: floor } } : {}),
            },
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
   * Marque les messages comme reçus pour un utilisateur connecté
   * Simplifié: Met à jour le curseur `lastDeliveredAt` UNIQUEMENT.
   */
  async markMessagesAsReceived(
    participantId: string,
    conversationId: string,
    latestMessageId?: string
  ): Promise<void> {
    try {
      const dedupKey = `${participantId}:${conversationId}:received`;
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

      const now = new Date();

      // Best-effort (cf. markMessagesAsRead) : borne la fenêtre du gel sans
      // jamais faire échouer le marquage du curseur.
      let prevDeliveredAt: Date | null = null;
      try {
        const prevCursor = await this.prisma.conversationReadCursor.findUnique({
          where: {
            conversation_participant_cursor: { participantId, conversationId },
          },
          select: { lastDeliveredAt: true },
        });
        prevDeliveredAt = prevCursor?.lastDeliveredAt ?? null;
      } catch {
        prevDeliveredAt = null;
      }

      await this.prisma.conversationReadCursor.upsert({
        where: {
          conversation_participant_cursor: { participantId, conversationId },
        },
        create: {
          participantId,
          conversationId,
          lastDeliveredMessageId: messageId,
          lastDeliveredAt: now,
          unreadCount: 0,
          version: 0,
        },
        update: {
          lastDeliveredMessageId: messageId,
          lastDeliveredAt: now,
          version: { increment: 1 },
        },
      });

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
  async markMessagesAsRead(
    participantId: string,
    conversationId: string,
    latestMessageId?: string
  ): Promise<void> {
    try {
      const dedupKey = `${participantId}:${conversationId}:read`;
      const dedupNow = Date.now();
      const lastCall = MessageReadStatusService.recentActionCache.get(dedupKey);

      if (
        lastCall &&
        dedupNow - lastCall < MessageReadStatusService.DEDUP_TTL_MS
      ) {
        return;
      }
      MessageReadStatusService.recentActionCache.set(dedupKey, dedupNow);

      const now = new Date();
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

      // Lecture best-effort du front précédent : sert uniquement à borner la
      // fenêtre du gel. Une erreur ici ne doit pas faire échouer le marquage
      // (on retombe sur `null` = gel depuis l'origine, lui-même résilient).
      let prevReadAt: Date | null = null;
      try {
        const prevCursor = await this.prisma.conversationReadCursor.findUnique({
          where: {
            conversation_participant_cursor: { participantId, conversationId },
          },
          select: { lastReadAt: true },
        });
        prevReadAt = prevCursor?.lastReadAt ?? null;
      } catch {
        prevReadAt = null;
      }

      await this.prisma.conversationReadCursor.upsert({
        where: {
          conversation_participant_cursor: { participantId, conversationId },
        },
        create: {
          participantId,
          conversationId,
          lastReadMessageId: messageId,
          lastReadAt: now,
          unreadCount: 0,
          version: 0,
        },
        update: {
          lastReadMessageId: messageId,
          lastReadAt: now,
          unreadCount: 0,
          version: { increment: 1 },
        },
      });

      // Précision absolue : fige un `MessageStatusEntry.readAt` par message
      // nouvellement franchi (write-once). Sans cela, le statut "lu" de chaque
      // message suivrait le curseur mobile `lastReadAt`, qui ré-avance à
      // `now` à chaque ouverture — collapsant tous les anciens messages à la
      // même date. Le curseur reste l'index rapide ; la date par message est
      // gelée à la première lecture.
      await this.freezeMessageStatus({
        participantId,
        conversationId,
        since: prevReadAt,
        at: now,
        field: "readAt",
      });

      logger.info(
        `[MessageReadStatus] Participant ${participantId} marked conversation ${conversationId} as read`
      );

      // Synchroniser avec les notifications (requires userId from participant)
      try {
        const participant = await this.prisma.participant.findUnique({
          where: { id: participantId },
          select: { userId: true }
        });

        if (participant?.userId) {
          const { NotificationService } = await import(
            "./notifications/NotificationService"
          );
          const notificationService = new NotificationService(this.prisma);
          await notificationService.markConversationNotificationsAsRead(
            participant.userId,
            conversationId
          );
        }
      } catch (notifError) {
        logger.warn(
          "[MessageReadStatus] Error syncing notifications:",
          notifError
        );
      }
    } catch (error) {
      logger.error(
        "[MessageReadStatus] Error marking messages as read:",
        error
      );
      throw error;
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
  }): Promise<void> {
    const { participantId, conversationId, since, at, field } = params;
    try {
      const messages = await this.prisma.message.findMany({
        where: {
          conversationId,
          deletedAt: null,
          senderId: { not: participantId },
          createdAt: { lte: at, ...(since ? { gt: since } : {}) },
        },
        select: { id: true },
      });

      if (messages.length === 0) return;
      const ids = messages.map((m) => m.id);

      const existing = await this.prisma.messageStatusEntry.findMany({
        where: { messageId: { in: ids }, participantId },
        select: { messageId: true, deliveredAt: true, readAt: true },
      });
      const existingIds = new Set(existing.map((e) => e.messageId));
      const toCreate = ids.filter((id) => !existingIds.has(id));

      if (toCreate.length > 0) {
        await this.prisma.messageStatusEntry.createMany({
          data: toCreate.map((messageId) =>
            field === "readAt"
              ? { messageId, conversationId, participantId, readAt: at }
              : {
                  messageId,
                  conversationId,
                  participantId,
                  deliveredAt: at,
                  receivedAt: at,
                }
          ),
        });
      }

      // Write-once: ne renseigne le champ que sur les entrées où il est encore
      // nul (ex: une entrée créée par la livraison reçoit ensuite son `readAt`).
      const toUpdate = existing
        .filter((e) => (field === "readAt" ? e.readAt === null : e.deliveredAt === null))
        .map((e) => e.messageId);

      if (toUpdate.length > 0) {
        await this.prisma.messageStatusEntry.updateMany({
          where:
            field === "readAt"
              ? { messageId: { in: toUpdate }, participantId, readAt: null }
              : { messageId: { in: toUpdate }, participantId, deliveredAt: null },
          data: field === "readAt" ? { readAt: at } : { deliveredAt: at, receivedAt: at },
        });
      }
    } catch (error) {
      logger.error(
        `[MessageReadStatus] freezeMessageStatus(${field}) failed for participant ${participantId} in conversation ${conversationId}:`,
        error
      );
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
    readBy: Array<{ participantId: string; displayName: string; avatarURL: string | null; readAt: Date }>;
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
      }>;
    }>;
  }> {
    try {
      const message = await this.prisma.message.findUnique({
        where: { id: messageId },
        select: { createdAt: true, senderId: true },
      });

      if (!message) throw new Error(`Message ${messageId} not found`);

      const participants = await this.prisma.participant.findMany({
        where: { conversationId, isActive: true },
        select: {
          id: true,
          displayName: true,
          avatar: true,
          user: { select: { avatar: true } },
        },
      });

      const totalMembers = Math.max(
        0,
        participants.length - 1
      );

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
        select: { participantId: true, deliveredAt: true, receivedAt: true, readAt: true },
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
      const readBy: Array<{ participantId: string; displayName: string; avatarURL: string | null; readAt: Date }> =
        [];

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

        const avatarURL = participant.avatar ?? participant.user?.avatar ?? null;

        const cursor = cursorByParticipant.get(participantId);
        const cursorDelivered =
          cursor?.lastDeliveredAt && cursor.lastDeliveredAt >= message.createdAt
            ? cursor.lastDeliveredAt
            : null;
        const cursorRead =
          cursor?.lastReadAt && cursor.lastReadAt >= message.createdAt
            ? cursor.lastReadAt
            : null;

        const frozen = frozenByParticipant.get(participantId);
        const receivedAt = frozen?.receivedAt ?? frozen?.deliveredAt ?? cursorDelivered;
        const readAt = frozen?.readAt ?? cursorRead;

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
          });
        }
      }

      // Per-attachment, per-participant media consumption (audio/video positions).
      // Mirrors the read-receipt detail above: surfaces how far each OTHER
      // participant listened to an audio / watched a video on this message.
      // Read straight from AttachmentStatusEntry (per-user rows the gateway
      // already persists on consumption). Exposed with the same visibility as
      // receivedBy/readBy — no extra privacy gate (parity with read receipts).
      const consumptionEntries = await this.prisma.attachmentStatusEntry.findMany({
        where: {
          messageId,
          participantId: { not: message.senderId },
        },
        select: {
          attachmentId: true,
          participantId: true,
          lastPlayPositionMs: true,
          listenedComplete: true,
          lastWatchPositionMs: true,
          watchedComplete: true,
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
        }>
      >();

      for (const entry of consumptionEntries) {
        const participant = participantById.get(entry.participantId);
        if (!participant) continue; // orphan entry — participant deleted/banned/inactive

        // Skip rows with no audio/video signal (e.g. download-only or image
        // entries): nothing to display as playback progress.
        const hasMediaSignal =
          entry.lastPlayPositionMs != null ||
          entry.listenedComplete ||
          entry.lastWatchPositionMs != null ||
          entry.watchedComplete;
        if (!hasMediaSignal) continue;

        const list = consumptionByAttachment.get(entry.attachmentId) ?? [];
        list.push({
          participantId: entry.participantId,
          displayName: participant.displayName,
          avatarURL: participant.avatar ?? participant.user?.avatar ?? null,
          lastPlayPositionMs: entry.lastPlayPositionMs ?? null,
          listenedComplete: entry.listenedComplete,
          lastWatchPositionMs: entry.lastWatchPositionMs ?? null,
          watchedComplete: entry.watchedComplete,
        });
        consumptionByAttachment.set(entry.attachmentId, list);
      }

      const attachmentConsumption = Array.from(consumptionByAttachment.entries()).map(
        ([attachmentId, participants]) => ({ attachmentId, participants })
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
          avatarURL: p.user?.avatar ?? null,
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
   * Récupère les statuts de lecture pour plusieurs messages via les curseurs
   */
  async getConversationReadStatuses(
    conversationId: string,
    messageIds: string[]
  ): Promise<Map<string, { totalMembers: number; receivedCount: number; readCount: number }>> {
    try {
      const messages = await this.prisma.message.findMany({
        where: { id: { in: messageIds }, conversationId },
        select: { id: true, createdAt: true, senderId: true },
      });

      const activeParticipantIds = new Set(
        (await this.prisma.participant.findMany({
          where: { conversationId, isActive: true },
          select: { id: true },
        })).map(p => p.id)
      );

      const cursors = await this.prisma.conversationReadCursor.findMany({
        where: { conversationId },
        select: { participantId: true, lastReadAt: true, lastDeliveredAt: true },
      });

      // Only consider cursors from active participants
      const activeCursors = cursors.filter(c => activeParticipantIds.has(c.participantId));

      const statusMap = new Map<
        string,
        { totalMembers: number; receivedCount: number; readCount: number }
      >();

      for (const msg of messages) {
        const totalMembers = Math.max(0, activeParticipantIds.size - (activeParticipantIds.has(msg.senderId) ? 1 : 0));
        let receivedCount = 0;
        let readCount = 0;

        for (const cursor of activeCursors) {
          if (cursor.participantId === msg.senderId) continue;

          if (
            cursor.lastDeliveredAt &&
            cursor.lastDeliveredAt >= msg.createdAt
          ) {
            receivedCount++;
          }
          if (cursor.lastReadAt && cursor.lastReadAt >= msg.createdAt) {
            readCount++;
          }
        }

        statusMap.set(msg.id, { totalMembers, receivedCount, readCount });
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

      const participants = evaluatedParticipantIds.length
        ? await this.prisma.participant.findMany({
            where: {
              id: { in: evaluatedParticipantIds },
              isActive: true,
            },
            select: { id: true, displayName: true, avatar: true },
          })
        : [];

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
        const cursorRead =
          cursor?.lastReadAt && cursor.lastReadAt >= message.createdAt
            ? cursor.lastReadAt
            : null;

        const frozen = frozenByParticipant.get(participantId);
        const deliveredAt = frozen?.deliveredAt ?? cursorDelivered;
        const receivedAt = frozen?.receivedAt ?? frozen?.deliveredAt ?? cursorDelivered;
        const readAt = frozen?.readAt ?? cursorRead;
        const readDevice = frozen?.readDevice ?? null;

        if (filter === "delivered" && !deliveredAt) continue;
        if (filter === "read" && !readAt) continue;
        if (filter === "unread" && readAt) continue;

        results.push({
          participantId,
          displayName: participant.displayName,
          avatar: participant.avatar,
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
      const whereClause: any = { attachmentId };
      if (filter === "viewed") whereClause.viewedAt = { not: null };
      else if (filter === "downloaded")
        whereClause.downloadedAt = { not: null };
      else if (filter === "listened") whereClause.listenedAt = { not: null };
      else if (filter === "watched") whereClause.watchedAt = { not: null };

      const total = await this.prisma.attachmentStatusEntry.count({
        where: whereClause,
      });

      // Avoid `include: { participant }` to stay resilient if a status
      // entry outlives its participant (same orphan-row risk as
      // ConversationReadCursor). Fetch participants in bulk and join in JS.
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
        },
      });

      const participants = statuses.length
        ? await this.prisma.participant.findMany({
            where: { id: { in: statuses.map(s => s.participantId) } },
            select: { id: true, displayName: true, avatar: true },
          })
        : [];

      const participantById = new Map(
        participants.map(p => [p.id, p])
      );

      const enrichedStatuses = statuses
        .map((s) => {
          const participant = participantById.get(s.participantId);
          if (!participant) return null; // skip orphan rows
          return {
            participantId: s.participantId,
            username: participant.displayName || "Unknown",
            avatar: participant.avatar ?? null,
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
          };
        })
        .filter((s): s is NonNullable<typeof s> => s !== null);

      return {
        statuses: enrichedStatuses,
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

  async markAudioAsListened(
    participantId: string,
    attachmentId: string,
    options?: {
      playPositionMs?: number;
      listenDurationMs?: number;
      complete?: boolean;
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
            },
            update: {
              listenedAt: now,
              listenCount: { increment: 1 },
              lastPlayPositionMs: options?.playPositionMs,
              totalListenDurationMs: options?.listenDurationMs
                ? { increment: options.listenDurationMs }
                : undefined,
              listenedComplete: options?.complete,
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
            },
            update: {
              watchedAt: now,
              watchCount: { increment: 1 },
              lastWatchPositionMs: options?.watchPositionMs,
              totalWatchDurationMs: options?.watchDurationMs
                ? { increment: options.watchDurationMs }
                : undefined,
              watchedComplete: options?.complete,
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
              viewDurationMs: options?.viewDurationMs,
              wasZoomed: options?.wasZoomed || false,
            },
            update: {
              viewedAt: now,
              viewDurationMs: options?.viewDurationMs,
              wasZoomed: options?.wasZoomed,
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
        select: { createdAt: true, senderId: true }
      });

      if (!latestMessage) {
        return { totalMembers: 0, deliveredCount: 0, readCount: 0 };
      }

      const activeParticipants = await this.prisma.participant.findMany({
        where: { conversationId, isActive: true, id: { not: latestMessage.senderId } },
        select: { id: true }
      });
      const totalMembers = activeParticipants.length;
      const activeIds = new Set(activeParticipants.map(p => p.id));

      const cursors = await this.prisma.conversationReadCursor.findMany({
        where: { conversationId, participantId: { not: latestMessage.senderId } },
        select: { participantId: true, lastDeliveredAt: true, lastReadAt: true }
      });

      // Only count cursors from active participants
      const activeCursors = cursors.filter(c => activeIds.has(c.participantId));

      const deliveredCount = activeCursors.filter(c =>
        c.lastDeliveredAt && c.lastDeliveredAt >= latestMessage.createdAt
      ).length;

      const readCount = activeCursors.filter(c =>
        c.lastReadAt && c.lastReadAt >= latestMessage.createdAt
      ).length;

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

      const [viewedCount, downloadedCount, listenedCount, watchedCount] =
        await Promise.all([
          this.prisma.attachmentStatusEntry.count({
            where: {
              attachmentId,
              viewedAt: { not: null },
              participantId: { not: authorId },
            },
          }),
          this.prisma.attachmentStatusEntry.count({
            where: {
              attachmentId,
              downloadedAt: { not: null },
              participantId: { not: authorId },
            },
          }),
          this.prisma.attachmentStatusEntry.count({
            where: {
              attachmentId,
              listenedAt: { not: null },
              participantId: { not: authorId },
            },
          }),
          this.prisma.attachmentStatusEntry.count({
            where: {
              attachmentId,
              watchedAt: { not: null },
              participantId: { not: authorId },
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
        if (viewedCount >= totalParticipants) {
          const last = await this.prisma.attachmentStatusEntry.findFirst({
            where: {
              attachmentId,
              viewedAt: { not: null },
              participantId: { not: authorId },
            },
            orderBy: { viewedAt: "desc" },
            select: { viewedAt: true },
          });
          viewedByAllAt = last?.viewedAt || null;
        }

        if (downloadedCount >= totalParticipants) {
          const last = await this.prisma.attachmentStatusEntry.findFirst({
            where: {
              attachmentId,
              downloadedAt: { not: null },
              participantId: { not: authorId },
            },
            orderBy: { downloadedAt: "desc" },
            select: { downloadedAt: true },
          });
          downloadedByAllAt = last?.downloadedAt || null;
        }

        if (listenedCount >= totalParticipants && isAudio) {
          const last = await this.prisma.attachmentStatusEntry.findFirst({
            where: {
              attachmentId,
              listenedAt: { not: null },
              participantId: { not: authorId },
            },
            orderBy: { listenedAt: "desc" },
            select: { listenedAt: true },
          });
          listenedByAllAt = last?.listenedAt || null;
        }

        if (watchedCount >= totalParticipants && isVideo) {
          const last = await this.prisma.attachmentStatusEntry.findFirst({
            where: {
              attachmentId,
              watchedAt: { not: null },
              participantId: { not: authorId },
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
