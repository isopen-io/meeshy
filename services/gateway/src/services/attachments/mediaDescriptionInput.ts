/**
 * La description saisie à l'envoi d'un média (#11329), par les deux portes
 * (multipart et TUS) : nettoyée et bornée par la loi partagée
 * (`sanitizeMediaDescription`), sa langue détectée à l'écriture comme celle
 * d'une légende. Rien n'est posé quand rien n'est saisi : la description par
 * défaut est la transcription, résolue à la lecture (`resolveMediaDescription`).
 *
 * Le chemin `uploadEncryptedFile` ne l'appelle pas : une description en clair
 * à côté d'une pièce chiffrée serait le texte qu'on vient de chiffrer.
 */
import { sanitizeMediaDescription } from '@meeshy/shared/utils/media-description';
import { detectContentLanguage } from '../../utils/content-language';

export function mediaDescriptionFields(raw: unknown): { readonly alt: string; readonly altLanguage: string } | Record<string, never> {
  const alt = sanitizeMediaDescription(raw);
  return alt === null ? {} : { alt, altLanguage: detectContentLanguage(alt) };
}
