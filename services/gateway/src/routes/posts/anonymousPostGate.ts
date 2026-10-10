import type { Prisma } from '@meeshy/shared/prisma/client';
import { isValidObjectId } from '@meeshy/shared/utils/object-id';
import { NOT_DELETED } from '../../services/posts/postIncludes';

/**
 * **CE QU'UN VISITEUR SANS COMPTE A LE DROIT DE LIRE** (#9149).
 *
 * Un lien partagé (`/reel/<id>`, `/post/<id>`, `/story/<id>`) s'ouvre chez
 * quelqu'un qui n'a pas encore de compte : la page lui montre le contenu, et
 * l'invite à se connecter PAR-DESSUS. `GET /posts/:postId` sert donc un
 * lecteur anonyme — mais seulement ce qui est publiable à tout le monde :
 *
 * - visibilité `PUBLIC`, et elle seule (le filtre de `getPostById` le pose
 *   aussi : deux verrous, la garde ne se relâche pas si l'un change) ;
 * - ni supprimée, ni EXPIRÉE — `getPostById` ne lit pas `expiresAt`, et une
 *   story morte resterait lisible par lien sans ce verrou ;
 * - d'un auteur ACTIF (ni désactivé, ni supprimé) ;
 * - et, pour une republication, d'un ORIGINAL lui-même public et vivant : la
 *   charge porte `repostOf` en entier (texte, médias), et une republication
 *   publique d'une publication réservée aux amis la ferait sortir à côté.
 *
 * Fail-closed : une ligne absente, un auteur introuvable, un original
 * disparu, un identifiant malformé — tout rend `false`, et la route répond le
 * même 404 qu'à une publication inexistante (aucun oracle d'existence).
 */

export const ANONYMOUS_POST_ACL_SELECT = {
  visibility: true,
  deletedAt: true,
  expiresAt: true,
  repostOfId: true,
  author: { select: { isActive: true, deletedAt: true, deactivatedAt: true } },
  repostOf: { select: { visibility: true, deletedAt: true, expiresAt: true } },
} satisfies Prisma.PostSelect;

type Lifetime = { readonly deletedAt: Date | null; readonly expiresAt: Date | null };

export type AnonymousPostAclRow = Lifetime & {
  readonly visibility: string;
  readonly repostOfId: string | null;
  readonly author: {
    readonly isActive: boolean;
    readonly deletedAt: Date | null;
    readonly deactivatedAt: Date | null;
  } | null;
  readonly repostOf: (Lifetime & { readonly visibility: string }) | null;
};

const isPublicAndAlive = (post: Lifetime & { readonly visibility: string }, now: Date): boolean =>
  post.visibility === 'PUBLIC' && post.deletedAt === null && (post.expiresAt === null || post.expiresAt.getTime() > now.getTime());

export function isServableToAnonymous(row: AnonymousPostAclRow, now: Date): boolean {
  if (!isPublicAndAlive(row, now)) return false;
  const author = row.author;
  if (author === null || !author.isActive || author.deletedAt !== null || author.deactivatedAt !== null) return false;
  if (row.repostOfId === null) return true;
  return row.repostOf !== null && isPublicAndAlive(row.repostOf, now);
}

export type AnonymousPostGatePrisma = {
  readonly post: { readonly findFirst: (args: { where: Prisma.PostWhereInput; select: typeof ANONYMOUS_POST_ACL_SELECT }) => Promise<AnonymousPostAclRow | null> };
};

export async function mayServePostToAnonymous(
  prisma: AnonymousPostGatePrisma,
  postId: string,
  now: Date = new Date(),
): Promise<boolean> {
  if (!isValidObjectId(postId)) return false;
  const row = await prisma.post.findFirst({
    where: { id: postId, deletedAt: NOT_DELETED },
    select: ANONYMOUS_POST_ACL_SELECT,
  });
  return row !== null && isServableToAnonymous(row, now);
}
