import type {
  LastMessageAttachmentSummary,
  LastMessageCallSummary,
  LastMessageSystemEvent,
} from '@meeshy/shared/types/conversation-preview';
import { sharedPlaceFromMetadata, type SharedPlace } from '../../services/location/sharedPlace';
import {
  callSummaryFromMetadata,
  isPreviewWithheld,
  resolvePreviewProtection,
  summarizeAttachments,
  systemEventFromMessage,
} from '../../routes/conversations/utils/last-message-nature';
import {
  resolveLastMessagePreviewPrism,
  resolvePreviewMediaFields,
  type LastMessagePreviewPrism,
  type PreviewMediaFields,
  type PreviewMediaMessage,
  type PreviewPrismMessage,
  type PreviewPrismParticipant,
} from './lastMessagePreviewPrism';

/**
 * Le message d'entrée du groupe d'aperçu — l'union de ce que le Prisme, le
 * sous-groupe MÉDIA et la NATURE lisent. Chaque champ est optionnel : les
 * trois émetteurs chargent des formes différentes (le `Message` partagé
 * complet, ou un `select` borné), et c'est ici — pas chez eux — qu'une
 * absence se normalise.
 */
export interface PreviewGroupMessage extends PreviewPrismMessage, PreviewMediaMessage {
  readonly messageType?: string | null;
  readonly messageSource?: string | null;
  readonly metadata?: unknown;
  readonly effectFlags?: number | null;
  readonly ephemeralDuration?: number | null;
  readonly isEncrypted?: boolean | null;
  readonly forwardedFromId?: string | null;
}

export interface LastMessageNatureFields {
  readonly lastMessageType: string | null;
  readonly lastMessageEffectFlags: number | null;
  readonly lastMessageEphemeralDuration: number | null;
  readonly lastMessageIsEncrypted: boolean;
  readonly lastMessageIsForwarded: boolean;
  readonly lastMessageSystemEvent: LastMessageSystemEvent | null;
  readonly lastMessageCallSummary: LastMessageCallSummary | null;
  readonly lastMessageAttachmentSummary: LastMessageAttachmentSummary | null;
}

export type LastMessagePreviewGroup = LastMessagePreviewPrism &
  PreviewMediaFields &
  LastMessageNatureFields & { readonly location?: SharedPlace };

/**
 * Borne de lecture des pièces jointes d'un dernier message pour son résumé.
 * Le COMPTE reste exact (`_count`) au-delà ; seuls les familles et le poids se
 * lisent sur ces premières-ci.
 */
export const PREVIEW_ATTACHMENT_SUMMARY_LIMIT = 50;

const WITHHELD_PRISM: LastMessagePreviewPrism = {
  lastMessagePreview: '',
  lastMessageTranslations: null,
  lastMessageOriginalLanguage: null,
};

/**
 * LE groupe d'aperçu que `conversation:updated` porte pour un destinataire
 * (#7545) : Prisme, sous-groupe MÉDIA, NATURE et lieu, sous UNE protection.
 *
 * Les trois émetteurs (`MessageHandler`, `postMessageSyncFanOut`,
 * `emitConversationPreviewUpdate`) composaient ces morceaux chacun de son
 * côté, et aucun ne regardait la protection : un message à vue unique ou
 * flouté partait sur le socket avec son TEXTE, ses TRADUCTIONS et sa pièce
 * jointe pendant que `GET /conversations` les masquait — et le texte finissait
 * dans le cache disque de la liste. Le prédicat est désormais celui du REST
 * (`resolvePreviewProtection`, `ephemeralDuration` compris) et il est appliqué
 * ICI, une fois, pour les trois.
 *
 * Protégé ⇒ `lastMessagePreview: ''` (comme `lastMessage.content` en REST),
 * carte et langue d'origine `null`, aucune pièce jointe, compte 0, résumé
 * `null`, aucun lieu. Les drapeaux, l'auteur, le type et les effets partent :
 * ce sont eux qui qualifient le placeholder que le client dessine.
 */
export function resolveLastMessagePreviewGroup(
  participant: PreviewPrismParticipant,
  message: PreviewGroupMessage | null | undefined,
  now: Date = new Date(),
): LastMessagePreviewGroup {
  const withheld = message != null && isPreviewWithheld(resolvePreviewProtection(message, now));
  const media = resolvePreviewMediaFields(message);
  const place = withheld ? null : sharedPlaceFromMetadata(message?.metadata);
  return {
    ...(withheld ? WITHHELD_PRISM : resolveLastMessagePreviewPrism(participant, message)),
    ...media,
    ...(withheld ? { lastMessageAttachments: [], lastMessageAttachmentCount: 0 } : {}),
    lastMessageType: message?.messageType ?? null,
    lastMessageEffectFlags: message?.effectFlags ?? null,
    lastMessageEphemeralDuration: message?.ephemeralDuration ?? null,
    lastMessageIsEncrypted: message?.isEncrypted === true,
    lastMessageIsForwarded: message?.forwardedFromId != null,
    lastMessageSystemEvent: message ? systemEventFromMessage(message) : null,
    lastMessageCallSummary: callSummaryFromMetadata(message?.metadata),
    lastMessageAttachmentSummary: withheld
      ? null
      : summarizeAttachments(message?.attachments ?? [], message?._count?.attachments),
    ...(place ? { location: place } : {}),
  };
}
