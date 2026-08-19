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

/**
 * Le cœur PUR de la décision — une fois qu'on sait qu'une référence existe.
 *
 * Extrait pour être appelé par LES DEUX lectures : `resolveReferenceAccess`
 * (unitaire, un `findUnique`) et `PostFeedService.getStories` (le tray,
 * résolu en mémoire depuis un `findMany` groupé — un `findUnique` par story y
 * serait N+1). Sans cette extraction, les deux auraient porté chacune sa
 * propre copie de la même règle, et l'une aurait fini par diverger de
 * l'autre — c'est exactement le risque que cette unité existe pour fermer.
 *
 * Ne décide PAS `none` : l'absence de référence se constate différemment
 * selon la lecture (une ligne `null`, une clé absente d'une `Map`), donc
 * chaque appelant la tranche lui-même avant d'appeler cette fonction.
 */
export function verdictFor(
  expiresAt: Date | null,
  expiredViewAt: Date | null | undefined,
  now: Date,
): Exclude<ReferenceAccessVerdict, 'none'> {
  // Contenu vivant : la référence n'a rien à dépenser. Une fenêtre close par
  // une expiration PASSÉE ne doit pas fermer un contenu republié depuis.
  const expired = expiresAt !== null && expiresAt.getTime() <= now.getTime();
  if (!expired) return 'granted';

  if (!expiredViewAt) return 'granted';

  return now.getTime() - expiredViewAt.getTime() < REFERENCE_VIEW_WINDOW_MS ? 'granted' : 'consumed';
}

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

    return verdictFor(post.expiresAt, reference.expiredViewAt, now);
  } catch {
    // Une lecture en échec ne doit pas OUVRIR un contenu : `none` laisse la
    // règle d'audience ordinaire trancher, ce qui est la réponse sûre.
    return 'none';
  }
}

/**
 * Ouvre la fenêtre de consultation d'un contenu EXPIRÉ — l'acte explicite, posé
 * par `POST /posts/:postId/view` quand le contenu est réellement affiché.
 *
 * `updateMany` avec un filtre sur l'absence, jamais `update` : l'appel doit
 * être IDEMPOTENT. Un client rejoue sa vue à chaque reprise d'affichage, et
 * réécrire l'horodatage ferait glisser la fenêtre indéfiniment — le droit ne
 * s'éteindrait jamais, ce qui est exactement ce que la fenêtre existe pour
 * empêcher.
 *
 * Piège Prisma-Mongo : `{ expiredViewAt: null }` ne matche pas un document où
 * la clé est ABSENTE, c'est-à-dire toutes les références jamais consommées.
 * Les deux branches sont nécessaires.
 *
 * Best-effort — ne lève jamais : une vue perdue ne doit pas transformer un
 * affichage réussi en erreur.
 */
export async function consumeReferenceView(params: {
  prisma: ReferenceAccessPrisma;
  post: ReferenceAccessPost;
  viewerId: string;
  now: Date;
}): Promise<void> {
  const { prisma, post, viewerId, now } = params;

  const expired = post.expiresAt !== null && post.expiresAt.getTime() <= now.getTime();
  if (!expired) return;

  try {
    await prisma.postMention.updateMany({
      where: {
        postId: post.id,
        mentionedUserId: viewerId,
        OR: [{ expiredViewAt: { isSet: false } }, { expiredViewAt: null }],
      },
      data: { expiredViewAt: now },
    });
  } catch {
    // Silencieux à dessein : l'appelant a déjà rendu le contenu.
  }
}

/**
 * Pose le verdict sur la charge utile d'un contenu.
 *
 * Il voyage AVEC le contenu parce que le client ne peut pas le déduire : il ne
 * voit que `expiresAt`, et la référence lui est invisible. Sans ce champ, un
 * viewer refuserait d'afficher un contenu que le serveur autorise — il calcule
 * l'expiration en local (`StoryItem.isExpired`), et c'est tout ce qu'il sait.
 *
 * Le client garde `isExpired()` pour ce qu'il sait faire — masquer du tray,
 * griser un aperçu — mais l'OUVERTURE obéit à ce champ.
 */
export async function attachReferenceAccess<T extends ReferenceAccessPost>(params: {
  prisma: ReferenceAccessPrisma;
  post: T;
  viewerId: string | undefined;
  now: Date;
}): Promise<T & { referenceAccess: ReferenceAccessVerdict }> {
  const referenceAccess = await resolveReferenceAccess({
    prisma: params.prisma,
    post: params.post,
    viewerId: params.viewerId,
    now: params.now,
  });
  return { ...params.post, referenceAccess };
}
