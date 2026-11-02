/**
 * Le LIEN entre l'auteur d'un post `ONLY` et chacune des personnes qu'il a
 * choisies (#14105) — ce qui décide si on la PRÉVIENT de la publication, et si
 * elle compte au plafond quotidien des choisis sans lien.
 *
 * Un lien, c'est l'un ou l'autre :
 *  - le niveau EFFECTIF de la paire atteint Connaissance, jugé par la loi
 *    (`resolveRelationAccess`, feature `audience.acquaintances`) sur le niveau lu
 *    au site unique (`niveauxParmi`) — jamais une comparaison réécrite ;
 *  - une conversation DIRECTE active en commun OÙ LA PERSONNE A ÉCRIT
 *    (`filterConversingContactIdsAmong`, la définition du fil plus un message du
 *    candidat) : une conversation directe s'ouvre sans le consentement de l'autre
 *    ni le prévenir, son existence seule n'est pas un lien. Un groupe ou une
 *    communauté partagés n'en sont pas un non plus : on y côtoie des inconnus.
 *
 * Le blocage n'est PAS lu ici : il appartient à l'appelant. Rend `null` quand
 * une lecture échoue — l'appelant ferme (ne prévient pas, compte comme sans lien).
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { resolveRelationAccess } from '@meeshy/shared/utils/relation-access';
import { niveauxParmi } from '../friendship';
import { filterConversingContactIdsAmong } from './directContactVisibility';

export type ChosenLinkDb = Pick<PrismaClient, 'friendRequest' | 'userRelation' | 'participant' | 'message'>;

export async function linkedAmong(
  prisma: ChosenLinkDb,
  authorId: string,
  candidates: readonly string[]
): Promise<Set<string> | null> {
  const ids = [...new Set(candidates)].filter((id) => id !== authorId);
  if (ids.length === 0) return new Set();
  try {
    const [levels, directs] = await Promise.all([
      niveauxParmi(prisma, authorId, ids),
      filterConversingContactIdsAmong(prisma, authorId, ids),
    ]);
    if (directs === null) return null;
    return new Set(
      ids.filter((id) => {
        if (directs.has(id)) return true;
        const level = levels.get(id) ?? 'PUBLIC';
        return resolveRelationAccess({
          viewerId: id,
          targetId: authorId,
          grantedByViewer: level,
          grantedByTarget: level,
          sharesCommunity: false,
          blockedEitherWay: false,
          viewerMinor: 'unknown',
          targetMinor: 'unknown',
          feature: 'audience.acquaintances',
        }).allowed;
      })
    );
  } catch {
    return null;
  }
}
