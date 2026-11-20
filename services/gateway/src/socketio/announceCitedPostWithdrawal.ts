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
 *
 * ─── LA BORNE, ET POURQUOI UNE SEULE SUFFIT (#20109) ────────────────────────
 *
 * Cette unité porte DEUX coûts qui croissent avec la popularité du post : la
 * lecture des citants, et le nombre de lectures d'audience qu'elle commande
 * (une par conversation citante). Aucun des deux n'était majoré.
 *
 * Et ses trois appelants la lancent DÉTACHÉE (`.catch(…)`, jamais `await`) :
 * la route rend sa réponse tout de suite. Le coût ne tombe donc pas dans
 * l'attente de l'utilisateur — il tombe sur la passerelle et la base APRÈS la
 * réponse, sans que personne ne regarde. C'est pire pour l'observabilité, pas
 * meilleur : une rafale de 50 000 lectures séquentielles qu'aucun appelant
 * n'attend ne se manifeste que par la lenteur qu'elle inflige aux autres.
 *
 * {@link CITED_WITHDRAWAL_SCAN_CAP} les majore tous les deux, parce que les
 * conversations annoncées sont un SOUS-ENSEMBLE des lignes lues : borner les
 * lignes borne les conversations, donc aussi les lectures d'audience. Un second
 * plafond sur les annonces n'aurait rien ajouté.
 *
 * **La troncature porte sur les LIGNES, et c'est ce qui la rend sûre.** Si les
 * lignes lues tiennent sous le plafond, nous les avons TOUTES, donc toutes les
 * conversations : aucune ne peut manquer. Sinon on journalise. Le journal est
 * donc CONSERVATEUR — il part dès qu'une conversation a PU être perdue, y
 * compris quand une seule conversation très citante a consommé le plafond à
 * elle seule, cas où le nombre de conversations annoncées est pourtant loin du
 * plafond. Mesurer la troncature sur les conversations aurait raté exactement
 * ce cas, en silence.
 *
 * **Ce qu'une conversation non annoncée perd, et où elle le retrouve** :
 * `servedPostReply.ts` (#7950) sert `postReplyTo.deletedAt` à TOUTE lecture.
 * Elle retrouve donc la vérité à son prochain chargement, exactement comme un
 * membre hors ligne — c'est le verdict `reload-serves-truth` que
 * `UNQUEUED_FAMILY_VERDICT` déclare pour cette famille (#20045), et c'est lui
 * qui rend une troncature acceptable ICI alors qu'elle ne le serait pas pour
 * une famille dont la relecture ne sert pas la vérité. Ce qui ne serait pas
 * acceptable est de tronquer SANS TRACE (#20007).
 */

/**
 * Le plafond de lignes citantes lues, donc de conversations annoncées, donc de
 * lectures d'audience.
 *
 * 200, et le nombre est choisi par ce qu'il MAJORE, pas par ce qu'il couvre :
 * au-delà, une seule suppression de post commanderait plus de 200 lectures
 * d'audience séquentielles — chacune bornée à `LIVE_AUDIENCE_SCAN_CAP` — et
 * autant d'émissions, en tâche détachée que personne n'attend. Un post cité
 * dans plus de 200 conversations est au-delà de ce qu'une annonce en direct
 * peut servir utilement ; c'est le chargement qui sert ces conversations, et il
 * le fait déjà.
 */
export const CITED_WITHDRAWAL_SCAN_CAP = 200;

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
    // `cap + 1` : la SONDE, pas une ligne de marge. C'est la seule façon de
    // distinguer « exactement le plafond » de « au moins un de plus », donc de
    // SAVOIR qu'on tronque (même forme que `loadLiveAudience`, #20007).
    take: CITED_WITHDRAWAL_SCAN_CAP + 1,
  });
  // Le `Set` reste, et il ne double PAS le `distinct` : celui-ci est un
  // paramètre de requête dont l'application dépend du connecteur, et une
  // dédoublonnée de plus sur 201 lignes ne coûte rien face à une émission
  // dupliquée vers une room.
  const allIds = [...new Set(citing.map((row) => row.conversationId))];
  const truncated = citing.length > CITED_WITHDRAWAL_SCAN_CAP;
  if (truncated) {
    logger.warn('cited-post withdrawal truncated by scan cap — remaining conversations served by the next load', {
      postId: post.id,
      cap: CITED_WITHDRAWAL_SCAN_CAP,
      announced: Math.min(allIds.length, CITED_WITHDRAWAL_SCAN_CAP),
    });
  }
  const conversationIds = allIds.slice(0, CITED_WITHDRAWAL_SCAN_CAP);
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
