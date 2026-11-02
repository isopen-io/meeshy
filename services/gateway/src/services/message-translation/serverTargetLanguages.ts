import { normalizeLanguageForDedup } from '@meeshy/shared/utils/language-normalize';
import { isServerTranslatableLanguage } from '@meeshy/shared/utils/server-translatable-language';

/**
 * Résout les langues cibles effectives d'un message : chaque code est ramené à
 * sa forme canonique via le SSOT `normalizeLanguageForDedup` (le chemin client
 * passe le code brut — `'EN'`, `'en-US'`), puis la langue source est retirée
 * pour éviter une auto-traduction NLLB (`fr → fr`) qui altère le texte et stocke
 * une fausse traduction du message de l'utilisateur.
 *
 * La comparaison se fait sur les formes normalisées : `originalLanguage` est
 * persisté verbatim (les clients envoient `Locale.current`, ex. `'fr-FR'`, `'FR'`)
 * tandis que les cibles issues de `_extractConversationLanguages` sont déjà
 * normalisées lowercase — un `===` brut manquait `fr-FR`/`FR` vs `fr`. La SSOT
 * `normalizeLanguageForDedup` strippe la région des DEUX côtés, même hors
 * catalogue (`'fil-PH'`/`'fil'` → `'fil'`), sans quoi un tel target échappait au
 * filtre et un `fil → fil` était demandé. `'auto'` n'est jamais filtré.
 *
 * Une langue sans code NLLB-200 (`byv`… #3659), cible ou source, ne part
 * jamais : son lecteur reçoit l'original, sans push ni `translation:failed`
 * (incident prod 2026-11-01 : cinq pushes et un échec diffusé par message).
 */
export function resolveServerTargetLanguages(
  originalLanguage: string | null | undefined,
  targetLanguages: readonly string[]
): string[] {
  const source =
    originalLanguage && originalLanguage !== 'auto'
      ? normalizeLanguageForDedup(originalLanguage)
      : undefined;
  if (source !== undefined && !isServerTranslatableLanguage(source)) return [];

  return [...targetLanguages]
    .map(normalizeLanguageForDedup)
    .filter((code) => code !== source && isServerTranslatableLanguage(code));
}
