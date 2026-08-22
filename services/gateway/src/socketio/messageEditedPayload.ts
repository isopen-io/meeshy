import type { MessageType } from '@meeshy/shared/types/index';
import { resolveWireSenderId } from './wireSenderId';

/**
 * Le NOYAU REQUIS de la charge utile `message:edited`.
 *
 * `message:edited` est déclaré `(message: SocketIOMessage) => void`, exactement
 * comme `message:new` — et `SocketIOMessage` rend `id`, `conversationId`,
 * `senderId`, `content`, `originalLanguage`, `messageType` et `createdAt`
 * OBLIGATOIRES. L'événement a TROIS producteurs :
 *
 * | producteur | transport |
 * |---|---|
 * | `MessageHandler.handleMessageEdit` | socket `message:edit` |
 * | `broadcastMessageMutation` | les cinq routes REST de mutation |
 * | `MeeshySocketIOManager._broadcastCallMessageEdited` | transition live→terminal d'un appel |
 *
 * Les deux derniers servaient le noyau ; le PREMIER — le transport d'édition
 * primaire du web — construisait sa charge utile à la main et en avait perdu
 * `senderId`, `messageType` et `createdAt`.
 *
 * Ce n'était pas une omission cosmétique. `APIMessage`, le décodeur iOS de
 * `message:edited` (`MessageSocketManager.swift`), lit `senderId` et `createdAt`
 * par `try c.decode(...)`, SANS repli : une clé absente fait échouer le décodage
 * du message ENTIER, et `decode(_:from:)` journalise `decode DROP` puis rend la
 * main. Autrement dit, **une édition faite depuis le web n'atteignait AUCUN
 * client iOS de la conversation** — la bulle y gardait le texte d'avant jusqu'à
 * une relecture complète, que rien ne déclenche spontanément. Le web, qui fusionne
 * `{ ...cached, ...payload }`, ne montrait rien : le défaut était invisible du
 * côté d'où venait l'édition.
 *
 * `senderId` passe par {@link resolveWireSenderId} — servir `message.senderId`
 * brut aurait mis un `Participant.id` là où les deux autres producteurs mettent
 * un `User.id`, c'est-à-dire réparé le décodage en installant une divergence de
 * SENS, celle-là muette.
 *
 * Les champs propres à chaque transport (contenu édité, traductions, pièces
 * jointes, `metadata`, `sender`) restent au site d'appel : seul le noyau que le
 * contrat EXIGE appartient à cette unité.
 */
export function buildMessageEditedCore(
  message: {
    readonly id: string;
    readonly senderId?: string | null;
    readonly messageType?: string | null;
    readonly createdAt?: Date | null;
    readonly sender?: {
      readonly userId?: string | null;
      readonly user?: { readonly id?: string | null } | null;
    } | null;
  },
  inputs: { readonly conversationId: string }
) {
  return {
    id: message.id,
    conversationId: inputs.conversationId,
    senderId: resolveWireSenderId(message),
    messageType: (message.messageType || 'text') as MessageType,
    createdAt: message.createdAt || new Date(),
  };
}
