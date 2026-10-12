import type { PostVisibility } from '@meeshy/shared/prisma/client';
import { isValidObjectId } from '@meeshy/shared/utils/object-id';
import { NOT_DELETED } from '../posts/softDelete';

/**
 * **LA LOI DES TROIS GESTES DE MODÉRATION D'UNE PUBLICATION** (#10315).
 *
 * Le porteur a dû passer par la base de production pour retirer d'urgence les
 * publications d'une utilisatrice. Ces trois gestes sont l'outil qui manquait,
 * et ils sont RÉVERSIBLES par construction — à l'inverse du retrait définitif
 * (`DELETE /admin/posts/:postId`, `deletedAt`), qui coupe liens, sons et points.
 *
 * - « Mettre en privé » : l'audience est réduite à l'auteur. L'auteur peut la
 *   rouvrir lui-même — c'est une mise à l'écart douce.
 * - « Mettre hors ligne » : même effet de lecture, daté par `moderationHiddenAt`,
 *   et l'auteur ne peut plus rouvrir l'audience tant que le retrait tient.
 * - « Remettre en ligne » : lève le retrait et rend l'audience que l'auteur avait
 *   choisie (`moderationPriorVisibility`).
 *
 * **Retirer passe par `visibility = PRIVATE`, à dessein.** Toutes les portes de
 * lecture du dépôt (fil, profil, détail, lien public `/post/<id>`, commentaires,
 * réactions, vues) jugent déjà la visibilité : PRIVATE n'est servi qu'à l'auteur,
 * et l'administration lit par ses propres routes. Ajouter un second prédicat à
 * chacune de ces portes (plus de cent sites lisent `NOT_DELETED`) aurait ouvert
 * cent occasions d'en oublier un ; la visibilité, elle, est déjà tenue partout.
 */

export const POST_MODERATION_ACTIONS = ['make-private', 'take-offline', 'restore'] as const;
export type PostModerationAction = (typeof POST_MODERATION_ACTIONS)[number];

/** Une action en lot ne porte jamais plus de publications que ce plafond. */
export const POST_MODERATION_BATCH_MAX = 50;

export type PostModerationState = {
  readonly visibility: PostVisibility;
  readonly moderationHiddenAt: Date | null;
  readonly moderationPriorVisibility: PostVisibility | null;
};

const PRIVATE: PostVisibility = 'PRIVATE';

function makePrivate(current: PostModerationState): PostModerationState | null {
  if (current.visibility === PRIVATE) return null;
  return { visibility: PRIVATE, moderationHiddenAt: current.moderationHiddenAt, moderationPriorVisibility: current.visibility };
}

function takeOffline(current: PostModerationState, now: Date): PostModerationState | null {
  if (current.moderationHiddenAt !== null) return null;
  const prior = current.visibility === PRIVATE ? current.moderationPriorVisibility : current.visibility;
  return { visibility: PRIVATE, moderationHiddenAt: now, moderationPriorVisibility: prior };
}

function restore(current: PostModerationState): PostModerationState | null {
  if (current.moderationHiddenAt === null && current.moderationPriorVisibility === null) return null;
  const rendue = current.visibility === PRIVATE && current.moderationPriorVisibility !== null ? current.moderationPriorVisibility : current.visibility;
  return { visibility: rendue, moderationHiddenAt: null, moderationPriorVisibility: null };
}

/** L'état d'après le geste, ou `null` quand le geste ne change rien (déjà fait). */
export function nextModerationState(action: PostModerationAction, current: PostModerationState, now: Date): PostModerationState | null {
  switch (action) {
    case 'make-private':
      return makePrivate(current);
    case 'take-offline':
      return takeOffline(current, now);
    case 'restore':
      return restore(current);
  }
}

/** Le geste retire-t-il la publication à une audience qui la lisait ? Alors les clients doivent l'oublier. */
export function withdrawsAudience(before: PostModerationState, after: PostModerationState): boolean {
  return before.visibility !== PRIVATE && after.visibility === PRIVATE;
}

export type PublicationState = 'deleted' | 'offline' | 'expired' | 'private' | 'online';

/** L'état LU d'une publication, tel que la fiche d'un membre l'affiche — une seule définition. */
export function publicationStateOf(
  row: {
    readonly visibility: PostVisibility;
    readonly deletedAt: Date | null;
    readonly expiresAt: Date | null;
    readonly moderationHiddenAt: Date | null;
  },
  now: Date,
): PublicationState {
  if (row.deletedAt !== null) return 'deleted';
  if (row.moderationHiddenAt !== null) return 'offline';
  if (row.expiresAt !== null && row.expiresAt.getTime() <= now.getTime()) return 'expired';
  if (row.visibility === PRIVATE) return 'private';
  return 'online';
}

export type ModerationHoldPrisma = {
  readonly post: {
    readonly findFirst: (args: {
      where: { id: string; deletedAt: typeof NOT_DELETED };
      select: { authorId: true; moderationHiddenAt: true };
    }) => Promise<{ authorId: string; moderationHiddenAt: Date | null } | null>;
  };
};

/**
 * L'AUTEUR demande-t-il de rouvrir l'audience d'une publication que la
 * modération a mise hors ligne ? Alors `PUT /posts/:postId` refuse : sans cette
 * garde, « Mettre hors ligne » ne tiendrait que jusqu'à la prochaine édition.
 *
 * Elle ne répond OUI qu'à l'auteur : à tout autre, le refus ordinaire (« pas
 * l'auteur ») tombe plus loin, et l'état de modération ne fuit pas par la
 * différence entre deux 403. Rester ou passer en PRIVATE n'est jamais retenu.
 */
export async function heldAgainstAuthor(
  prisma: ModerationHoldPrisma,
  params: { readonly postId: string; readonly userId: string; readonly requestedVisibility: PostVisibility | undefined },
): Promise<boolean> {
  if (params.requestedVisibility === undefined || params.requestedVisibility === PRIVATE) return false;
  if (!isValidObjectId(params.postId)) return false;
  const row = await prisma.post.findFirst({
    where: { id: params.postId, deletedAt: NOT_DELETED },
    select: { authorId: true, moderationHiddenAt: true },
  });
  return row !== null && row.authorId === params.userId && row.moderationHiddenAt !== null;
}
