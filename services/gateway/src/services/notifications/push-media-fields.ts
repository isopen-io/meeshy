import { publicMediaUrlFromEnv } from '../attachments/publicMediaUrl';
import type { NotificationAttachmentWire } from '@meeshy/shared/types/notification-attachment-wire';

/**
 * LE MÉDIA INLINE d'une charge push, tel qu'il part sur le fil (`data`).
 *
 * Extrait de `NotificationService.createNotification` (#10641) : le fichier
 * dépassait son budget, et ce bloc est le seul de la charge qui décrive un
 * FICHIER. Ses lecteurs : la NSE iOS, qui le télécharge et l'attache en
 * `UNNotificationAttachment`, et la coque Android, qui JOUE un vocal depuis sa
 * notification puis en rapporte l'écoute (`attachmentId`, `attachmentLanguage`).
 *
 * Cycle 125 — SECOND VERROU, même arbitrage que `previewPrismSource` et
 * `prePersistedMessageFields` : un `notificationLocKey` ne se pose que sur un
 * placeholder de protection (`protectedPreview` en est l'unique producteur), et
 * ni la NSE ni la coque ne téléchargent sans le regarder. Un appelant qui
 * masque le corps sans retirer son média perd ici le rich-push, jamais le
 * secret : une garde de confidentialité échoue en montrant MOINS. L'identité de
 * la pièce jointe se tait avec son adresse — rien ne s'écoute, rien ne se
 * rapporte.
 *
 * Les clés restent PRÉSENTES et vides sous le verrou : c'est la forme que les
 * lecteurs déjà publiés connaissent.
 */
export type PushMediaContext = NotificationAttachmentWire & {
  readonly notificationLocKey?: string;
};

export type PushMediaFields = {
  readonly attachmentUrl: string;
  readonly attachmentMimeType: string;
  readonly attachmentDurationMs: string;
  readonly attachmentFileSize: string;
  readonly attachmentId: string;
  readonly attachmentLanguage: string;
};

const WITHHELD: PushMediaFields = {
  attachmentUrl: '',
  attachmentMimeType: '',
  attachmentDurationMs: '',
  attachmentFileSize: '',
  attachmentId: '',
  attachmentLanguage: '',
};

const numberText = (value: number | null | undefined): string => (value != null ? String(value) : '');

export function pushMediaFields(context: PushMediaContext): PushMediaFields {
  if (context.notificationLocKey) return WITHHELD;
  const url = publicMediaUrlFromEnv(context.firstAttachmentUrl || '');
  return {
    // #7022 — L'ADRESSE SE COMPOSE ICI : la NSE descend cette chaîne SANS base
    // configurée. Règle et mesures : `publicMediaUrl.ts`.
    attachmentUrl: url,
    attachmentMimeType: context.firstAttachmentMimeType || '',
    attachmentDurationMs: numberText(context.firstAttachmentDurationMs),
    // #7003 — la NSE la lit AVANT de lancer la requête.
    attachmentFileSize: numberText(context.firstAttachmentFileSize),
    // Sans fichier, aucune identité : rien à écouter, rien à rapporter.
    attachmentId: url ? context.firstAttachmentId || '' : '',
    attachmentLanguage: url ? context.firstAttachmentLanguage || '' : '',
  };
}
