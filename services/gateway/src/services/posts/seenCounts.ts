import { readAnalyticsStanding } from '../social/eventPrivacy';

/**
 * La FATIGUE D'IMPRESSION du fil : combien de fois chaque candidat est déjà
 * remonté chez ce lecteur — le fil dégrade ce qui a déjà été montré pour se
 * renouveler.
 *
 * C'est un CLASSEMENT PERSONNALISÉ nourri par `PostImpression` : il n'a lieu
 * que si la passerelle ACCORDE l'analyse (`readAnalyticsStanding` ⇒
 * `granted` : analyse et traitement posés, aucun retrait serveur, 15 ans ou
 * plus), revue de conformité O5 (#10499), #10780. Sans cela, aucune
 * pénalité : le fil reste classé par ses autres signaux.
 *
 * Non caché (dépend du jeu de candidats courant et bouge vite). Dégradation
 * gracieuse : erreur ⇒ carte vide.
 */
type SeenCountsPrisma = Parameters<typeof readAnalyticsStanding>[0] & {
  readonly postImpression: {
    readonly groupBy: (args: never) => Promise<unknown>;
  };
};

export async function readSeenCounts(
  prisma: SeenCountsPrisma,
  userId: string,
  postIds: readonly string[],
): Promise<Map<string, number>> {
  if (postIds.length === 0) return new Map();
  try {
    if (await readAnalyticsStanding(prisma, userId, undefined) !== 'granted') return new Map();
    const grouped = await prisma.postImpression.groupBy({
      by: ['postId'],
      where: { userId, postId: { in: [...postIds] } },
      _count: { postId: true },
    } as never) as Array<{ postId: string; _count?: { postId?: number } }>;
    return new Map(grouped.map((row) => [row.postId, row._count?.postId ?? 0]));
  } catch {
    return new Map();
  }
}
