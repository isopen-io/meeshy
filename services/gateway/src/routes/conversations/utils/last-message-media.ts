import {
  ATTACHMENT_PROTECTION_FIELDS,
  maskedAttachment,
  type AttachmentProtectionFlags,
} from '@meeshy/shared/utils/attachment-protection';
import type {
  LastMessageAttachmentSummary,
  LastMessageSticker,
  PreviewProtection,
} from '@meeshy/shared/types/conversation-preview';
import { stickerFromMetadata } from '../../../services/stickers/messageSticker';
import { isPreviewWithheld, summarizeAttachments, type SummarizableAttachment } from './last-message-nature';

/**
 * Le sticker et le texte alternatif du dernier message (#7591, #7594), servis
 * À L'IDENTIQUE par `GET /conversations` (`lastMessage.sticker`,
 * `lastMessage.attachments[0].alt`) et par `conversation:updated`
 * (`lastMessageSticker`, `lastMessageAttachments[0].alt`).
 *
 * Les deux sont du CONTENU : l'`alt` d'un sticker de texte est la phrase tapée,
 * et les `slots` d'un gabarit portent ses textes. Ils sont donc retenus sous
 * les DEUX niveaux de protection qui les déclarent — celui du MESSAGE
 * (`isPreviewWithheld`, décidé par l'appelant) et celui de la PIÈCE
 * (`maskedAttachment`, la loi partagée avec les clients). Une garde qui ne lit
 * que le message laissait partir la phrase d'un sticker flouté par sa pièce.
 *
 * Tout ici est pur.
 */

export interface PreviewAltAttachment extends AttachmentProtectionFlags {
  readonly alt?: string | null;
}

/** Le sticker hissé de `metadata.sticker`, ou `null` sans sticker ou sous protection. */
export function previewStickerOf(
  metadata: unknown,
  protection: { readonly messageWithheld: boolean; readonly attachments: readonly AttachmentProtectionFlags[] },
): LastMessageSticker | null {
  if (protection.messageWithheld || protection.attachments.some(maskedAttachment)) return null;
  return stickerFromMetadata(metadata);
}

/** Le texte alternatif d'une pièce, ou `null` s'il est vide ou que le message ou la pièce est protégé. */
export function previewAltOf(attachment: PreviewAltAttachment, messageWithheld: boolean): string | null {
  if (messageWithheld || maskedAttachment(attachment)) return null;
  const alt = attachment.alt?.trim();
  return alt ? alt : null;
}

/** La protection propre d'une pièce — des drapeaux, jamais du contenu : ils partent toujours. */
export function previewAttachmentProtection(attachment: AttachmentProtectionFlags): {
  readonly isViewOnce: boolean;
  readonly isBlurred: boolean;
  readonly effectFlags: number;
} {
  return {
    isViewOnce: attachment.isViewOnce === true,
    isBlurred: attachment.isBlurred === true,
    effectFlags: attachment.effectFlags ?? 0,
  };
}

/**
 * LA PROJECTION de la pièce servie par la liste, REST et socket (#15701).
 *
 * Une pièce masquée (vue unique, floutée, effet) ou la pièce d'un message
 * éphémère actif ne sert que sa NATURE (`id`, `mimeType`) et ses DRAPEAUX : ni
 * vignette, ni nom, ni poids, ni durée, ni dimensions, ni métadonnée. Un
 * éphémère n'est pas « retenu » (son texte se lit tant qu'il vit), mais ce que
 * son média ÉTAIT — une photo de 3 Mo en 4:3 — n'a pas à partir à côté.
 *
 * Liste d'AUTORISATION, donc fail-closed : une clé que la liste ne nomme pas
 * passe à `null`, y compris celles qu'un `select` ajoutera demain. Les clés
 * restent celles de la pièce ordinaire — un ancien client ne perd aucun champ.
 */
export const PREVIEW_ATTACHMENT_KEPT_FIELDS = ['id', 'mimeType', ...ATTACHMENT_PROTECTION_FIELDS] as const;

type KeptField = (typeof PREVIEW_ATTACHMENT_KEPT_FIELDS)[number];

export type DetailWithheldAttachment<A> = { readonly [K in keyof A]: K extends KeptField ? A[K] : null };

const KEPT_FIELDS: ReadonlySet<string> = new Set(PREVIEW_ATTACHMENT_KEPT_FIELDS);

/** Aucun détail ne part : message protégé à un titre quelconque (éphémère actif compris) ou pièce masquée. */
export function previewAttachmentDetailsWithheld(
  attachment: AttachmentProtectionFlags,
  messageProtection: PreviewProtection | null,
): boolean {
  return messageProtection !== null || maskedAttachment(attachment);
}

export function servedPreviewAttachment<A extends AttachmentProtectionFlags>(
  attachment: A,
  messageProtection: PreviewProtection | null,
): A | DetailWithheldAttachment<A> {
  if (!previewAttachmentDetailsWithheld(attachment, messageProtection)) return attachment;
  // Cast justifié : `Object.fromEntries` rend un index de chaînes ; les clés sont
  // exactement celles de `A`, dont la liste d'autorisation ne garde que `KeptField`.
  return Object.fromEntries(
    Object.entries(attachment).map(([key, value]) => [key, KEPT_FIELDS.has(key) ? value : null]),
  ) as DetailWithheldAttachment<A>;
}

/**
 * Le résumé de TOUTES les pièces : `null` pour un message retenu ; sinon la
 * nature (`count`, `kinds`) part toujours, le POIDS seulement quand rien n'est
 * masqué — il ne se lit plus sur une pièce dont la liste ne sert plus le poids
 * (message éphémère, ou une pièce chargée masquée).
 */
export function servedAttachmentSummary(
  attachments: readonly (SummarizableAttachment & AttachmentProtectionFlags)[],
  totalCount: number | null | undefined,
  messageProtection: PreviewProtection | null,
): LastMessageAttachmentSummary | null {
  if (isPreviewWithheld(messageProtection)) return null;
  const summary = summarizeAttachments(attachments, totalCount);
  if (summary === null) return null;
  const weightWithheld = messageProtection !== null || attachments.some(maskedAttachment);
  return weightWithheld ? { ...summary, totalSize: null } : summary;
}
