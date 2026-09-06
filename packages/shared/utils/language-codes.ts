/**
 * Codes de langue supportés par Meeshy — module FEUILLE, sans dépendance.
 *
 * Extrait de `languages.ts` (#5396) : la table complète des langues (noms,
 * drapeaux, capacités TTS/STT/voice-cloning) pèse 30 Ko minifiés, mais des
 * consommateurs comme `language-normalize.ts` n'ont besoin QUE de la liste
 * des codes pour valider/normaliser une entrée — pas des métadonnées de
 * synthèse vocale. Avant ce fichier, ces consommateurs importaient
 * `languages.ts` pour un seul appel à `getSupportedLanguageCodes()`, et
 * embarquaient la table entière dans tout bundle qui les traversait (le fil,
 * `liste.js`, `feed.js`, `notifs.js`… via `conversation-helpers.ts`).
 *
 * La dépendance s'inverse ici : cette liste est la source unique des CODES,
 * `languages.ts` la consomme pour construire `getSupportedLanguageCodes()`,
 * et les métadonnées (`SUPPORTED_LANGUAGES`) restent une source séparée. Le
 * témoin de parité (`__tests__/language-codes-parity.test.ts`) garantit que
 * chaque code de `SUPPORTED_LANGUAGES` est dans cette liste et réciproquement
 * — une langue ajoutée/retirée d'un côté sans l'autre y rougit.
 *
 * @see languages.ts — table complète des métadonnées par langue
 * @see language-normalize.ts — consommateur principal (validation/normalisation)
 */
export const SUPPORTED_LANGUAGE_CODES = [
  'en', 'fr', 'es', 'de', 'it', 'pt', 'nl', 'pl', 'ru', 'uk', 'cs', 'ro',
  'hu', 'bg', 'hr', 'el', 'tr', 'sv', 'da', 'fi', 'no', 'lt', 'hy',
  'ar', 'he', 'fa', 'hi', 'bn', 'ur', 'th', 'vi', 'id', 'ms', 'ja', 'ko', 'zh',
  'am', 'sw', 'yo', 'ha', 'rw', 'rn', 'sn', 'lg', 'om', 'ti', 'ny', 'ee', 'mg', 'so',
  'ln', 'ig', 'zu', 'xh', 'af', 'wo',
  'bas', 'ksf', 'nnh', 'dua', 'ewo',
  'sk', 'sl', 'sr', 'ca', 'et', 'lv', 'az', 'kk', 'uz', 'ka', 'ta', 'ne', 'my',
  'km', 'lo', 'tl', 'ff', 'tw', 'ak', 'bm', 'byv', 'fan',
] as const;
