import { messageActionsOf, webEdits, type ActionMessage, type ActionScope } from './message-action-scope';

/**
 * « MODIFIER » EST OFFERT SI LE SERVEUR L'ACCEPTERAIT (#10581, #11210) — le
 * verdict `edit` de `messageActionsFor` (`@meeshy/shared`), qui reprend
 * `admitMessageEdit` : l'auteur pendant 24 heures, un rôle de plateforme
 * MODERATOR, ADMIN ou BIGBOSS au-delà sur son propre message, et sur le message
 * d'un autre (`asModerator`) à visage découvert : la passerelle enregistre qui a
 * modifié, et tous lisent « modifié par un modérateur » (#11375). Refusé à
 * un invité (la passerelle reconnaît l'auteur par son `User.id`), sur un
 * message système, supprimé, échu, à vue unique ou encore optimiste, dans une
 * conversation close, et en bout en bout : le texte partirait en clair
 * (fail-closed, #9224).
 *
 * Aucune règle n'est réécrite ici : ce fichier ne fait que lire le verdict.
 */
export function editOffered(message: ActionMessage, scope: ActionScope, input: { readonly now: number }): boolean {
  return webEdits(messageActionsOf(message, scope, input));
}
