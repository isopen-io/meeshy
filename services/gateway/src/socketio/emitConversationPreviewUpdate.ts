import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { ROOMS, SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';

/**
 * Minimal Socket.IO surface used by this helper. Kept structural so the
 * function is trivially unit-testable and accepts both the production
 * `Server` and the REST-side `socketIOManager.getIO()` shape.
 */
export interface PreviewEmitIO {
  to(room: string): { emit(event: string, payload: unknown): unknown };
}

type PreviewPrisma = Pick<PrismaClient, 'participant' | 'message'>;

/**
 * Fan a `conversation:updated` preview refresh to every active
 * participant's personal user room after a message edit or delete.
 *
 * `MESSAGE_EDITED` / `MESSAGE_DELETED` are emitted only to the
 * conversation room. A participant sitting on the conversation-list
 * screen has joined `user:<id>` but has left `conversation:<id>`, so it
 * never learns that the last-message preview changed — its list row keeps
 * rendering the pre-edit text or the deleted message indefinitely (until a
 * manual reopen triggers a stale-while-revalidate refetch).
 *
 * `broadcastNewMessage` already fans `CONVERSATION_UPDATED` to user rooms
 * on send for exactly this reason; this mirrors it for edit/delete so the
 * three transports (WS + the two REST edit/delete routes) cannot drift.
 *
 * The current latest non-deleted message is recomputed here so the payload
 * is always self-consistent: editing or deleting a NON-latest message emits
 * the unchanged preview, which is an idempotent no-op on clients. Anonymous
 * participants (no `userId`) are skipped, exactly as the send path does.
 *
 * Best-effort side channel — never throws. A failure here must not fail the
 * edit/delete that already succeeded; the optional `onError` hook lets
 * callers log it against the originating request.
 */
export async function emitConversationPreviewUpdate(
  prisma: PreviewPrisma,
  io: PreviewEmitIO | null | undefined,
  conversationId: string,
  updatedByUserId: string,
  onError?: (error: unknown) => void,
): Promise<void> {
  if (!io) return;
  try {
    const [participants, latest] = await Promise.all([
      prisma.participant.findMany({
        where: { conversationId, isActive: true },
        select: { userId: true },
      }),
      prisma.message.findFirst({
        where: { conversationId, deletedAt: null },
        orderBy: { createdAt: 'desc' },
        select: { id: true, content: true, senderId: true, createdAt: true },
      }),
    ]);

    const payload = {
      conversationId,
      // `updatedBy` is REQUIRED by ConversationUpdatedEventData — the User.id of
      // whoever triggered this edit/delete. Distinct from `senderId` (the
      // Participant.id of the current latest message's author): the actor and
      // the last-message author differ whenever a non-latest message is edited,
      // or the latest message is deleted leaving an earlier one on top. Mirrors
      // the send path in MeeshySocketIOManager, which always fills this field.
      updatedBy: { id: updatedByUserId },
      lastMessageAt: latest?.createdAt ?? null,
      lastMessageId: latest?.id ?? null,
      lastMessagePreview: latest?.content ?? null,
      senderId: latest?.senderId ?? null,
      updatedAt: new Date().toISOString(),
    };

    const seen = new Set<string>();
    for (const p of participants) {
      if (!p.userId || seen.has(p.userId)) continue;
      seen.add(p.userId);
      io.to(ROOMS.user(p.userId)).emit(SERVER_EVENTS.CONVERSATION_UPDATED, payload);
    }
  } catch (error) {
    onError?.(error);
  }
}
