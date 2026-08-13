import { ROOMS, SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';

/**
 * A conversation participant, reduced to what the unread fan-out reads.
 * `joinedAt` is NOT decoration: it is the counting floor a participant who has
 * never read anything falls back to, so dropping it would count the whole
 * pre-arrival history as unread.
 */
export interface UnreadRecipient {
  readonly id: string;
  readonly userId: string | null;
  readonly joinedAt: Date | null;
}

/**
 * The Socket.IO surface this fan-out needs, kept structural so it accepts the
 * typed server, the manager's `getIO()` (which is nullable during boot) and a
 * test double alike.
 */
export interface UnreadCountEmitter {
  to(room: string): { emit(event: string, payload: unknown): void };
}

export interface UnreadCountReader {
  getUnreadCountsForParticipants(
    participants: ReadonlyArray<{ id: string; userId?: string | null; joinedAt: Date | null }>,
    conversationId: string
  ): Promise<Map<string, number>>;
}

export interface UnreadParticipantSource {
  participant: {
    findMany(args: {
      where: { conversationId: string; isActive: boolean };
      select: { id: true; userId: true; joinedAt: true };
    }): Promise<UnreadRecipient[]>;
  };
}

/**
 * What EVERY committed message owes its RECIPIENTS: a fresh unread badge.
 *
 * `conversation:unread-updated` is the only live signal that moves a
 * recipient's unread pill. The count itself is derived from read cursors, so it
 * is always right at the next full refetch — but the web conversation list runs
 * on `staleTime: Infinity`, so without this push the pill keeps showing its
 * previous value indefinitely while the conversation visibly jumps to the top
 * of the list with a new preview. The badge does not go stale: it lies.
 *
 * This existed in TWO copies — `MessageHandler._updateUnreadCounts` (private)
 * and an inline block in `MeeshySocketIOManager._broadcastNewMessage` — which
 * differed only in the sender-exclusion predicate, i.e. in a value, not in a
 * behavior. Both were unreachable from the share-link send routes, which bypass
 * both classes entirely, so a message sent through a share link (the ONLY send
 * transport an anonymous participant has) never moved anyone's badge.
 *
 * Sender exclusion goes through BOTH identities. `senderId` is a
 * `Participant.id` on the REST/ZMQ and share-link transports and a `User.id` on
 * the WS transport; the two id spaces are ObjectIds of distinct collections and
 * never collide, so the wide predicate is strictly equivalent to the narrow one
 * wherever the narrow one was already correct, and correct where it was not.
 *
 * The room falls back to the participant id when the participant has no
 * account. That is not defensive padding: a conversation opened through a share
 * link is populated with ANONYMOUS participants, who are precisely this
 * transport's audience.
 *
 * Best-effort — never throws, never awaited on the ACK path. A missing badge
 * must not turn a delivered message into a 500, nor block the offline queue.
 * `participants` lets a caller that already loaded the list (the manager loads
 * one superset for `conversation:updated` + the offline queue) avoid a second
 * round-trip on the service's hottest path.
 */
export async function emitUnreadCountsToRecipients(params: {
  io: UnreadCountEmitter | null | undefined;
  prisma: UnreadParticipantSource;
  readStatusService: UnreadCountReader;
  conversationId: string;
  senderId: string | null | undefined;
  participants?: ReadonlyArray<UnreadRecipient>;
  onError?: (error: unknown) => void;
}): Promise<void> {
  const { io, prisma, readStatusService, conversationId, senderId, participants, onError } = params;
  if (!io || !senderId) return;

  try {
    const all =
      participants ??
      (await prisma.participant.findMany({
        where: { conversationId, isActive: true },
        select: { id: true, userId: true, joinedAt: true },
      }));

    const recipients = all.filter((p) => p.id !== senderId && p.userId !== senderId);
    // A single-participant conversation is common right after a share link is
    // created, and the count service costs up to two queries.
    if (recipients.length === 0) return;

    const counts = await readStatusService.getUnreadCountsForParticipants(recipients, conversationId);

    for (const recipient of recipients) {
      io.to(ROOMS.user(recipient.userId ?? recipient.id)).emit(SERVER_EVENTS.CONVERSATION_UNREAD_UPDATED, {
        conversationId,
        unreadCount: counts.get(recipient.id) ?? 0,
      });
    }
  } catch (error) {
    onError?.(error);
  }
}
