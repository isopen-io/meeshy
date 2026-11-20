import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import type { AttachmentDeletedEventData } from '@meeshy/shared/types/socketio-events';
import type { MessageMutationManager } from './broadcastMessageMutation';
import { conversationAudienceRooms, loadLiveAudience } from './conversationAudienceRooms';

export type AttachmentDeletedParams = {
  readonly prisma: Pick<PrismaClient, 'message' | 'participant'>;
  readonly manager: Pick<MessageMutationManager, 'getIO' | 'enqueueOfflineMessageMutation'> | null | undefined;
  readonly messageId: string | null;
  readonly attachmentId: string;
  /** L'auteur du retrait, exclu de la file : il vient de recevoir sa réponse REST. */
  readonly actorUserId?: string | null;
  readonly onError?: (error: unknown) => void;
};

/**
 * #13608, #20019 — le retrait d'UNE pièce se voit chez tous ceux à qui le
 * message est arrivé. Charge minimale (jamais le contenu de la pièce) ; un échec
 * de diffusion ne défait pas une suppression déjà faite.
 *
 * ── Les DEUX audiences, et pourquoi la room de conversation n'en est qu'une ──
 *
 * `attachment:deleted` ne partait qu'à `conversation:<id>`, et n'avait aucune
 * entrée de file. Deux populations ne l'apprenaient donc jamais :
 *
 *  · le lecteur resté sur la LISTE — sa room PERSONNELLE est la seule adresse
 *    de `message:new` dès que le message porte une pièce protégée
 *    (`messageNewEmission.emitPerReader`), et on QUITTE `conversation:<id>` en
 *    revenant à la liste (`ConversationHandler`, `StatusHandler`) ;
 *  · le lecteur HORS LIGNE — son cache de fil (`staleTime: Infinity` côté web)
 *    gardait la pièce jusqu'à un rechargement manuel.
 *
 * C'est l'asymétrie que #18556, #19943 et #20007 ont fermée sur les cinq
 * familles d'ids du MESSAGE. Son jumeau `message:attachment-updated` ne l'a
 * jamais eue : `emitAttachmentUpdated` nomme les rooms personnelles ET enfile
 * depuis toujours. Élargir n'ouvre aucune surface : la charge ne porte que des
 * ids (`AttachmentDeletedEventData`), et le puits web le dit de son côté
 * (`realtime-attachment-deleted.ts` : « IDEMPOTENT : rejoué, l'événement
 * retombe sur "pièce déjà absente" »).
 *
 * `dedupKey` nomme la PIÈCE, jamais le message : sous la dédup par défaut
 * (`messageId` + `eventType`), le retrait d'une seconde pièce du même message
 * supplanterait le premier, et l'absent n'apprendrait qu'un des deux. Même
 * raison et même forme que `emitAttachmentUpdated` (#17026).
 *
 * Ne lève jamais : les deux canaux sont gardés séparément, et l'enfilage
 * (DURABLE) ne dépend pas de l'émission (cosmétique) — règle du cycle 116.
 */
export async function broadcastAttachmentDeleted(params: AttachmentDeletedParams): Promise<void> {
  const { prisma, manager, messageId, attachmentId, onError } = params;
  if (!manager || !messageId) return;

  let conversationId: string | null = null;
  try {
    const message = await prisma.message.findUnique({
      where: { id: messageId },
      select: { conversationId: true },
    });
    conversationId = message?.conversationId ?? null;
  } catch (error) {
    onError?.(error);
    return;
  }
  // Pas de conversation à nommer ⇒ ni adresse de diffusion, ni clé de file :
  // il n'y a rien à dire à personne.
  if (!conversationId) return;

  const payload: AttachmentDeletedEventData = { conversationId, messageId, attachmentId };

  const audience = await loadLiveAudience(prisma, conversationId, { onError });
  try {
    manager.getIO()?.to(conversationAudienceRooms(conversationId, audience)).emit(SERVER_EVENTS.ATTACHMENT_DELETED, payload);
  } catch (error) {
    onError?.(error);
  }

  // DEUX gardes, parce qu'il y a deux façons d'échouer et qu'aucune ne couvre
  // l'autre : le try/catch garde l'APPEL (un double de gestionnaire sans la
  // méthode, un `throw` synchrone), le `.catch` garde la PROMESSE RENDUE — un
  // rejet non traité termine le process sous le
  // `--unhandled-rejections=throw` par défaut de Node 22 (leçon 230).
  try {
    void Promise.resolve(
      manager.enqueueOfflineMessageMutation({
        conversationId,
        actorUserId: params.actorUserId ?? null,
        messageId,
        eventType: 'attachment-deleted',
        payload,
        dedupKey: attachmentId,
      }),
    ).catch((error: unknown) => onError?.(error));
  } catch (error) {
    onError?.(error);
  }
}
