import { sharedPlaceFromMetadata } from '../../../services/location/sharedPlace';
import { truncateMessagePreview } from './last-message-preview';
import { resolveLastMessageNature, summarizeAttachments, type NatureSource, type SummarizableAttachment } from './last-message-nature';
import { previewAltOf, previewAttachmentProtection, previewStickerOf, type PreviewAltAttachment } from './last-message-media';

/**
 * Le CORPS de `lastMessage` servi par `GET /conversations` — tout sauf
 * l'auteur, dont la présence dépend du lecteur et reste chez la route.
 *
 * Extrait de `core-list.ts` (au plafond de taille) quand #7591 / #7594 y ont
 * ajouté le sticker, le texte alternatif et la vue unique ouverte. Tout ici est
 * pur : la protection (`withheld`), l'échéance servie et la consommation du
 * lecteur sont résolues par la route.
 */

export type ListPreviewAttachmentRow = SummarizableAttachment & PreviewAltAttachment;

export interface ListLastMessageRow extends NatureSource {
  readonly content?: string | null;
  readonly metadata?: unknown;
  readonly isViewOnce?: boolean | null;
  readonly translations?: unknown;
  readonly originalLanguage?: string | null;
  readonly attachments?: readonly ListPreviewAttachmentRow[] | null;
  readonly _count?: { readonly attachments?: number } | null;
}

export interface ListLastMessageContext {
  /** Message à vue unique, flouté, chiffré ou expiré (`isPreviewWithheld`). */
  readonly withheld: boolean;
  /** L'échéance servie à ce lecteur (#7451) ; `undefined` = hors éphémère, rien à surcharger. */
  readonly servedExpiresAt: Date | null | undefined;
  /** Ce lecteur a déjà ouvert ce message à vue unique (`MessageStatusEntry.viewedOnceAt`). */
  readonly viewOnceConsumed: boolean;
}

function servedAttachment<A extends ListPreviewAttachmentRow>(attachment: A, withheld: boolean) {
  return {
    ...attachment,
    ...previewAttachmentProtection(attachment),
    alt: previewAltOf(attachment, withheld),
  };
}

export function projectListLastMessageBody<M extends ListLastMessageRow>(msg: M, context: ListLastMessageContext) {
  const { withheld, servedExpiresAt, viewOnceConsumed } = context;
  // `translations` (JSON brut, potentiellement chiffré) et `originalLanguage`
  // sont servis au niveau CONVERSATION sous forme de carte d'aperçu ; les
  // laisser fuiter dans le spread renverrait le blob complet à chaque ligne.
  const { translations: _rawTranslations, originalLanguage: _originalLanguage, attachments: loaded, ...rest } = msg;
  const attachments = loaded ?? [];
  // Lot 3 / #6111 — le lieu hissé de `metadata.location`, jamais pour un
  // aperçu protégé : la métadonnée brute peut porter un lieu comme un sticker.
  const place = withheld ? null : sharedPlaceFromMetadata(msg.metadata);
  return {
    ...rest,
    // #7545 — la NATURE et le RÉSUMÉ de toutes les pièces jointes ; la liste
    // n'en SERT que la première en détail.
    ...resolveLastMessageNature(msg),
    attachments: attachments.slice(0, 1).map((attachment) => servedAttachment(attachment, withheld)),
    attachmentSummary: withheld ? null : summarizeAttachments(attachments, msg._count?.attachments),
    content: withheld ? '' : truncateMessagePreview(msg.content),
    ...(servedExpiresAt !== undefined ? { expiresAt: servedExpiresAt } : {}),
    // Identité, horloge, type et drapeaux (déjà dans `rest`) continuent de
    // partir : ce sont eux qui qualifient le placeholder que le client compose.
    // Tout le reste du contenu — métadonnée brute, pièces jointes, leur compte —
    // est retiré pour un aperçu protégé.
    ...(withheld ? { metadata: null, attachments: null, _count: { attachments: 0 } } : {}),
    ...(place ? { location: place } : {}),
    // #7591 — un sticker part souvent en `messageType: "image"` : sans ce
    // champ, la ligne se lisait « 📷 Photo » au chargement.
    sticker: previewStickerOf(msg.metadata, { messageWithheld: withheld, attachments }),
    // #7594 — par LECTEUR ; `false` hors vue unique.
    viewOnceConsumed: msg.isViewOnce === true && viewOnceConsumed,
  };
}
