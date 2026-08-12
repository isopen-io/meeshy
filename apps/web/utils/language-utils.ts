/**
 * Utilities pour la gestion des langues.
 *
 * Adaptateurs fins au-dessus de la SSOT partagée `packages/shared/utils/languages.ts`
 * (`getLanguageInfo`, `isSupportedLanguage`, `getSupportedLanguageCodes`). Les cartes
 * locales `LANGUAGE_NAMES` / `LANGUAGE_FLAGS` — qui avaient divergé de la SSOT
 * (l'anglais rendait 🇺🇸 au lieu du 🇬🇧 canonique, et 60+ langues supportées, dont
 * les codes africains ISO 639-3 `bas`/`ewo`/`dua`, retombaient sur le globe) — ont
 * été supprimées. Même convergence que `components/v2/flags.ts`.
 *
 * Les signatures exportées sont préservées : `getLanguageDisplayName` rend le nom
 * natif (`Français`, `中文`) et `getLanguageFlag` le drapeau canonique, avec les
 * fallbacks historiques (français par défaut sur entrée vide, globe sur langue
 * inconnue). La normalisation `.toLowerCase().trim()` est assurée par la SSOT.
 */
import {
  getLanguageInfo as getSharedLanguageInfo,
  getSupportedLanguageCodes,
  isSupportedLanguage as isSharedSupportedLanguage,
} from '@meeshy/shared/utils/languages';

/**
 * Obtient le nom d'affichage (natif) d'une langue à partir de son code.
 */
export function getLanguageDisplayName(languageCode: string | null | undefined): string {
  if (!languageCode) return 'Français'; // Valeur par défaut
  const info = getSharedLanguageInfo(languageCode);
  return info.nativeName ?? info.name;
}

/**
 * Obtient le drapeau emoji canonique d'une langue à partir de son code.
 */
export function getLanguageFlag(languageCode: string | null | undefined): string {
  if (!languageCode) return '🇫🇷'; // Drapeau français par défaut
  return getSharedLanguageInfo(languageCode).flag;
}

/**
 * Obtient les informations d'affichage complètes d'une langue
 */
export function getLanguageInfo(languageCode: string) {
  return {
    code: languageCode,
    name: getLanguageDisplayName(languageCode),
    flag: getLanguageFlag(languageCode)
  };
}

/**
 * Vérifie si un code de langue est supporté
 * @deprecated Use isSupportedLanguage / SUPPORTED_LANGUAGES from @meeshy/shared instead
 */
export function isSupportedLanguage(languageCode: string): boolean {
  return isSharedSupportedLanguage(languageCode);
}

/**
 * Obtient la liste de toutes les langues supportées
 */
export function getAllSupportedLanguages() {
  return getSupportedLanguageCodes().map(code => getLanguageInfo(code));
}

/**
 * Recherche des langues par nom ou code
 */
export function searchLanguages(query: string) {
  const lowerQuery = query.toLowerCase();
  return getAllSupportedLanguages().filter(lang =>
    lang.code.toLowerCase().includes(lowerQuery) ||
    lang.name.toLowerCase().includes(lowerQuery)
  );
}
