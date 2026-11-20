import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import { citedPostWithdrawnAt, type CitedPostLiveness } from '../services/messaging/servedPostReply';
import { enhancedLogger } from '../utils/logger-enhanced';
import { conversationAudienceRooms, loadLiveAudience } from './conversationAudienceRooms';
import type { ServerEmitIO } from './serverEmit';

const logger = enhancedLogger.child({ module: 'announceCitedPostWithdrawal' });

/**
 * LE RETRAIT D'UN POST CITÉ, ANNONCÉ AUX CONVERSATIONS QUI LE CITENT (#7969).
 *
 * `servedPostReply.ts` (#7950) sert `postReplyTo.deletedAt` à toute LECTURE ;
 * une conversation déjà OUVERTE ne relit rien, et sa carte restait pleine et
 * tapable jusqu'au prochain chargement. Les deux routes qui retirent un post
 * (`DELETE /posts/:postId`, `DELETE /admin/posts/:postId`) appellent ceci après
 * avoir committé `deletedAt`.
 *
 * - Le retrait se décide par `citedPostWithdrawnAt`, la règle de la lecture :
 *   un masquage APRÈS l'échéance est une expiration, et l'instantané reste.
 * - UNE requête, sur l'index `Message.storyReplyToId`, dédoublonnée par
 *   conversation : seul `conversationId` sort de la base.
 * - Une émission par conversation, vers son AUDIENCE VIVANTE — sa room et les
 *   rooms personnelles de ses participants (#20019). Un membre
 *   hors ligne lira `postReplyTo.deletedAt` au prochain chargement.
 * - La charge ne porte que `{ conversationId, postId, deletedAt }` : rien du
 *   contenu retiré.
 */

export type CitedPostWithdrawalPrisma = Pick<PrismaClient, 'message' | 'participant'>;

export type RemovedCitedPost = CitedPostLiveness & { readonly id: string };

export async function announceCitedPostWithdrawal(params: {
  readonly prisma: CitedPostWithdrawalPrisma;
  readonly io: ServerEmitIO | null | undefined;
  readonly post: RemovedCitedPost;
}): Promise<readonly string[]> {
  const { prisma, io, post } = params;
  const withdrawnAt = citedPostWithdrawnAt(post);
  if (!io || !withdrawnAt) return [];

  const citing = await prisma.message.findMany({
    where: { storyReplyToId: post.id },
    select: { conversationId: true },
    distinct: ['conversationId'],
  });
  const conversationIds = [...new Set(citing.map((row) => row.conversationId))];
  const deletedAt = withdrawnAt.toISOString();

  // #20019 — l'audience VIVANTE de chaque conversation citante, pas seulement
  // son fil : un lecteur revenu à la LISTE a quitté `conversation:<id>` et
  // garde sa room PERSONNELLE, qui est la seule adresse de `message:new` dès
  // que le message porte une pièce protégée (`messageNewEmission.emitPerReader`).
  // Rien ne le rattrapait — la charge ne porte que des ids, donc élargir
  // n'ouvre aucune surface (même arbitrage que #19943).
  //
  // Le coût est d'une lecture d'audience PAR conversation citante, pas par
  // participant, et une lecture qui lève ne prive que SA conversation : les
  // autres sont servies. Le repli y est la room de conversation seule, le
  // comportement d'avant ce lot.
  for (const conversationId of conversationIds) {
    const audience = await loadLiveAudience(prisma, conversationId, {
      onError: (error) =>
        logger.warn('cited-post withdrawal audience lookup failed — conversation room only', {
          conversationId,
          postId: post.id,
          error,
        }),
    });
    io.to(conversationAudienceRooms(conversationId, audience)).emit(SERVER_EVENTS.MESSAGE_CITED_POST_WITHDRAWN, {
      conversationId,
      postId: post.id,
      deletedAt,
    });
  }
  return conversationIds;
}
