import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import { sharedPlaceFromMetadata } from '../services/location/sharedPlace';
import { participantUserRooms } from './emitToConversationParticipants';
import { resolveLastMessagePrismeByRoom } from './utils/lastMessagePrisme';

/**
 * Minimal Socket.IO surface used by this helper. Kept structural so the
 * function is trivially unit-testable and accepts both the production
 * `Server` and the REST-side `socketIOManager.getIO()` shape.
 */
export interface PreviewEmitIO {
  to(room: string): { emit(event: string, payload: unknown): unknown };
}

type PreviewPrisma = Pick<PrismaClient, 'participant' | 'message' | 'user'>;

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
 * the unchanged preview, which is an idempotent no-op on clients.
 *
 * Every active participant is reached, accountless ones included — see
 * `participantUserRooms`. This paragraph used to say the opposite ("anonymous
 * participants are skipped, exactly as the send path does"), and it was
 * accurate on both counts: the send path skipped them too. A shared-link guest
 * sitting on the conversation list therefore kept rendering the pre-edit text
 * of a message, or a deleted one, until a manual reopen.
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
        // `id` is not decoration: it NAMES the personal room of a participant
        // with no `User` row. Selecting `userId` alone did not ignore the
        // fallback identity, it never read it.
        // `language` est la seule préférence linguistique d'un participant sans
        // compte — sans elle, un invité de lien n'aurait jamais d'aperçu traduit.
        select: { id: true, userId: true, language: true },
      }),
      prisma.message.findFirst({
        where: { conversationId, deletedAt: null },
        orderBy: { createdAt: 'desc' },
        // Lot 3 : sans `metadata`, un dernier message géolocalisé n'affiche
        // jamais sa position dans ce fanout temps réel de l'aperçu.
        // `translations` / `originalLanguage` : le Prisme de la ligne de liste.
        // Une édition périme la colonne dans la MÊME écriture (`translations:
        // null`) — les relire ici est ce qui transporte ce vide jusqu'au client.
        select: {
          id: true,
          content: true,
          senderId: true,
          createdAt: true,
          metadata: true,
          translations: true,
          originalLanguage: true,
        },
      }),
    ]);

    // Un message géolocalisé sans légende a un `lastMessagePreview` vide —
    // hisser `location` ne fabrique aucun texte de repli côté serveur ; le
    // client décide comment rendre "" + location (ex. via messageType ou la
    // seule présence de `location`), pas ce helper.
    const place = sharedPlaceFromMetadata((latest as { metadata?: unknown } | null)?.metadata);

    const prismeByRoom = await resolveLastMessagePrismeByRoom({
      prisma,
      participants,
      translations: latest?.translations,
      originalLanguage: latest?.originalLanguage,
      onError,
    });

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
      // Le Prisme de la ligne de liste voyage AVEC l'aperçu, en groupe monotone.
      // `null` n'est pas une absence : c'est le serveur qui dit « plus aucune
      // traduction ne sert ton prisme », et c'est ce vide reçu qui périme la
      // carte que le client garde de l'ANCIEN texte. Sans lui, une édition
      // laissait la ligne rendre le contenu d'avant indéfiniment — le résolveur
      // client préfère la traduction, et personne ne lui avait dit qu'elle ne
      // décrivait plus le message.
      lastMessageOriginalLanguage: latest?.originalLanguage ?? null,
      senderId: latest?.senderId ?? null,
      updatedAt: new Date().toISOString(),
      ...(place ? { location: place } : {}),
    };

    for (const room of participantUserRooms(participants)) {
      io.to(room).emit(SERVER_EVENTS.CONVERSATION_UPDATED, {
        ...payload,
        lastMessageTranslations: prismeByRoom.get(room) ?? null,
      });
    }
  } catch (error) {
    onError?.(error);
  }
}
