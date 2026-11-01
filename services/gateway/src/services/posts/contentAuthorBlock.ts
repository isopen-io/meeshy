/**
 * On ne republie, ne cite ni ne partage le contenu de quelqu'un avec qui un
 * blocage existe, dans un sens ou dans l'autre (#14242) — la règle que la
 * réaction (`PostReactionService`) et le commentaire (`commentHome`) appliquent
 * déjà. Les auteurs mesurés : celui de la publication et, si elle republie,
 * ceux de sa source et de sa racine (une republication porte le contenu d'un
 * autre). Le refus se sert comme un contenu introuvable (`POST_NOT_FOUND`) : il
 * ne révèle pas le blocage, et un ancien client l'affiche déjà.
 *
 * FERMÉ sur l’échec : une lecture qui ne conclut pas, ou une publication
 * introuvable, répond « bloqué ».
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { isValidObjectId } from '@meeshy/shared/utils/object-id';
import { isBlockedWithAny } from '../../utils/blocking';

export type ContentAuthorBlockPrisma = Pick<PrismaClient, 'post' | 'user'>;

export async function isBlockedWithContentAuthors(
  prisma: ContentAuthorBlockPrisma,
  params: { readonly actorId: string; readonly postId: string }
): Promise<boolean> {
  try {
    const post = await prisma.post.findFirst({
      where: { id: params.postId },
      select: { authorId: true, repostOfId: true, originalRepostOfId: true },
    });
    if (post === null) return true;
    const carried = [...new Set([post.repostOfId, post.originalRepostOfId])].filter(
      (id): id is string => typeof id === 'string' && isValidObjectId(id)
    );
    const sources = carried.length === 0
      ? []
      : await prisma.post.findMany({ where: { id: { in: carried } }, select: { authorId: true } });
    return isBlockedWithAny(prisma, params.actorId, [post.authorId, ...sources.map((source) => source.authorId)]);
  } catch {
    return true;
  }
}
