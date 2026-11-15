import { contactCardNameFromFileName, isContactCardAttachment } from '@meeshy/shared/utils/vcard';

import type { Attachment } from '@/lib/api/types';
import { translate } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';

/**
 * LE NOM SOUS LEQUEL UNE CARTE DE VISITE SE DIT HORS DE SA CARTE (#8122) —
 * citation, bandeau de réponse, feuille des accusés : le nom tel que l'auteur
 * l'a nommé, lu dans le nom de fichier décapé de son préfixe technique
 * (`contact_<UUID>_…`, #8142), sinon « Contact partagé ». Miroir de
 * `MessageAttachment.contactCardFallbackName` (iOS). `null` ⇒ la pièce n'est
 * pas une carte de visite, l'appelant garde son propre libellé.
 */
export function contactCardLabelOf(
  attachment: Pick<Attachment, 'mimeType' | 'originalName' | 'fileName'>,
  language: InterfaceLanguage,
): string | null {
  const fileName = attachment.originalName !== '' ? attachment.originalName : attachment.fileName;
  if (!isContactCardAttachment({ mimeType: attachment.mimeType, fileName })) return null;
  return contactCardNameFromFileName(fileName) ?? translate(language, 'contactCard.shared');
}
