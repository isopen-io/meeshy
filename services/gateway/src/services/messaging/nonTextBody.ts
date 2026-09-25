import { parseMessageSticker } from '../stickers/messageSticker';

/**
 * CE QUI REND UN CORPS NON VIDE SANS TEXTE — une seule loi pour deux portes.
 *
 * Un envoi sans texte n'est pas vide s'il porte autre chose à montrer. La règle
 * vivait RECOPIÉE en deux gardes — `MessageValidator.validateRequest` (les trois
 * transports) et la garde de longueur de `MessageHandler.handleMessageSend`
 * (socket texte) — à côté du `refine` Zod de la route REST (`messages-send.ts`).
 * Chaque porteur ajouté à l'une et oublié à l'autre a produit le même défaut :
 * un envoi admis par une porte, refusé en permanence par la suivante, bloqué
 * pour toujours dans la file de retentative du client.
 *
 * Les porteurs, et pourquoi :
 * - des pièces jointes — le cas nominal ;
 * - une enveloppe chiffrée VALIDÉE — le texte est dedans ;
 * - un transfert (`forwardedFromId`) — ses pièces jointes sont copiées CÔTÉ
 *   SERVEUR (`MessageProcessor.copyForwardedAttachments`), le client n'envoie
 *   ni texte ni `attachmentIds` ; `admitMessageForward` referme ensuite le cas
 *   d'une source muette (`bodyOnlyFromSource`) ;
 * - une diffusion (`copyAttachmentsFromMessageId`) — même copie serveur
 *   (`copyAttachments.ts`), sans `forwardedFromId` ;
 * - un lieu partagé seul (`location`, #4039) ;
 * - un sticker seul (`sticker`, #7954) — mais VALIDE : `parseMessageSticker`
 *   est la loi qui l'écrira dans `metadata.sticker`. Un sticker qu'elle rejette
 *   ne rendrait rien, il ne rend donc pas le corps non vide. Le chemin iOS
 *   nominal joint le PNG rendu (pièce jointe) ; ce porteur sert le sticker à
 *   gabarit sans image, et le transport REST.
 *
 * Toute évolution de cette liste touche aussi le `refine` de `messages-send.ts`.
 */
export type NonTextBodyCarriers = {
  readonly hasAttachments?: boolean;
  readonly encryptedPayload?: unknown;
  readonly forwardedFromId?: string | null;
  readonly copyAttachmentsFromMessageId?: string | null;
  readonly location?: unknown;
  readonly sticker?: unknown;
};

export function carriesNonTextBody(carriers: NonTextBodyCarriers): boolean {
  return Boolean(
    carriers.hasAttachments ||
    carriers.encryptedPayload ||
    carriers.forwardedFromId ||
    carriers.copyAttachmentsFromMessageId ||
    carriers.location ||
    parseMessageSticker(carriers.sticker) !== null
  );
}
