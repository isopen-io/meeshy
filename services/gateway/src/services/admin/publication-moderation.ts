import type { PostVisibility } from '@meeshy/shared/prisma/client';
import {
  adminPostStateOf,
  authorAudienceOf,
  heldAuthorAudience,
  type AdminPostState,
  type AdminPostStateFacts,
  type AdminSettableVisibility,
} from '@meeshy/shared/types/admin-publications';

export { widensAuthorAudience } from '@meeshy/shared/types/admin-publications';

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
 * - « Mettre hors ligne » : même effet de lecture, daté par `moderationHiddenAt`
 *   et signé par `moderationHiddenById` ; l'auteur ne peut plus rouvrir
 *   l'audience tant que le retrait tient (`services/posts/moderationHold.ts`).
 * - « Remettre en ligne » : lève le retrait et rend l'audience que l'auteur avait
 *   choisie (`moderationPriorVisibility`).
 *
 * Chaque geste retient l'audience de l'AUTEUR (`heldAuthorAudience`, #10471), jamais
 * celle qu'un geste précédent de l'administration servait.
 *
 * **Retirer passe par `visibility = PRIVATE`, à dessein.** Les portes de lecture
 * du dépôt (fil, profil, détail, lien public `/post/<id>`, commentaires,
 * réactions, vues) jugent déjà la visibilité : PRIVATE n'est servi qu'à l'auteur,
 * et l'administration lit par ses propres routes. Trois portes ne la jugeaient
 * pas et ont été fermées dans le même lot : la relecture de secours d'un
 * référencé (`PostService.getPostById`), l'original imbriqué d'une
 * republication (`postReferences.ts`), la citation d'une publication dans un
 * message (`servedPostReply.ts`) ; et l'on ne republie plus une source qu'on ne
 * peut pas lire (`moderationHold.ts`).
 */

export const POST_MODERATION_ACTIONS = ['make-private', 'take-offline', 'restore'] as const;
export type PostModerationAction = (typeof POST_MODERATION_ACTIONS)[number];

/** Une action en lot ne porte jamais plus de publications que ce plafond. */
export const POST_MODERATION_BATCH_MAX = 50;

export type PostModerationState = {
  readonly visibility: PostVisibility;
  readonly moderationHiddenAt: Date | null;
  readonly moderationHiddenById: string | null;
  readonly moderationPriorVisibility: PostVisibility | null;
};

const PRIVATE: PostVisibility = 'PRIVATE';

function makePrivate(current: PostModerationState): PostModerationState | null {
  if (current.visibility === PRIVATE) return null;
  return { ...current, visibility: PRIVATE, moderationPriorVisibility: heldAuthorAudience(current, PRIVATE) };
}

function takeOffline(current: PostModerationState, now: Date, actorId: string): PostModerationState | null {
  if (current.moderationHiddenAt !== null) return null;
  return { visibility: PRIVATE, moderationHiddenAt: now, moderationHiddenById: actorId, moderationPriorVisibility: heldAuthorAudience(current, PRIVATE) };
}

function restore(current: PostModerationState): PostModerationState | null {
  if (current.moderationHiddenAt === null && current.moderationPriorVisibility === null) return null;
  return { visibility: authorAudienceOf(current), moderationHiddenAt: null, moderationHiddenById: null, moderationPriorVisibility: null };
}

/** L'état d'après le geste, ou `null` quand le geste ne change rien (déjà fait). */
export function nextModerationState(
  action: PostModerationAction,
  current: PostModerationState,
  context: { readonly now: Date; readonly actorId: string },
): PostModerationState | null {
  switch (action) {
    case 'make-private':
      return makePrivate(current);
    case 'take-offline':
      return takeOffline(current, context.now, context.actorId);
    case 'restore':
      return restore(current);
  }
}

/**
 * **CHANGER L'AUDIENCE D'UN GESTE** (#10392) — resserrer une publication à ses
 * amis, ou la remettre en ligne avec une audience au plus égale à celle de
 * l'auteur (`widensAuthorAudience` refuse le reste). Le geste vaut décision de l'administration :
 * il lève un retrait en cours (la hiérarchie du signataire s'applique, comme à
 * la remise en ligne). Toute audience autre que celle de l'auteur la retient
 * (#10471) : revenir à SON audience passe, et « remettre en ligne » la rend.
 */
export function nextVisibilityState(current: PostModerationState, visibility: AdminSettableVisibility): PostModerationState | null {
  const after: PostModerationState = { visibility, moderationHiddenAt: null, moderationHiddenById: null, moderationPriorVisibility: heldAuthorAudience(current, visibility) };
  const same =
    after.visibility === current.visibility &&
    current.moderationHiddenAt === null &&
    after.moderationPriorVisibility === current.moderationPriorVisibility;
  return same ? null : after;
}

/**
 * Le geste LÈVE-t-il un retrait posé par quelqu'un d'autre ? Alors il exige un
 * rang au moins égal à celui de qui l'a posé — sans quoi un modérateur défait,
 * d'un geste, le retrait qu'un administrateur vient de décider. Un signataire
 * INCONNU (`null`) compte comme un autre : fail-closed.
 */
export function liftsSomeoneElsesHold(before: PostModerationState, after: PostModerationState, actorId: string): boolean {
  return before.moderationHiddenAt !== null && after.moderationHiddenAt === null && before.moderationHiddenById !== actorId;
}

/** Le geste retire-t-il la publication à une audience qui la lisait ? Alors les clients doivent l'oublier. */
export function withdrawsAudience(before: PostModerationState, after: PostModerationState): boolean {
  return before.visibility !== PRIVATE && after.visibility === PRIVATE;
}

/** L'état d'une publication pour la liste de la PLATEFORME (#10392) : le contrat partagé, une seule définition. */
export function adminStateOf(row: AdminPostStateFacts, now: Date): AdminPostState {
  return adminPostStateOf(row, now);
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
