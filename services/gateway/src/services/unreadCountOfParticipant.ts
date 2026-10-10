import type { PrismaClient } from "@meeshy/shared/prisma/client";
import { logger } from "../utils/logger";
import {
  CAPTURE_NOTICE_CANDIDATE_WHERE,
  hidingWithCaptureNotices,
  isCaptureNoticeCandidate,
  uncountedCaptureNotices,
} from "./messaging/captureNoticeVisibility";
import { applyPersonalHistoryHiding, loadPersonalHistoryHiding } from "./personalHistoryFilter";

/**
 * Les avis de capture de la fenêtre qui ne comptent pas pour ce participant
 * (#9630) — tous, sauf ceux qui nomment un de SES messages. Une fenêtre sans
 * avis ne coûte qu'une lecture indexée qui ne rend rien, et laisse la requête
 * de compte identique à l'octet près.
 */
async function uncountedCaptureNoticesIn(
  prisma: PrismaClient,
  window: Record<string, unknown>,
  participantId: string
): Promise<string[]> {
  const candidates = (await prisma.message.findMany({
    where: { ...window, ...CAPTURE_NOTICE_CANDIDATE_WHERE },
    select: { id: true, messageSource: true, messageType: true, expiresAt: true },
  })) as Array<{ id: string; messageSource?: string | null; messageType?: string | null; expiresAt?: Date | null }>;
  const ids = candidates.filter(isCaptureNoticeCandidate).map((row) => row.id);
  return [...(await uncountedCaptureNotices(prisma, ids))(participantId)];
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
export async function readUnreadCount(
  prisma: PrismaClient,
  participantIdOrUserId: string,
  conversationId: string
): Promise<number> {
  try {
    // First attempt: treat the caller's id as a Participant.id directly.
    // This is the common path for anonymous users and for callers that
    // already resolved to a participant.
    let cursor = await prisma.conversationReadCursor.findUnique({
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
    const participant = await prisma.participant.findFirst({
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
      cursor = await prisma.conversationReadCursor.findUnique({
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

    const window = {
      conversationId,
      deletedAt: null,
      senderId: { not: participant.id },
      ...(floor ? { createdAt: { gt: floor } } : {}),
    };

    const [personalHiding, uncounted] = await Promise.all([
      loadPersonalHistoryHiding(prisma, { userId: participant.userId, conversationId }),
      uncountedCaptureNoticesIn(prisma, window, participant.id),
    ]);

    return await prisma.message.count({
      where: applyPersonalHistoryHiding(window, hidingWithCaptureNotices(personalHiding, uncounted)),
    });
  } catch (error) {
    logger.error("[MessageReadStatus] Error getting unread count", error);
    return 0;
  }
}
