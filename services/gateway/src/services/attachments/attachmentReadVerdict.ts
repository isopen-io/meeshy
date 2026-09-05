/**
 * Qui a le droit de lire une pièce jointe, et son message porteur rend-il
 * encore ses octets ? Source UNIQUE — extraite de `routes/attachments/download.ts`
 * (#4923) pour que `GET /attachments/:id` (les octets) et
 * `GET /attachments/:id/metadata` (transcription, traductions, URL) referment
 * la même porte plutôt que deux versions qui dérivent.
 *
 * Trois issues, et non deux — parce que « tu n'as pas le droit » et « ce
 * contenu n'existe plus » ne se répondent pas avec le même code :
 *
 *  - `allow`     — sert le contenu ;
 *  - `forbidden` — 403, l'appelant est étranger à la conversation ;
 *  - `gone`      — 404, le message porteur a été rappelé, a expiré, ou sa
 *                  brûlure de vue unique est consommée.
 *
 * Le rattachement passe par le message : `messageId` → conversation →
 * participation. Une pièce jointe pas encore rattachée à un message (envoi en
 * cours) n'est lisible que par la personne qui l'a déposée.
 *
 * L'APPARTENANCE SE JUGE AVANT LE CYCLE DE VIE, délibérément : un étranger
 * doit recevoir le même 403 qu'un message soit vivant ou détruit, sans quoi la
 * paire 403/404 lui apprendrait ce qu'il est advenu d'un contenu auquel il n'a
 * jamais eu accès.
 */
import type { FastifyRequest, FastifyReply } from 'fastify';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { sendForbidden, sendNotFound } from '../../utils/response.js';
import { carrierMessageStillServesBytes } from './carrierMessageLifecycle';

export type AttachmentReadVerdict = 'allow' | 'forbidden' | 'gone';

export async function resolveAttachmentReadVerdict(
  request: FastifyRequest,
  attachment: { messageId?: string | null; uploadedBy?: string | null },
  prisma: Pick<PrismaClient, 'message' | 'participant'>
): Promise<AttachmentReadVerdict> {
  const authContext = (request as unknown as { authContext?: {
    isAuthenticated?: boolean; isAnonymous?: boolean; userId?: string; participantId?: string;
  } }).authContext;

  if (!authContext?.isAuthenticated) return 'forbidden';

  if (!attachment.messageId) {
    // Pas encore rattachée : seul le déposant y accède. Aucun porteur dont
    // hériter une échéance — l'envoi est en cours.
    const caller = authContext.participantId ?? authContext.userId;
    return Boolean(caller) && caller === attachment.uploadedBy ? 'allow' : 'forbidden';
  }

  const message = await prisma.message.findUnique({
    where: { id: attachment.messageId },
    // `deletedAt`/`expiresAt` voyagent avec `conversationId` : la garde de
    // cycle de vie ne coûte aucun aller-retour de plus.
    select: { conversationId: true, deletedAt: true, expiresAt: true }
  });
  if (!message) return 'forbidden';

  // Le discriminant est le type d'identité : un participant anonyme muni
  // d'un jeton de session est authentifié lui aussi.
  const where = authContext.isAnonymous && authContext.participantId
    ? { id: authContext.participantId, conversationId: message.conversationId, isActive: true }
    : { userId: authContext.userId, conversationId: message.conversationId, isActive: true };

  const participant = await prisma.participant.findFirst({ where, select: { id: true } });
  if (participant === null) return 'forbidden';

  // Le dernier maillon de la chaîne de destruction des cycles 92 à 94 : les
  // octets suivent la vie du message porteur. Cf. `carrierMessageLifecycle`.
  return carrierMessageStillServesBytes(message, new Date()) ? 'allow' : 'gone';
}

/**
 * Un refus de cycle de vie rend le MÊME 404 que la route rendra une minute
 * plus tard, quand le balayage aura `unlink` le fichier — aucun client ne voit
 * son comportement changer selon qu'il arrive avant ou après.
 */
export function denyAttachmentRead(reply: FastifyReply, verdict: 'forbidden' | 'gone', notFoundMessage: string) {
  return verdict === 'gone'
    ? sendNotFound(reply, notFoundMessage)
    : sendForbidden(reply, 'Access denied to this attachment');
}
