/**
 * OÙ SE RANGE UN COMMENTAIRE (#9584, décision porteur 2026-10-07, « fil propre »).
 *
 * Un commentaire écrit SOUS une republication simple est rangé sous ELLE : il
 * compte dans SON `commentCount`, prévient SON auteur, la crédite elle seule,
 * et la republication montre SON fil (`commentThreadOf`). Le reste ne bouge pas :
 *
 * - une réaction ou un like garde la redirection vers l'original et la
 *   duplication réelle de ses crédits (`resolveInteractionTarget`, `postsCreditedBy`) ;
 * - une citation, un post qui n'est pas une republication, une republication
 *   d'éphémère (qui a sa propre vie sociale) gardent leur propre fil ;
 * - une RÉPONSE suit son parent : répondre depuis une republication à un
 *   commentaire rangé sur l'original — écrit avant cette règle, aucune donnée
 *   n'étant migrée — la range sur l'original, avec lui ;
 * - écrire sous une republication exige le droit d'interagir sur ELLE et sur
 *   l'ORIGINAL (la résolution vérifie les deux), qu'aucun des deux n'ait fermé
 *   ses commentaires ;
 * - un blocage, dans un sens ou l'autre, entre l'auteur du commentaire et
 *   l'auteur du post — de l'original comme de la republication traversée —
 *   refuse le commentaire PARTOUT, comme un post introuvable, pour ne rien
 *   révéler du blocage ;
 * - tout ce qu'un commentaire rangé sous une republication fait partir vers des
 *   tiers — notifications, mentions, diffusions — a pour audience
 *   l'INTERSECTION des deux : qui lit le fil (`threadAudience`,
 *   `commentEventAudience`), fail-closed.
 */

import type { PrismaClient } from '@meeshy/shared/prisma/client';
import type { EngagementPostPath } from '@meeshy/shared/types/engagement-scale';
import { isBlockedWithAny } from '../../utils/blocking';
import { resolveConsumptionTarget, type PostRedirectRecord } from './postVisibility';
import { NOT_DELETED } from './softDelete';

/** Le post où le commentaire est rangé, et le chemin du geste pour sa limite quotidienne. */
export type CommentHome = { readonly id: string; readonly authorId: string; readonly path: EngagementPostPath };

export type CommentHomeAdmission =
  | { readonly home: CommentHome; readonly refusal?: undefined }
  | { readonly refusal: 'COMMENTS_DISABLED' | 'NOT_FOUND'; readonly home?: undefined };

/** LA règle : sous la republication traversée, sauf une réponse dont le parent vit sur l'original. */
export function commentHomeOf(target: PostRedirectRecord, parentPostId?: string | null): CommentHome {
  const through = target.redirectedFrom;
  if (!through || parentPostId === target.id) return { id: target.id, authorId: target.authorId, path: 'original' };
  return { id: through.id, authorId: through.authorId, path: 'repost' };
}

/** Le fil qu'un lecteur ouvre depuis ce post : celui de la republication simple traversée, sinon le sien. */
export const commentThreadOf = (target: PostRedirectRecord): string => target.redirectedFrom?.id ?? target.id;

async function postOfComment(prisma: PrismaClient, commentId: string): Promise<string | null> {
  const parent = await prisma.postComment.findFirst({
    where: { id: commentId, deletedAt: NOT_DELETED },
    select: { postId: true },
  });
  return parent?.postId ?? null;
}

/**
 * Où ranger ce commentaire, ou pourquoi le refuser — AVANT toute écriture.
 * `target` vient de `resolveInteractionTarget`, qui a déjà vérifié l'audience.
 */
export async function admitCommentHome(
  prisma: PrismaClient,
  target: PostRedirectRecord,
  request: { readonly commenterId: string; readonly parentId?: string | null },
): Promise<CommentHomeAdmission> {
  const through = target.redirectedFrom;
  if (await isBlockedWithAny(prisma, request.commenterId, [target.authorId, through?.authorId])) return { refusal: 'NOT_FOUND' };
  if (target.commentsDisabled || through?.commentsDisabled) return { refusal: 'COMMENTS_DISABLED' };
  if (!through) return { home: commentHomeOf(target) };
  const parentPostId = request.parentId ? await postOfComment(prisma, request.parentId) : null;
  return { home: commentHomeOf(target, parentPostId) };
}

/** Un destinataire d'un commentaire peut-il lire son fil ? `null` : le verdict du post rangé suffit. */
export type ThreadAudience = ((recipientId: string) => Promise<boolean>) | null;

/**
 * L'audience d'une notification d'un commentaire rangé sous une republication :
 * qui peut LIRE son fil — la republication ET l'original (le verdict de
 * `resolveConsumptionTarget`, celui de la lecture du fil) — sans blocage avec
 * l'un ou l'autre auteur ni avec le commentateur. Fermée sur l'échec.
 * `null` pour un commentaire rangé ailleurs : l'audience du post s'applique.
 */
export function threadAudience(
  prisma: PrismaClient,
  target: PostRedirectRecord,
  home: CommentHome,
  commenterId: string,
): ThreadAudience {
  if (home.path !== 'repost' || !target.redirectedFrom) return null;
  const authors = [target.authorId, target.redirectedFrom.authorId, commenterId];
  return async (recipientId) => {
    try {
      if ((await resolveConsumptionTarget(prisma, home.id, recipientId)) === null) return false;
      return !(await isBlockedWithAny(prisma, recipientId, authors));
    } catch {
      return false;
    }
  };
}

type CommentEventPost = {
  readonly authorId: string;
  readonly visibility: string;
  readonly visibilityUserIds?: readonly string[] | null;
  readonly isQuote?: boolean | null;
  readonly repostOfId?: string | null;
};

/**
 * L'audience d'un événement temps réel de commentaire (ajout, édition,
 * suppression). Sous une republication simple, l'audience de la republication
 * seule pourrait voir passer le fil d'un original qu'elle ne lit pas : seule
 * la room du post — rejointe par `post:join` après la vérification des deux —
 * et son auteur le reçoivent (`PRIVATE` au filtre de diffusion). Une
 * republication d'éphémère, qui a son propre fil, y perd la diffusion au fil
 * d'actualité : fermé plutôt qu'ouvert.
 */
export function commentEventAudience(post: CommentEventPost): { readonly visibility: string; readonly visibilityUserIds: string[] } {
  const simpleRepost = post.isQuote !== true && Boolean(post.repostOfId);
  if (simpleRepost) return { visibility: 'PRIVATE', visibilityUserIds: [] };
  return { visibility: post.visibility, visibilityUserIds: [...(post.visibilityUserIds ?? [])] };
}
