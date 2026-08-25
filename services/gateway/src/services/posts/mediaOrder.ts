import type { PrismaClient } from '@meeshy/shared/prisma/client';

/**
 * Le RANG des médias d'une publication, gravé au moment de la réclamation.
 *
 * ─── POURQUOI CE SITE, ET PAS LE HANDLER D'UPLOAD ─────────────────────────
 * `PostMedia.order` est `@default(0)` au schéma et AUCUN chemin de
 * téléversement ne l'écrit — le `postMedia.create` du handler TUS énumère
 * quinze champs sans lui, et il ne pourrait pas faire mieux : un upload ne
 * sait rien de la place que son fichier occupera dans une publication qui
 * n'existe pas encore. Les uploads volent d'ailleurs par trois en parallèle
 * (`MAX_CONCURRENT_UPLOADS`), donc leur ordre d'achèvement n'est même pas
 * celui de leur départ.
 *
 * La liste `mediaIds` de la requête est le SEUL endroit qui porte l'ordre
 * voulu par l'utilisateur — c'est l'ordre de sa sélection. D'où cette
 * écriture ici, juste après la réclamation, aux deux sites qui réclament
 * (`createPost`, `updatePost`).
 *
 * ─── CE QUE LE DÉFAUT PRODUISAIT ──────────────────────────────────────────
 * Tous les médias à `0`, et une lecture qui trie par `order: 'asc'`
 * (`postIncludes.ts`). Un tri Mongo sur valeurs égales n'est pas stable :
 * l'ordre rendu était l'ordre naturel de la collection, c'est-à-dire l'ordre
 * d'ACHÈVEMENT des uploads. L'aperçu optimiste du composer, lui, est bâti
 * dans l'ordre de sélection — la carte publiée était donc juste, puis se
 * réordonnait au premier refetch.
 *
 * ─── LA GARDE ─────────────────────────────────────────────────────────────
 * `postId` dans le `where`, exactement comme `applyMediaAlt` : un id que la
 * réclamation vient de REFUSER (autre uploadeur, média déjà pris) n'est pas
 * rattaché à ce post, donc `updateMany` ne le touche pas. Aucun second
 * contrôle de propriété à dupliquer.
 */
export async function applyMediaOrder(
  client: Pick<PrismaClient, 'postMedia'>,
  postId: string,
  mediaIds: readonly string[],
): Promise<void> {
  // Un id répété ne doit consommer qu'un rang, sans quoi les suivants sautent
  // une place. `Set` préserve l'ordre de première apparition.
  const ranked = [...new Set(mediaIds)];
  if (ranked.length === 0) return;

  await Promise.all(
    ranked.map((id, order) =>
      client.postMedia.updateMany({ where: { id, postId }, data: { order } }),
    ),
  );
}
