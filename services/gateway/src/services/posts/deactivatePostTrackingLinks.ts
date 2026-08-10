/**
 * Couper les `/l/<token>` qui visent un post retiré — un effet, deux chemins.
 *
 * `applyPostRemovalEffects` portait ce geste en ligne, dans son corps, à
 * l'époque où le retrait interactif était le seul chemin qui rendait un post
 * inatteignable. Il ne l'est pas : le balayage du contenu éphémère
 * (`ExpiredStoriesCleanupService`) est l'autre, et le SEUL qui détruise
 * réellement la ligne `Post`. Il ne coupait rien.
 *
 * Ce que ça coûtait : `TrackingLink.targetId` n'a ni relation ni cascade vers
 * `Post` — le schéma le dit, le champ porte indifféremment un `postId`, un
 * `conversationId` ou un `userId`. Une fois la ligne `Post` détruite, plus
 * aucun chemin du gateway ne sait relier le lien à sa cible disparue : le lien
 * survivait `isActive: true`, pour toujours. La route `/l/:token` comptait donc
 * son clic, incrémentait `totalClicks`, puis redirigeait vers une page morte —
 * là où le même contenu retiré à la main répond 410 `LINK_INACTIVE`. Le même
 * objet avait deux fins de vie selon le chemin de retrait, et la plus fréquente
 * des deux — l'expiration, que TOUTE story finit par atteindre — était la
 * mauvaise.
 *
 * Le geste est une DÉSACTIVATION, jamais une suppression : les
 * `TrackingLinkClick` sont une histoire d'audience qui survit à sa cible, et le
 * tableau de bord du partageur les lit encore.
 *
 * Il REJETTE, il n'avale pas. Chaque appelant choisit son régime, et les deux
 * choix sont motivés :
 *  - le retrait interactif l'enveloppe dans un `try/catch` — quand il
 *    s'exécute, `deletedAt` est déjà committé, et rien ne doit transformer une
 *    suppression réussie en 500 ;
 *  - le balayage le laisse gouverner sa passe et renonce à détruire — mêmes
 *    raisons que ses deux voisins de bloc (`retractPostNotifications`,
 *    `releasePosts`) : sans relation ni cascade, détruire les posts après un
 *    échec laisserait des liens que plus aucun chemin n'atteindrait.
 */

/**
 * La seule surface Prisma que la désactivation touche, énumérée pour qu'un
 * appelant sache exactement ce qu'il autorise — même contrat que
 * `PostNotificationRetractionPrisma`, son voisin dans la liste d'effets.
 */
export interface PostTrackingLinkPrisma {
  trackingLink: {
    updateMany(args: {
      where: { targetId: { in: string[] } };
      data: { isActive: false };
    }): Promise<{ count: number }>;
  };
}

/**
 * Le filtre porte sur `targetId` SEUL, sans `targetType`, exactement comme le
 * faisait le retrait interactif : un lien créé avec un type mal renseigné mais
 * le bon `targetId` doit mourir avec sa cible. Les ids sont des ObjectId, donc
 * un id de post ne désigne pas une conversation par accident.
 */
export async function deactivatePostTrackingLinks(
  prisma: PostTrackingLinkPrisma,
  postIds: readonly string[],
): Promise<number> {
  // Une liste vide n'est pas un `$in: []` à envoyer à Mongo : c'est une
  // question qui n'a pas lieu d'être posée. Le balayage horaire tombe sur ce
  // cas à chaque passe où rien n'a expiré, c'est-à-dire la plupart du temps.
  if (postIds.length === 0) return 0;

  const result = await prisma.trackingLink.updateMany({
    where: { targetId: { in: [...postIds] } },
    data: { isActive: false },
  });

  return result.count;
}
