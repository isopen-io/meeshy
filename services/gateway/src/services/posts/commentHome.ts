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
 *   ses commentaires, et qu'aucun blocage ne sépare l'auteur du commentaire de
 *   l'auteur de l'un ou de l'autre — refusé comme un post introuvable, pour ne
 *   rien révéler du blocage.
 */

import type { PrismaClient } from '@meeshy/shared/prisma/client';
import type { EngagementPostPath } from '@meeshy/shared/types/engagement-scale';
import { isBlockedBetween } from '../../utils/blocking';
import type { PostRedirectRecord } from './postVisibility';
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

async function blockedWithAny(prisma: PrismaClient, commenterId: string, authorIds: readonly string[]): Promise<boolean> {
  const others = [...new Set(authorIds)].filter((authorId) => authorId !== commenterId);
  const verdicts = await Promise.all(others.map((authorId) => isBlockedBetween(prisma, commenterId, authorId)));
  return verdicts.some(Boolean);
}

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
  if (target.commentsDisabled || through?.commentsDisabled) return { refusal: 'COMMENTS_DISABLED' };
  if (!through) return { home: commentHomeOf(target) };
  if (await blockedWithAny(prisma, request.commenterId, [target.authorId, through.authorId])) return { refusal: 'NOT_FOUND' };
  const parentPostId = request.parentId ? await postOfComment(prisma, request.parentId) : null;
  return { home: commentHomeOf(target, parentPostId) };
}
