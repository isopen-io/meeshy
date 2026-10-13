/**
 * La FATIGUE D'IMPRESSION du fil : combien de fois chaque candidat est déjà
 * remonté chez ce lecteur — le fil dégrade ce qui a déjà été montré pour se
 * renouveler.
 *
 * C'est un CLASSEMENT PERSONNALISÉ nourri par `PostImpression`, une donnée de
 * MESURE : il n'a lieu que si le compte a consenti à l'analyse
 * (`User.analyticsConsentAt`), revue de conformité O5 (#10499) — la mesure
 * exemptée ne nourrit aucune personnalisation. Sans consentement, aucune
 * pénalité : le fil reste classé par ses autres signaux.
 *
 * Non caché (dépend du jeu de candidats courant et bouge vite). Dégradation
 * gracieuse : erreur ⇒ carte vide.
 */
type SeenCountsPrisma = {
  readonly user: {
    readonly findUnique: (args: { where: { id: string }; select: { analyticsConsentAt: true; dataProcessingConsentAt: true } }) =>
      Promise<{ analyticsConsentAt: Date | null; dataProcessingConsentAt: Date | null } | null>;
  };
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
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { analyticsConsentAt: true, dataProcessingConsentAt: true },
    });
    if (!user?.analyticsConsentAt || !user.dataProcessingConsentAt) return new Map();
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
