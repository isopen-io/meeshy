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
import { mediaSideContentMayTravel, type SideContentCarrier, type SideContentProtection } from '@meeshy/shared/utils/media-description';

export { mediaSideContentMayTravel, type SideContentCarrier };

export const MESSAGE_SIDE_PROTECTION_SELECT = {
  isViewOnce: true,
  isBlurred: true,
  effectFlags: true,
  expiresAt: true,
  deletedAt: true,
  isEncrypted: true,
  encryptionMode: true,
} as const;

type Protection = SideContentProtection;

export type ServedDescription = {
  readonly alt: string | null;
  readonly altLanguage: string | null;
  readonly altTranslations: unknown;
  /**
   * La pièce est protégée : AUCUNE description ne doit être dite, pas même la
   * transcription que les clients prennent par défaut (audit #12333, A1). Le
   * serveur sert encore la transcription d'une pièce protégée à son lecteur
   * légitime (pour LIRE un vocal), jamais pour la décrire.
   */
  readonly descriptionWithheld: boolean;
};

/**
 * La description SERVIE d'une pièce chargée avec son message porteur
 * (`message: { select: MESSAGE_SIDE_PROTECTION_SELECT }`) : telle quelle, ou
 * tout à `null` et `descriptionWithheld` sous protection.
 */
export function servedDescription(row: Protection & {
  readonly alt?: string | null;
  readonly altLanguage?: string | null;
  readonly altTranslations?: unknown;
  readonly message?: SideContentCarrier | null;
}): ServedDescription {
  if (!mediaSideContentMayTravel(row, row.message ?? null)) {
    return { alt: null, altLanguage: null, altTranslations: null, descriptionWithheld: true };
  }
  return { alt: row.alt ?? null, altLanguage: row.altLanguage ?? null, altTranslations: row.altTranslations ?? null, descriptionWithheld: false };
}
