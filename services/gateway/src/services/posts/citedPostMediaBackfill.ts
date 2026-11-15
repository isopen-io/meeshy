/**
 * #6578 — LE MÉDIA CITÉ PAR UN COMMENTAIRE, RELU À CHAQUE SERVICE.
 *
 * Le commentaire ne grave que l'ancre et la nature (`metadata.quotedPostMedia`,
 * voir `quotedPostMediaSnapshot.ts`). Tout ce qui DÉCRIT le média — sa vignette,
 * son nom, son poids, sa durée, sa légende — se relit ici, à chaque service.
 * C'est ce qui fait qu'un média supprimé ou retiré de sa publication ne
 * ressuscite pas dans une citation : il n'est simplement pas rattrapé, et le
 * commentaire garde son ancre et sa nature (« une photo »).
 *
 * FAIL-CLOSED EN DEUX TEMPS, exactement comme `citedAttachmentBackfill.ts` : la
 * garde d'ÉCRITURE (`admitQuotedPostMedia`) refuse déjà un `postMediaId`
 * étranger au post commenté ; ici on REVÉRIFIE l'appartenance sur la ligne
 * relue, parce qu'une garde d'écriture ne dit rien des lignes écrites AVANT
 * elle — ni d'un média DÉPLACÉ depuis (`onDelete: SetNull` détache le média
 * quand son post disparaît, et le `postId` d'une ligne n'est pas immuable).
 *
 * La comparaison porte sur le `postId` du COMMENTAIRE, lu sur sa propre ligne
 * plutôt que reçu en paramètre : un appelant qui se tromperait de post
 * (l'aperçu embarqué d'un feed en sert plusieurs dans la même page) ouvrirait
 * la fuite que la garde d'écriture vient de fermer.
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { mediaSelect } from './postIncludes';
import { quotedPostMediaFromMetadata } from './quotedPostMediaSnapshot';

/**
 * Hisse l'instantané FIGÉ en top-level `quotedPostMedia` — même geste que
 * `trackingLinks` et `location`, qui vivent dans le même `metadata`. Pure et
 * synchrone : un commentaire qui cite un média l'annonce même quand le média
 * n'est plus rattrapable.
 */
export function hoistQuotedPostMedia<T extends Record<string, unknown>>(comment: T): T {
  const fige = quotedPostMediaFromMetadata(comment?.metadata);
  if (!fige) return comment;
  return { ...comment, quotedPostMedia: fige } as T;
}

/**
 * Sert la citation sur une liste de commentaires : l'ancre figée en top-level,
 * et le média RELU en `quotedMedia` quand il existe encore et appartient
 * toujours au post commenté.
 *
 * UNE requête pour toute la page, jamais une par commentaire — c'est la même
 * raison qui a fait naître le rattrapage côté conversation : un fil de
 * cinquante commentaires dont trois citent ne doit pas coûter cinquante
 * lectures.
 *
 * Rend une NOUVELLE liste : les lignes Prisma ne se mutent pas, et un service
 * qui muterait sa source ferait dépendre le résultat de l'ordre des appels.
 */
export async function serveCitedPostMedia<T extends Record<string, unknown>>(
  prisma: Pick<PrismaClient, 'postMedia'>,
  comments: readonly T[],
): Promise<T[]> {
  const hisses = comments.map((c) => hoistQuotedPostMedia(c));

  const attendus = new Set<string>();
  for (const c of hisses) {
    const fige = c['quotedPostMedia'] as { postMediaId?: string } | undefined;
    if (fige?.postMediaId) attendus.add(fige.postMediaId);
  }
  if (attendus.size === 0) return hisses;

  const lignes = await prisma.postMedia.findMany({
    where: { id: { in: [...attendus] } },
    select: { ...mediaSelect, postId: true },
  });
  const parId = new Map(lignes.map((m) => [m.id, m]));

  return hisses.map((c) => {
    const fige = c['quotedPostMedia'] as { postMediaId?: string } | undefined;
    if (!fige?.postMediaId) return c;
    const ligne = parId.get(fige.postMediaId);
    // Le média n'existe plus, ou il a quitté le post commenté : la citation
    // reste, sans rien de descriptif. C'est le comportement voulu — pas une
    // erreur à signaler.
    if (!ligne || ligne.postId !== c['postId']) return c;
    const { postId: _porteur, ...media } = ligne;
    return { ...c, quotedMedia: media } as T;
  });
}
