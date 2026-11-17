/**
 * Le contenu PROTÉGÉ (éphémère / vue unique / flouté / chiffré) d'une liste de
 * pièces jointes qui traverse plusieurs conversations — extrait de
 * `routes/attachments/search.ts` (#5170) pour « En commun » (#19200) : deux
 * listes, UNE exclusion.
 *
 * Deux passages, tous deux fail-CLOSED :
 *   1. `attachmentProtectionWhere()` — ce que Prisma ferme NATIVEMENT
 *      (booléens, `isEncrypted`, présence d'`expiresAt`), niveau pièce ET message ;
 *   2. `isProtectedAttachmentRow()` — le bitfield `effectFlags`, sans opérateur
 *      côté Mongo, fermé en mémoire par le prédicat de la bannière de notification
 *      (`protectedPreview` / `maskedAttachment`), réutilisé et jamais réécrit.
 *
 * `expiresAt` : un message ÉPHÉMÈRE a `expiresAt` PRÉSENT et non nul ; sur le
 * connecteur Mongo un champ ABSENT ne matche ni `null` ni `NOT null`, d'où l'OR
 * « absent, OU présent-et-nul ».
 */
import { protectedPreview, maskedAttachment } from '../notifications/notification-preview';

export type ProtectionMessageColumns = {
  readonly isEncrypted: boolean;
  readonly isViewOnce: boolean;
  readonly isBlurred: boolean;
  readonly effectFlags: number;
  readonly expiresAt: Date | null;
};

export type ProtectionAttachmentColumns = {
  readonly isViewOnce: boolean;
  readonly isBlurred: boolean;
  readonly effectFlags: number;
  readonly message: ProtectionMessageColumns | null;
};

export const PROTECTION_MESSAGE_SELECT = {
  isEncrypted: true,
  isViewOnce: true,
  isBlurred: true,
  effectFlags: true,
  expiresAt: true,
} as const;

export const PROTECTION_ATTACHMENT_SELECT = { isViewOnce: true, isBlurred: true, effectFlags: true } as const;

export function messageProtectionWhereExclusion(): Record<string, unknown> {
  return {
    isViewOnce: false,
    isBlurred: false,
    isEncrypted: false,
    OR: [{ expiresAt: { isSet: false } }, { expiresAt: null }],
  };
}

export function messageIsProtected(message: ProtectionMessageColumns | null): boolean {
  if (!message) return true;
  return (
    protectedPreview({
      messageType: null,
      isEncrypted: message.isEncrypted,
      isViewOnce: message.isViewOnce,
      isBlurred: message.isBlurred,
      effectFlags: message.effectFlags,
      expiresAt: message.expiresAt,
    }) !== null
  );
}

export function isProtectedAttachmentRow(row: ProtectionAttachmentColumns): boolean {
  if (messageIsProtected(row.message)) return true;
  return Boolean(maskedAttachment({ isViewOnce: row.isViewOnce, isBlurred: row.isBlurred, effectFlags: row.effectFlags }));
}
