import { transformTranslationsToArray } from '../../../utils/translation-transformer';

/**
 * Extracts sender info from unified Participant model
 */
function extractSenderInfo(sender: any) {
  if (!sender) return { id: 'unknown', username: 'unknown', isMeeshyer: false };

  if (sender.type === 'user' && sender.user) {
    return {
      id: sender.user.id,
      username: sender.user.username,
      firstName: sender.user.firstName,
      lastName: sender.user.lastName,
      displayName: sender.user.displayName,
      avatar: sender.user.avatar,
      isMeeshyer: true
    };
  }

  return {
    id: sender.id,
    username: sender.displayName,
    firstName: sender.displayName,
    lastName: '',
    displayName: sender.displayName,
    avatar: sender.avatar,
    isMeeshyer: false
  };
}

/**
 * Formate un message avec sender unifié pour l'affichage
 *
 * Ne recopie PAS `status` — dernier reste du défaut que ce cycle a fermé sur le
 * formateur jumeau. Son unique appelant (`retrieval.ts`) le nourrit de
 * `getConversationMessages`, dont l'`include` ne charge que `sender` : le champ
 * valait TOUJOURS `[]`, et `messageSchema` ne le déclarant pas,
 * `fast-json-stringify` le retirait juste après. Construit, jamais rempli,
 * jamais servi.
 *
 * Le retirer ferme aussi le piège, exactement comme pour `statusEntries` :
 * `status` est une forme d'ACCUSÉ NOMINATIF, et qui le déclarerait au schéma
 * pour « réparer » son absence le publierait sans le gate `showReadReceipts`
 * qu'appliquent les cinq lecteurs de `MessageReadStatusService`.
 */
export function formatMessageWithUnifiedSender(message: any) {
  const senderInfo = extractSenderInfo(message.sender);

  return {
    id: message.id,
    content: message.content,
    originalLanguage: message.originalLanguage || 'fr',
    createdAt: message.createdAt,
    sender: senderInfo,
    translations: transformTranslationsToArray(
      message.id,
      message.translations as Record<string, any>
    )
  };
}

/**
 * Formate un message d'un lien de partage avec ses relations (pièces jointes,
 * réactions, message cité).
 *
 * `sender` porte l'identité de l'auteur QUEL QUE SOIT son type — inscrit comme
 * anonyme. C'est le seul champ qu'un client lit (`message.sender?.username`
 * dans `MessageNameDate` / `MessageHeader`), et c'est déjà la forme que sert
 * `GET /links/:identifier` sur le MÊME lien via `formatMessageWithUnifiedSender`.
 * `isMeeshyer` distingue les deux cas.
 *
 * Ce formateur a longtemps mis `sender: null` pour un auteur anonyme et rangé
 * son nom dans un `anonymousSender` que `messageSchema` ne déclarait pas : le
 * champ était retiré à la sérialisation, et les messages des invités — la
 * population majoritaire d'un lien partagé — arrivaient SANS AUCUNE identité.
 * `anonymousSender` n'est pas rétabli : il n'a aucun lecteur (ni web, ni iOS) et
 * ouvrirait une seconde voie nominative vers une donnée que `sender` sert déjà.
 *
 * `deletedAt` n'est pas recopié : `getConversationMessagesWithDetails` filtre
 * `deletedAt: null`, la valeur est donc constante par construction.
 */
export function formatLinkMessageWithDetails(message: any) {
  return {
    id: message.id,
    content: message.content,
    originalLanguage: message.originalLanguage || 'fr',
    messageType: message.messageType,
    isEdited: message.isEdited,
    editedAt: message.editedAt,
    replyToId: message.replyToId,
    createdAt: message.createdAt,
    updatedAt: message.updatedAt,
    sender: extractSenderInfo(message.sender),
    attachments: message.attachments || [],
    replyTo: message.replyTo ? formatReplyToMessage(message.replyTo) : null,
    reactions: message.reactions || [],
    translations: transformTranslationsToArray(
      message.id,
      message.translations as Record<string, any>
    )
  };
}

/**
 * Formate le message répondu (replyTo)
 *
 * Même règle d'identité que le message racine : `sender` porte l'auteur cité,
 * anonyme comme inscrit. Une citation dont l'auteur est un invité s'affichait
 * autrement sans nom.
 *
 * Ne recopie ni les pièces jointes ni les réactions du message cité — une
 * citation ne rend que son texte et son auteur.
 */
function formatReplyToMessage(replyTo: any) {
  return {
    id: replyTo.id,
    content: replyTo.content,
    originalLanguage: replyTo.originalLanguage || 'fr',
    messageType: replyTo.messageType,
    createdAt: replyTo.createdAt,
    sender: extractSenderInfo(replyTo.sender)
  };
}
