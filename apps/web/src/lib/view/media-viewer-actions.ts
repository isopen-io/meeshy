import type { Attachment, Message } from '@/lib/api/types';

import { kindOf } from './message';
import { quotedIsProtected } from './quoted-protection';

/**
 * CE QUE LA VISIONNEUSE OFFRE SUR UNE PAGE (#6303) — miroir de la colonne
 * d'actions d'iOS (`ConversationMediaGalleryView.mediaActions`, `+Menu.swift`) :
 * Enregistrer, Réagir, Répondre, Créer avec ce média.
 *
 * DEUX QUESTIONS, DANS CET ORDRE.
 *  1. **La pièce a-t-elle le droit de sortir ?** Une vue unique, un flou ou un
 *     chiffrement — au niveau du MESSAGE comme de la PIÈCE — ferme les quatre
 *     portes d'un coup (`FullscreenReplyRoute`, `AttachmentReactionOffer`,
 *     `ComposableAttachment.isProtected` : le même prédicat, lu une fois). La
 *     garde vit au rang de l'EXISTENCE du bouton, jamais d'un bouton qui
 *     refuserait après le tap. Elle se lit sur la pièce ORIGINALE : une pièce
 *     floutée que l'on vient de révéler (`revealedAttachment`) reste une pièce
 *     floutée pour ce qu'elle a le droit de quitter.
 *  2. **L'hôte sait-il faire l'action ?** Loi 4 — un contrôle existe s'il a un
 *     effet : chaque capacité est déclarée par l'hôte (le fil sait répondre,
 *     l'écran des médias non ; un hôte sans porte de fichier ne sait pas
 *     enregistrer).
 *
 * Un envoi encore LOCAL (`cid_…`, `client-message-id.ts`) n'offre rien : la
 * passerelle n'en connaît pas l'identifiant (Réagir, Répondre), et ses pièces
 * ne sont encore que des aperçus `blob:` de l'appareil (Enregistrer, Créer).
 */
export type MediaViewerCapabilities = {
  readonly save: boolean;
  readonly react: boolean;
  readonly reply: boolean;
  readonly compose: boolean;
};

export type MediaPageOffers = MediaViewerCapabilities;

export const NO_MEDIA_OFFERS: MediaPageOffers = { save: false, react: false, reply: false, compose: false };

const isLocalSend = (id: string): boolean => id.startsWith('cid_');

export type ProtectableMessage = Pick<Message, 'id' | 'isViewOnce' | 'isBlurred' | 'isEncrypted'> & {
  readonly effectFlags?: number;
};

export function mediaPageOffers(params: {
  readonly attachment: Attachment;
  readonly message: ProtectableMessage;
  readonly capabilities: MediaViewerCapabilities;
}): MediaPageOffers {
  const { attachment, message, capabilities } = params;
  if (quotedIsProtected(message) || quotedIsProtected(attachment) || isLocalSend(message.id)) return NO_MEDIA_OFFERS;
  const kind = kindOf(attachment);
  const visual = kind === 'image' || kind === 'video';
  const hasFile = attachment.fileUrl !== '';
  return {
    save: capabilities.save && hasFile,
    react: capabilities.react,
    reply: capabilities.reply,
    compose: capabilities.compose && visual && hasFile,
  };
}

export const offersAnything = (offers: MediaPageOffers): boolean => offers.save || offers.react || offers.reply || offers.compose;

/**
 * UNE PAGE TELLE QUE LA VISIONNEUSE LA REMET À SES ACTIONS — la pièce
 * ORIGINALE (jamais sa copie révélée), le message qui la porte, ce qu'elle
 * offre, et le geste « Répondre » que seul l'hôte sait câbler (il referme la
 * visionneuse et arme la citation de la pièce dans le composeur du fil).
 */
export type MediaViewerPage = {
  readonly attachment: Attachment;
  readonly messageId: string;
  readonly conversationId: string;
  readonly offers: MediaPageOffers;
  readonly onReply?: () => void;
};
