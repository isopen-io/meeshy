/**
 * LES COMMENTAIRES D'UN AUTEUR SÉPARÉ DU LECTEUR NE SE SERVENT PAS (#20205).
 *
 * #16894 a retiré de l'APERÇU embarqué dans un post les commentaires d'un
 * auteur qu'un blocage sépare du lecteur ; la liste complète
 * (`GET /posts/:id/comments`) et les réponses d'un commentaire les servaient
 * encore, à un geste de distance. La séparation se lit par la même loi que les
 * fils (`blockedIdsAroundViewer`, les deux sens confondus) et se pose DANS la
 * requête : filtrée après lecture, une page reviendrait courte avec un
 * `hasMore` faux.
 *
 * Échec fermé : une lecture des blocages qui lève fait échouer la liste — on ne
 * sert pas un fil sans savoir ce qu'il doit taire.
 *
 * Les compteurs (`Post.commentCount`, `PostComment.replyCount`) restent BRUTS :
 * ils ne nomment personne, et un compte par lecteur coûterait une requête par
 * commentaire de la page. Un lecteur peut donc lire « 3 réponses » et en voir
 * deux — décision écrite, pas un oubli.
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { blockedIdsAroundViewer } from '../ContactDirectoryService';
import { isBlockedWithAny } from '../../utils/blocking';

export async function separatedCommentAuthors(
  prisma: PrismaClient,
  viewerId: string | undefined,
): Promise<string[]> {
  return viewerId ? blockedIdsAroundViewer(prisma, viewerId) : [];
}

/** Rien à écarter ⇒ aucune clause : un `notIn: []` coûterait un niveau de plan pour rien. */
export function withoutSeparatedAuthors(separated: readonly string[]) {
  return separated.length > 0 ? [{ authorId: { notIn: [...separated] } }] : [];
}

/**
 * Une ACTION sur un commentaire (le traduire, y réagir) se refuse à qui un
 * blocage sépare de son auteur, dans un sens ou dans l'autre (#20216) : la
 * liste le tait, un identifiant gardé d'avant le blocage ne le rouvre pas. Le
 * refus prend la forme d'un commentaire absent. Fermé : une lecture qui ne
 * conclut pas répond « séparé ».
 *
 * Retirer SA réaction reste permis : le geste ne sert rien du commentaire et
 * défait ce que le lecteur avait posé avant le blocage.
 */
export function commentAuthorSeparatedFrom(
  prisma: Pick<PrismaClient, 'user'>,
  thread: { readonly authorId?: string | null },
  viewerId: string,
): Promise<boolean> {
  return isBlockedWithAny(prisma, viewerId, [thread.authorId]);
}
