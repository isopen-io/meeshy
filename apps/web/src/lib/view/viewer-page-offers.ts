import { attachmentSrc } from '@/lib/api/media-url';
import type { Attachment, Message } from '@/lib/api/types';
import type { SendSheetRequest } from '@/lib/send/send-sheet-store';

import { kindOf } from './message';
import { quotedIsProtected } from './quoted-protection';

/**
 * CE QUE LA VISIONNEUSE OFFRE SUR UNE PAGE (#6303) — miroir de la colonne
 * d'actions d'iOS (`ConversationMediaGalleryView.mediaActions`, `+Menu.swift`) :
 * Enregistrer, Réagir, Répondre, Créer avec ce média — et, depuis #8884,
 * PARTAGER : la pièce part vers une personne, plusieurs, un groupe, ou se
 * publie (feuille d'envoi commune, `openSendSheet`).
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
  /** Partager (#8884) — l'hôte sait ouvrir la feuille d'envoi avec cette pièce. */
  readonly share: boolean;
};

export type MediaPageOffers = MediaViewerCapabilities;

export const NO_MEDIA_OFFERS: MediaPageOffers = { save: false, react: false, reply: false, compose: false, share: false };

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
    share: capabilities.share && hasFile,
  };
}

export const offersAnything = (offers: MediaPageOffers): boolean => offers.save || offers.react || offers.reply || offers.compose || offers.share;

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
  /** Ce que « Partager » remet à la feuille d'envoi — posé par l'hôte qui sait de quoi la pièce est la pièce (message, publication, média nu). */
  readonly share?: SendSheetRequest;
};

const isVideo = (attachment: Attachment): boolean => kindOf(attachment) === 'video';

/** La feuille peint une vidéo par SA lecture (`<video preload="metadata">`) : lui remettre une vignette image la casserait. L'image prend sa vignette, sinon son fichier. */
const previewUrlOf = (attachment: Attachment): string =>
  !isVideo(attachment) && attachment.thumbnailUrl !== undefined && attachment.thumbnailUrl !== ''
    ? attachmentSrc(attachment.thumbnailUrl)
    : attachmentSrc(attachment.fileUrl);

/**
 * LA PIÈCE D'UN MESSAGE, TELLE QUE LA FEUILLE D'ENVOI LA REÇOIT (#8884) — elle
 * voyage par ses IDENTIFIANTS, jamais par son fichier : la passerelle la copie
 * ou la transfère sans ré-upload. `mine` dit si la copie serveur lui est permise.
 * `mediaPageOffers` a déjà retiré l'action d'une pièce voilée (vue unique,
 * flou, chiffrement) ; reste l'ÉPHÉMÈRE, qui se TRANSFÈRE (la copie hérite de
 * sa durée) mais ne se PUBLIE pas — la passerelle le refuse en
 * `PROTECTED_MEDIA`, donc la feuille n'offre aucune pastille de publication.
 */
export function attachmentSendRequest(params: {
  readonly attachment: Attachment;
  readonly message: Pick<Message, 'id' | 'conversationId'> & Partial<Pick<Message, 'expiresAt'>>;
  /** Le lecteur est l'auteur du message (`isMineOf`) — l'hôte qui ne le sait pas dit `false`, la voie sûre (transfert, jamais copie serveur). */
  readonly mine: boolean;
}): SendSheetRequest {
  const { attachment, message, mine } = params;
  return {
    intent: 'share',
    payload: {
      kind: 'attachment',
      conversationId: message.conversationId,
      messageId: message.id,
      attachmentId: attachment.id,
      mime: attachment.mimeType,
      previewUrl: previewUrlOf(attachment),
      mine,
      protected: message.expiresAt != null,
    },
  };
}

/**
 * UNE PAGE QUI NE PORTE QUE « PARTAGER » (#8884) — l'hôte qui ne connaît pas de
 * message (scène d'une publication, pièce citée hors du fil) remet sa propre
 * demande. Aucun message ⇒ ni Réagir, ni Répondre : la passerelle n'en connaît
 * pas l'identifiant, et les identifiants vides ne sont lus par aucune des
 * deux actions (`offers` les retire).
 */
export function sharePage(attachment: Attachment, share: SendSheetRequest): MediaViewerPage {
  return { attachment, messageId: '', conversationId: '', offers: { ...NO_MEDIA_OFFERS, share: true }, share };
}

/**
 * UN MÉDIA NU — l'image d'un commentaire, le média d'une publication : aucun
 * message ne le porte, la feuille le traite comme un fichier (téléchargé une
 * fois, envoyé ou publié). `null` quand il ne peut pas sortir : protégé (vue
 * unique, flou, chiffré — lu sur la pièce, comme `mediaPageOffers`), sans
 * fichier, ou encore un aperçu `blob:` de l'appareil.
 */
export function standaloneSharePage(attachment: Attachment): MediaViewerPage | null {
  if (quotedIsProtected(attachment) || attachment.fileUrl === '' || attachment.fileUrl.startsWith('blob:')) return null;
  const video = isVideo(attachment);
  return sharePage(attachment, {
    intent: 'share',
    payload: {
      kind: 'media',
      url: attachmentSrc(attachment.fileUrl),
      mime: attachment.mimeType,
      name: attachment.originalName !== '' ? attachment.originalName : attachment.fileName,
      preview: { kind: video ? 'video' : 'image', thumbUrl: previewUrlOf(attachment) },
    },
  });
}
