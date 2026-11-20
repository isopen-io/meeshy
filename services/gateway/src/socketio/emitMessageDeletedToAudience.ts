import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import type { MessageDeletedEventData } from '@meeshy/shared/types/socketio-events';
import { conversationAudienceRooms, loadLiveAudience } from './conversationAudienceRooms';
import { safeBroadcast, type ServerEmitIO } from './serverEmit';

export type MessageDeletedAudienceParams = {
  readonly io: ServerEmitIO;
  readonly prisma: Pick<PrismaClient, 'participant'>;
  readonly conversationId: string;
  readonly messageId: string;
  readonly deletedAt: Date;
  readonly onAudienceError?: (error: unknown) => void;
  readonly onEmitError?: (error: unknown) => void;
};

/**
 * `message:deleted`, servi à l'audience VIVANTE de la conversation — le fan-out
 * du transport SOCKET, extrait de `MessageHandler` (#20036, qui n'en demandait
 * que des lignes ; la cohésion est le vrai gain).
 *
 * #19943 — la room de conversation ET les rooms personnelles des participants
 * vivants, comme le jumeau REST (`broadcastMessageMutation`) et pour la raison
 * de #18556 : un lecteur qui a reçu `message:new` dans sa room PERSONNELLE
 * (régime par lecteur d'un message à pièce protégée) puis quitté le fil pour la
 * liste n'était atteint par aucun des deux canaux — ni l'émission de room, ni la
 * file, qui saute les CONNECTÉS.
 *
 * #20007 — le plafond de lecture TRONQUE en le journalisant ; seule une lecture
 * qui ne prouve RIEN replie sur la room de conversation seule.
 *
 * L'heure du retrait est REÇUE, jamais recomposée : la valeur écrite en base et
 * celle que les clients gravent doivent être la MÊME (un `new Date()` ici rendrait
 * deux instants pour un seul retrait).
 *
 * Ne lève pas : `safeBroadcast` garde l'émission, parce que le retrait est déjà
 * COMMIS et qu'un accroc d'adaptateur ne doit ni rendre 500 ni sauter la suite
 * du chemin — dont la seule garantie DURABLE, la file hors ligne (cycle 116).
 *
 * RETOURNE la charge servie, et c'est la raison d'être de ce retour : le direct
 * et la FILE sont deux projections d'une SEULE composition (cycle 123). Les
 * recomposer séparément est ce qui laisse les deux canaux dire deux choses — ici
 * deux `deletedAt` pour un seul retrait.
 */
export async function emitMessageDeletedToAudience(
  params: MessageDeletedAudienceParams,
): Promise<MessageDeletedEventData> {
  const { io, prisma, conversationId, messageId, deletedAt } = params;
  const audience = await loadLiveAudience(prisma, conversationId, { onError: params.onAudienceError });
  const payload: MessageDeletedEventData = { messageId, conversationId, deletedAt: deletedAt.toISOString() };
  // 7e site #17026, trouvé par le CLIQUET. Raison : `safeBroadcast`.
  safeBroadcast(
    'message:deleted',
    () => io.to(conversationAudienceRooms(conversationId, audience)).emit(SERVER_EVENTS.MESSAGE_DELETED, payload),
    params.onEmitError,
  );
  return payload;
}
