/**
 * QUI A VU — nommé dès la Communauté, compté en dessous (#14108, POS-07).
 *
 * La liste des vues d'un contenu ne NOMME que les personnes dont le niveau
 * effectif avec l'AUTEUR atteint `views.identity` (Communauté) ; les vues du
 * Public sont agrégées en un nombre (`publicViewCount`), comme les vues
 * anonymes (`anonymousViewCount`). La loi est jugée pour l'auteur, quel que soit
 * celui qui demande la page : un administrateur voit la liste telle que l'auteur
 * la verrait. Un blocage, dans un sens ou dans l'autre, retire le nom aussi.
 *
 * Les personnes au-delà de `NAMED_VIEWERS_SCAN_CAP` vues ne sont jugées ni
 * nommées : le nombre agrégé les compte.
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { pairAccessAmong, type PairAccessDb } from '../relations/pairAccess';

export const NAMED_VIEWERS_SCAN_CAP = 2_000;

export type NamedViewersDb = PairAccessDb & Pick<PrismaClient, 'postView'>;

type ViewsWhere = { readonly postId: string; readonly viewedAt?: { readonly gte: Date } };

export type NamedViewsScope = {
  readonly where: ViewsWhere & { readonly userId: { readonly in: string[] } };
  readonly publicViewCount: number;
};

export async function namedViewsScope(
  prisma: NamedViewersDb,
  post: { readonly authorId: string },
  where: ViewsWhere,
): Promise<NamedViewsScope> {
  const [rows, total] = await Promise.all([
    prisma.postView.findMany({ where, select: { userId: true }, orderBy: { viewedAt: 'desc' }, take: NAMED_VIEWERS_SCAN_CAP }),
    prisma.postView.count({ where }),
  ]);
  const ids = [...new Set(rows.map((row) => row.userId))];
  const verdicts = await pairAccessAmong(prisma, { feature: 'views.identity', subjectId: post.authorId, otherIds: ids, subjectIs: 'viewer' });
  const named = ids.filter((id) => verdicts.get(id)?.allowed === true);
  return { where: { ...where, userId: { in: named } }, publicViewCount: Math.max(0, total - named.length) };
}
