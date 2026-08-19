/**
 * Le droit qu'une référence ouvre sur un contenu — la SEULE unité qui en
 * décide.
 *
 * Elle existe pour la raison qui a fait naître `messageMentions.ts` : quand une
 * règle vit dans les appelants, il suffit d'un nouvel appelant pour la perdre.
 * Les ouvertures détaillées sont nombreuses — `GET /posts/:postId`, ouverture
 * de story, de statut, de réel — et aucune ne doit la réimplémenter.
 *
 * La règle :
 *
 *   contenu vivant   → accès sans limite, comme un membre de l'audience
 *   contenu expiré   → une fenêtre de 24 h, ouverte par la première vue
 *   contenu supprimé → hors de portée d'ici (le filtre `deletedAt` a déjà
 *                      écarté le post avant qu'on arrive)
 *
 * Une FENÊTRE et non un instant : un droit qui s'éteint au premier affichage
 * punit ce que l'utilisateur ne contrôle pas — coupure réseau, changement
 * d'appareil, app tuée pendant la lecture. « Au moins une fois » serait
 * respecté à la lettre et trahi en pratique.
 *
 * Cette unité ne CONSOMME rien : elle lit. La consommation est un acte
 * explicite, posé par `POST /posts/:postId/view` (`consumeReferenceView`), et
 * jamais un effet de bord d'une lecture — la NSE préfetche le post à la
 * réception de la notification, et la revalidation cache-first relit derrière.
 */

import type { PrismaClient } from '@meeshy/shared/prisma/client';

export type ReferenceAccessPrisma = Pick<PrismaClient, 'postMention'>;

/** Ce qu'une décision d'accès a besoin de savoir du post. */
export type ReferenceAccessPost = {
  readonly id: string;
  readonly type: string;
  readonly expiresAt: Date | null;
};

/**
 * `none`     — pas de référence pour ce lecteur ; l'expiration s'applique normalement
 * `granted`  — droit intact, ou fenêtre encore ouverte : afficher malgré l'expiration
 * `consumed` — droit éteint : écran « ce contenu n'est plus disponible »
 */
export type ReferenceAccessVerdict = 'none' | 'granted' | 'consumed';

/** Durée pendant laquelle un contenu expiré reste ouvrable après la première vue. */
export const REFERENCE_VIEW_WINDOW_MS = 24 * 3600_000;

export async function resolveReferenceAccess(params: {
  prisma: ReferenceAccessPrisma;
  post: ReferenceAccessPost;
  viewerId: string | undefined;
  now: Date;
}): Promise<ReferenceAccessVerdict> {
  const { prisma, post, viewerId, now } = params;
  if (!viewerId) return 'none';

  try {
    const reference = await prisma.postMention.findUnique({
      where: { post_user_mention_unique: { postId: post.id, mentionedUserId: viewerId } },
      select: { expiredViewAt: true },
    });
    if (!reference) return 'none';

    // Contenu vivant : la référence n'a rien à dépenser. Une fenêtre close par
    // une expiration PASSÉE ne doit pas fermer un contenu republié depuis.
    const expired = post.expiresAt !== null && post.expiresAt.getTime() <= now.getTime();
    if (!expired) return 'granted';

    const openedAt = reference.expiredViewAt;
    if (!openedAt) return 'granted';

    return now.getTime() - openedAt.getTime() < REFERENCE_VIEW_WINDOW_MS ? 'granted' : 'consumed';
  } catch {
    // Une lecture en échec ne doit pas OUVRIR un contenu : `none` laisse la
    // règle d'audience ordinaire trancher, ce qui est la réponse sûre.
    return 'none';
  }
}
