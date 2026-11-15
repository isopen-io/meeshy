import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { ROOMS } from '@meeshy/shared/types/socketio-events';
import { PARTICIPATION_VIVANTE } from '../routes/conversations/utils/access-control';
import { participantUserRooms, type ParticipantRoomTarget } from './emitToConversationParticipants';

/**
 * Les participants VIVANTS d'une conversation, réduits aux deux identités qui
 * nomment une room. Une lecture qui lève rend `[]` : l'appelant replie alors sur
 * la seule room de conversation, jamais sur rien.
 */
export async function loadLiveParticipantTargets(
  prisma: Pick<PrismaClient, 'participant'>,
  conversationId: string,
  onError?: (error: unknown) => void,
): Promise<ParticipantRoomTarget[]> {
  try {
    const rows = await prisma.participant.findMany({
      where: { conversationId, ...PARTICIPATION_VIVANTE },
      select: { id: true, userId: true },
    });
    return (rows ?? []) as ParticipantRoomTarget[];
  } catch (error) {
    onError?.(error);
    return [];
  }
}

/**
 * La room de conversation SUIVIE des rooms personnelles (`userId ?? id`),
 * dédoublonnées, pour UNE diffusion : Socket.IO ne remet l'événement qu'une
 * fois par socket présent dans plusieurs de ces rooms. Sans participant, la
 * room de conversation seule, sous sa forme de chaîne.
 */
export function conversationAudienceRooms(
  conversationId: string,
  participants: ReadonlyArray<ParticipantRoomTarget>,
): string | string[] {
  const rooms = participantUserRooms(participants, [ROOMS.conversation(conversationId)]);
  return rooms.length === 1 ? rooms[0] : rooms;
}
