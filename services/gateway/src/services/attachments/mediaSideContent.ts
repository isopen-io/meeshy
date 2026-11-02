/**
 * Ce qui voyage À CÔTÉ d'un média (#11329, #12333) — sa transcription en
 * sous-titres, sa description textuelle et ses traductions — et la loi UNIQUE
 * qui décide s'il en a le droit.
 *
 * Une pièce protégée — vue unique, floutée, effet masquant, chiffrée, au
 * niveau de la PIÈCE ; vue unique, floutée, effet masquant, éphémère (échéance
 * POSÉE, pas seulement échue), supprimée, chiffrée, au niveau du MESSAGE qui la
 * porte — ne transporte rien de cela : une description dit ce que le flou
 * cache. Fail-closed : un drapeau absent du `select` ne lève pas la garde
 * qu'il porterait, puisque `maskedAttachment` ne regarde que les drapeaux
 * présents — d'où `MESSAGE_SIDE_PROTECTION_SELECT`, à charger avec la pièce.
 */
import { maskedAttachment } from '@meeshy/shared/utils/attachment-protection';

export const MESSAGE_SIDE_PROTECTION_SELECT = {
  isViewOnce: true,
  isBlurred: true,
  effectFlags: true,
  expiresAt: true,
  deletedAt: true,
  isEncrypted: true,
  encryptionMode: true,
} as const;

type Protection = {
  readonly isViewOnce?: boolean | null;
  readonly isBlurred?: boolean | null;
  readonly effectFlags?: number | null;
  readonly isEncrypted?: boolean | null;
  readonly encryptionMode?: string | null;
};

export type SideContentCarrier = Protection & {
  readonly expiresAt?: Date | string | null;
  readonly deletedAt?: Date | string | null;
};

const encrypted = (p: Protection): boolean => p.isEncrypted === true || Boolean(p.encryptionMode);

export function mediaSideContentMayTravel(attachment: Protection, carrier: SideContentCarrier | null | undefined): boolean {
  if (maskedAttachment(attachment) || encrypted(attachment)) return false;
  if (!carrier) return true;
  return !maskedAttachment(carrier) && !encrypted(carrier) && !carrier.expiresAt && !carrier.deletedAt;
}

export type ServedDescription = {
  readonly alt: string | null;
  readonly altLanguage: string | null;
  readonly altTranslations: unknown;
};

/**
 * La description SERVIE d'une pièce chargée avec son message porteur
 * (`message: { select: MESSAGE_SIDE_PROTECTION_SELECT }`) : telle quelle, ou
 * tout à `null` sous protection.
 */
export function servedDescription(row: Protection & {
  readonly alt?: string | null;
  readonly altLanguage?: string | null;
  readonly altTranslations?: unknown;
  readonly message?: SideContentCarrier | null;
}): ServedDescription {
  if (!mediaSideContentMayTravel(row, row.message ?? null)) return { alt: null, altLanguage: null, altTranslations: null };
  return { alt: row.alt ?? null, altLanguage: row.altLanguage ?? null, altTranslations: row.altTranslations ?? null };
}
