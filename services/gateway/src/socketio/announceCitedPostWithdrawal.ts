import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { ROOMS, SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import { citedPostWithdrawnAt, type CitedPostLiveness } from '../services/messaging/servedPostReply';
import type { ServerEmitIO } from './serverEmit';

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
 * - Une émission par conversation, vers sa room : tout membre en ligne l'a
 *   rejointe à l'authentification, conversation ouverte ou non. Un membre
 *   hors ligne lira `postReplyTo.deletedAt` au prochain chargement.
 * - La charge ne porte que `{ conversationId, postId, deletedAt }` : rien du
 *   contenu retiré.
 */

export type CitedPostWithdrawalPrisma = Pick<PrismaClient, 'message'>;

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

  conversationIds.forEach((conversationId) => {
    io.to(ROOMS.conversation(conversationId)).emit(SERVER_EVENTS.MESSAGE_CITED_POST_WITHDRAWN, {
      conversationId,
      postId: post.id,
      deletedAt,
    });
  });
  return conversationIds;
}
