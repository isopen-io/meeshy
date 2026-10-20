import type { Message } from '@/lib/api/types';

import { isMineOf } from './message';

/**
 * CE QUE LE DIALOGUE DE SUPPRESSION OFFRE (#10582) — la règle du SERVEUR, lue
 * avant l'aller-retour.
 *
 * « POUR TOUS » suit `admitMessageDelete` (`services/gateway/src/services/
 * messaging/messageDeleteAdmission.ts`) : l'auteur supprime son message SANS
 * LIMITE DE TEMPS. iOS n'offre ce choix que pendant deux heures
 * (`ConversationCommandHandler.canDeleteForEveryone`) ; le serveur n'impose
 * aucune fenêtre, et c'est lui que cette loi suit — une fenêtre posée ici
 * retirerait à un auteur un droit que la passerelle lui reconnaît.
 * Un message système émis par le lecteur (l'avis de capture, #9641) ne se
 * retire pas, un message déjà supprimé non plus.
 *
 * « RETIRER » (#11150) — le message d'un AUTRE, par qui modère la conversation
 * (`moderatesConversation`, `content-removal.ts` : rôle de conversation ou de
 * plateforme, jamais en direct). L'hôte le décide et le remet en `moderates` ;
 * le retrait demande un motif, et l'auteur en est prévenu. Une sélection qui
 * mêle les miens et ceux des autres se retire en entier : la passerelle ignore
 * le motif sur les messages de l'auteur.
 *
 * L'offre vaut pour TOUS les messages visés ou pour aucun : un seul message
 * d'un autre dans la sélection retire « pour tous » au lot entier, comme
 * `selectionAllowsDeleteForAll` sur iOS.
 *
 * « POUR MOI » demande un compte (`routes/user-deletions.ts` refuse la
 * session anonyme) et un message que le serveur connaît.
 */
export type DeleteViewer = { readonly id: string; readonly hasAccount: boolean; readonly moderates?: boolean };

export type DeleteOffer = { readonly forEveryone: boolean; readonly forMe: boolean; readonly remove: boolean };

type DeletableMessage = Pick<Message, 'id' | 'senderId' | 'deletedAt' | 'messageType'>;

const NOTHING: DeleteOffer = { forEveryone: false, forMe: false, remove: false };

const knownToServer = (message: DeletableMessage): boolean => !message.id.startsWith('cid_');

export function deleteOfferOf(messages: readonly DeletableMessage[], viewer: DeleteViewer): DeleteOffer {
  if (messages.length === 0 || !viewer.hasAccount || !messages.every(knownToServer)) return NOTHING;
  const live = messages.every((m) => m.deletedAt == null && m.messageType !== 'system');
  const forEveryone = live && messages.every((m) => isMineOf(m as Message, viewer.id));
  return { forEveryone, forMe: true, remove: live && !forEveryone && viewer.moderates === true };
}

export const offersDeletion = (offer: DeleteOffer): boolean => offer.forEveryone || offer.forMe || offer.remove;
