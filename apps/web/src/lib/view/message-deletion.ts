import type { MessageActionVerdicts } from '@meeshy/shared/utils/message-action-policy';

import { messageActionsOf, type ActionMessage, type ActionScope } from './message-action-scope';

/**
 * CE QUE LE DIALOGUE DE SUPPRESSION OFFRE (#10582, #11150, #11210) — une
 * PROJECTION des verdicts de `messageActionsFor` (`@meeshy/shared`), qui
 * reprend `admitMessageDelete` : aucune règle de rôle ni d'auteur n'est
 * réécrite ici.
 *
 * - « POUR TOUS » : l'auteur, SANS LIMITE DE TEMPS (le serveur n'impose aucune
 *   fenêtre) ; un avis système ou un message déjà supprimé, jamais.
 * - « RETIRER » : le message d'un AUTRE, par qui modère la conversation (rôle
 *   de conversation ou de plateforme, jamais en direct) ; un motif est exigé
 *   et l'auteur en est prévenu. Une sélection qui mêle les miens et ceux des
 *   autres se retire en entier : la passerelle ignore le motif sur les messages
 *   de l'auteur.
 * - « POUR MOI » : un compte, un participant ACTIF (#11415) et un message que
 *   le serveur connaît — un ancien membre ne se voit pas offrir un geste refusé.
 *
 * L'offre vaut pour TOUS les messages visés ou pour aucun : un seul message
 * d'un autre retire « pour tous » au lot entier, comme
 * `selectionAllowsDeleteForAll` sur iOS.
 */
export type DeleteOffer = { readonly forEveryone: boolean; readonly forMe: boolean; readonly remove: boolean };

const NOTHING: DeleteOffer = { forEveryone: false, forMe: false, remove: false };

const removable = (verdicts: MessageActionVerdicts): boolean => verdicts.deleteForEveryone || verdicts.remove !== null;

export function deleteOfferOf(messages: readonly ActionMessage[], scope: ActionScope, input: { readonly now: number } = { now: Date.now() }): DeleteOffer {
  if (messages.length === 0) return NOTHING;
  const verdicts = messages.map((message) => messageActionsOf(message, scope, input).verdicts);
  const forEveryone = verdicts.every((v) => v.deleteForEveryone);
  const forMe = verdicts.every((v) => v.deleteForMe);
  const remove = !forEveryone && verdicts.every(removable) && verdicts.some((v) => v.remove !== null);
  return forMe || forEveryone || remove ? { forEveryone, forMe, remove } : NOTHING;
}

/** « RETIRER » SEUL (#11210) — le geste du menu rapide : il mène droit au motif. */
export const removalOfferOf = (offer: DeleteOffer): DeleteOffer | null => (offer.remove ? { forEveryone: false, forMe: false, remove: true } : null);

export const offersDeletion = (offer: DeleteOffer): boolean => offer.forEveryone || offer.forMe || offer.remove;
