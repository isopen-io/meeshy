/**
 * Couper le lien d'un repost vers une source qu'on s'apprête à DÉTRUIRE — sans
 * détruire le repost avec elle.
 *
 * Le balayage du contenu éphémère supprimait, avec la source, TOUT post la
 * repostant : `where: { repostOfId: { in: ids } }`, sans filtre de type. Le
 * commentaire qui le justifiait — « a repost of a story dead for 7+ days has no
 * value (stories are ephemeral) » — datait de l'époque où un repost ne faisait
 * que RÉFÉRENCER sa source : privé d'elle, il rendait une page vide, et le
 * détruire était le geste juste.
 *
 * Ce n'est plus vrai depuis l'instantané. `PostService.repostPost` DUPLIQUE le
 * contenu de toute source éphémère dans le repost — médias (fichiers neufs),
 * audio, `storyEffects`, `moodEmoji`, texte — précisément « so a repost that
 * merely referenced it via `repostOfId` would render EMPTY once the source is
 * gone ». Le repost est autoporteur ; il ne dépend plus de sa source pour
 * s'afficher.
 *
 * Les deux fonctionnalités se contredisaient, et la destructrice gagnait.
 * L'API expose `targetType` (`POST | REEL | STORY | STATUS`,
 * `routes/posts/types.ts`), donc le chemin « reposter un STATUS en POST
 * PERMANENT » — nommé noir sur blanc dans le commentaire de l'instantané
 * (« status→post ») — est le geste « je garde ça sur mon fil ». Quatorze jours
 * plus tard (1 h d'échéance + 7 j de masquage + 7 j de grâce), le balayage
 * détruisait ce post permanent, ses commentaires, ses notifications, ses liens
 * de partage — et, depuis le cycle 96, ses OCTETS. Irréversible, et jamais
 * demandé par personne.
 *
 * Le geste juste n'est donc pas de détruire le repost : c'est de le
 * DÉTACHER — il devient son propre post, ce que son instantané le rend déjà.
 *
 * ## Pourquoi couper, et pas simplement « ne rien faire »
 *
 * Laisser les pointeurs en place les laisserait viser une ligne détruite, et
 * `Post.repostOfId` / `Post.originalRepostOfId` sont exactement le motif que
 * cette famille de correctifs poursuit depuis trois cycles (`TrackingLink.
 * targetId`, `Notification.context.postId`) : une référence dénormalisée que
 * plus aucun chemin ne sait rattraper une fois la cible partie. Deux
 * conséquences concrètes :
 *
 * - `repostOf` est une relation `onDelete: NoAction` — la MÊME construction que
 *   la self-relation `CommentReplies` dont l'émulation MongoDB de Prisma refuse
 *   la suppression (P2014, régression de production 2026-06-01, corrigée trois
 *   lignes plus haut dans le balayage en annulant `parentId` d'abord). Couper
 *   les pointeurs AVANT de supprimer applique au jumeau le remède déjà écrit
 *   pour l'autre, et rend la passe insensible à la PROFONDEUR des chaînes de
 *   reposts, que sa cascade d'un seul niveau ignorait.
 * - le routage des réactions vise la RACINE (`originalRepostOfId ?? repostOfId`,
 *   `PostService.reactionRootId`, `PostFeedService`) : un pointeur pendant y
 *   enverrait les réactions d'un post vivant vers un id qui n'existe plus.
 *   Coupé, `isSimpleRepost` devient faux et le post reçoit ses réactions.
 *
 * ## Deux pointeurs, deux questions — jamais une seule
 *
 * `repostOfId` désigne la source IMMÉDIATE, `originalRepostOfId` la RACINE de
 * la chaîne. Un repost de repost porte les deux, vers deux posts différents :
 * quand seule la racine est détruite, la racine tombe et la source immédiate,
 * vivante, doit rester. Les fondre en un seul `updateMany` couperait un lien
 * parfaitement valide.
 *
 * ## Régime d'échec : REJETTE
 *
 * Même contrat que ses voisins de bloc (`retractPostNotifications`,
 * `deactivatePostTrackingLinks`, `releasePosts`, `reclaimMediaRowBytes`) : sans
 * relation ni cascade, détruire les posts après une coupure en échec laisserait
 * des pointeurs que plus aucun chemin n'atteindrait — la passe suivante ne
 * voyant plus les cibles. Le `catch` de la passe rattrape, la passe horaire
 * suivante rejoue tout.
 */

/**
 * La seule surface Prisma que la coupure touche, énumérée pour qu'un appelant
 * sache exactement ce qu'il autorise — même contrat que
 * `PostTrackingLinkPrisma`, son voisin dans la liste d'effets.
 */
export interface RepostDetachPrisma {
  post: {
    updateMany(args: {
      where: { repostOfId: { in: string[] } } | { originalRepostOfId: { in: string[] } };
      data: { repostOfId: null } | { originalRepostOfId: null };
    }): Promise<{ count: number }>;
  };
}

/** Ce que la coupure a réellement touché, par pointeur. */
export type RepostDetachResult = {
  /** Reposts dont la source IMMÉDIATE était dans la fournée. */
  direct: number;
  /** Reposts dont la RACINE de chaîne était dans la fournée. */
  roots: number;
};

/**
 * Les deux comptes sont rendus SÉPARÉMENT et jamais additionnés : un même post
 * peut porter les deux pointeurs vers la fournée, et une somme le compterait
 * deux fois.
 */
export async function detachReposts(
  prisma: RepostDetachPrisma,
  doomedPostIds: readonly string[],
): Promise<RepostDetachResult> {
  // Une liste vide n'est pas un `$in: []` à envoyer à Mongo : c'est une
  // question qui n'a pas lieu d'être posée. Le balayage horaire tombe sur ce
  // cas à chaque passe où rien n'a expiré, c'est-à-dire la plupart du temps.
  if (doomedPostIds.length === 0) return { direct: 0, roots: 0 };

  const ids = [...doomedPostIds];

  const direct = await prisma.post.updateMany({
    where: { repostOfId: { in: ids } },
    data: { repostOfId: null },
  });

  const roots = await prisma.post.updateMany({
    where: { originalRepostOfId: { in: ids } },
    data: { originalRepostOfId: null },
  });

  return { direct: direct.count, roots: roots.count };
}
