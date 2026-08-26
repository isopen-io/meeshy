/**
 * La règle du `messageType` des pièces jointes vit désormais dans
 * `packages/shared/utils/attachment-message-type.ts`.
 *
 * Elle a dû REMONTER parce que sa moitié serveur ne peut pas rattraper sa
 * moitié client : `deriveMessageTypeForAttachments` est ADDITIVE — elle se tait
 * dès que la colonne porte autre chose que le défaut `'text'` — donc un client
 * qui écrit la règle à la main est le seul à décider dès qu'il rend autre chose
 * que `'text'`. Le web en portait un exemplaire manuscrit qui ne regardait que
 * la PREMIÈRE pièce jointe ; un lot hétérogène y partait en `'image'` là où la
 * règle canonique dit `'file'`, et rien côté serveur ne pouvait le corriger.
 *
 * Ce module reste le point d'import de la passerelle : les appelants
 * (`MessageProcessor.saveMessage`, `MessageHandler`) n'ont pas à savoir où la
 * règle habite, et un futur déplacement ne se paie pas en balayage de sites
 * d'appel.
 */
export {
  type AttachmentMessageType,
  messageTypeFromMimeTypes,
  deriveMessageTypeForAttachments,
} from '@meeshy/shared/utils/attachment-message-type';
