import { messageTypeFromMimeTypes } from '@meeshy/shared/utils/attachment-message-type';

import type { Attachment, Message } from '@/lib/api/types';

/**
 * CE QUE LA VUE DÉRIVE D'UN MESSAGE.
 *
 * Le POC portait `isMine` et `status` comme des CHAMPS du message. Ni l'un ni
 * l'autre n'existe dans le domaine, et pour deux raisons différentes :
 *
 * · `isMine` dépend de QUI REGARDE. Le graver dans la charge la rendrait
 *   incorrecte dès qu'un second lecteur la lit — un cache partagé, une
 *   pré-hydratation, un test.
 * · `status` n'est pas un état mais une LECTURE de compteurs. Le serveur sert
 *   `deliveredCount`, `readCount` et les deux horloges « à tous » ; la coche
 *   unique de l'interface est ce que l'on en conclut.
 */

/** La coche du pied de bulle — quatre paliers, dans l'ordre. */
export type Delivery = 'pending' | 'sent' | 'delivered' | 'read';

export const isMineOf = (message: Message, viewerId: string): boolean => message.senderId === viewerId;

/**
 * TOUT OU RIEN, comme iOS : la double coche bleue ne s'allume que lorsque le
 * message est lu par TOUS les destinataires actifs. Une lecture partielle
 * affiche `delivered` — annoncer « lu » sur un groupe de dix parce qu'une
 * personne a ouvert le fil serait un mensonge d'interface, et le dépôt tient
 * `recipientCount` précisément pour l'éviter.
 *
 * `recipientCount` ABSENT (charge construite par socket) ⇒ on retombe sur les
 * horloges dénormalisées, seule source qui ne suppose pas de dénominateur.
 */
export const deliveryOf = (message: Message): Delivery => {
  if (message.readByAllAt !== undefined) return 'read';
  if (message.deliveredToAllAt !== undefined) return 'delivered';

  const recipients = message.recipientCount;
  if (recipients !== undefined && recipients > 0) {
    if (message.readCount >= recipients) return 'read';
    if (message.deliveredCount >= recipients) return 'delivered';
  }
  return message.deliveredCount > 0 ? 'delivered' : 'sent';
};

/**
 * La CATÉGORIE d'une pièce jointe, déduite de son type MIME par la fonction du
 * dépôt — la même que celle qui décide du `messageType` à l'envoi. La déduire
 * ici avec un `startsWith('image/')` de plus produirait deux classements pour
 * une même pièce, et c'est le genre d'écart qui ne se voit que sur un format
 * rare.
 */
export const kindOf = (attachment: Attachment): 'image' | 'audio' | 'video' | 'file' =>
  messageTypeFromMimeTypes([attachment.mimeType]) ?? 'file';

/** Les traductions d'un message, ramenées à ce qu'une puce de langue affiche. */
export const translationsOf = (
  message: Message,
): readonly { readonly language: string; readonly text: string }[] =>
  message.translations.map((t) => ({ language: t.targetLanguage, text: t.translatedContent }));

/**
 * Une onde de vocal DÉTERMINISTE, dérivée de l'identifiant de la pièce.
 *
 * Le domaine ne porte pas de forme d'onde — la passerelle ne la calcule pas, et
 * la fabriquer au hasard ferait bouger la barre à chaque rendu. Dérivée de
 * l'id, elle est stable pour une pièce donnée, différente d'une pièce à
 * l'autre, et ne prétend RIEN sur le contenu audio : c'est une décoration
 * honnête, à remplacer le jour où le serveur sert la vraie.
 */
export const waveformOf = (attachment: Attachment, bars = 22): readonly number[] => {
  const seed = [...attachment.id].reduce((acc, c) => (acc * 31 + c.charCodeAt(0)) % 9973, 7);
  return Array.from({ length: bars }, (_, i) => 6 + ((seed * (i + 3)) % 17));
};
