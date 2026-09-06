/**
 * LES CODES DES LANGUES SERVIES — la feuille, sans la table.
 *
 * Ce module existe pour le POIDS D'UN NAVIGATEUR (#5396) : `language-normalize`
 * n'a besoin que des CODES, et l'importer depuis `languages.ts` embarquait la
 * table entière — noms, drapeaux, capacités TTS/STT/voice-cloning — soit
 * ~30 Ko minifiés dans CHAQUE module temps réel de la web-v3 (participate,
 * liste, feed, notifs) via `conversation-helpers` (le Prisme).
 *
 * LA SOURCE DE VÉRITÉ NE BOUGE PAS : `languages.ts` reste l'autorité des
 * MÉTADONNÉES, et `getSupportedLanguageCodes()` continue d'en refléter la
 * table. Feuille et table sont tenues ensemble par le témoin
 * `__tests__/language-codes-parity.test.ts` : ajouter une langue se fait aux
 * DEUX endroits, et l'oubli d'un côté rougit là-bas, par son nom.
 *
 * Les codes 3-lettres ISO 639-3 sans équivalent 639-1 (`bas`, `ksf`, `nnh`,
 * `dua`, `ewo`, `byv`, `fan`…) sont canoniques tels quels — jamais tronqués
 * (voir `language-normalize.ts`).
 */
export const SUPPORTED_LANGUAGE_CODES = [
  'en', 'fr', 'es', 'de', 'it', 'pt', 'nl', 'pl', 'ru', 'uk',
  'cs', 'ro', 'hu', 'bg', 'hr', 'el', 'tr', 'sv', 'da', 'fi',
  'no', 'lt', 'hy', 'ar', 'he', 'fa', 'hi', 'bn', 'ur', 'th',
  'vi', 'id', 'ms', 'ja', 'ko', 'zh', 'am', 'sw', 'yo', 'ha',
  'rw', 'rn', 'sn', 'lg', 'om', 'ti', 'ny', 'ee', 'mg', 'so',
  'ln', 'ig', 'zu', 'xh', 'af', 'wo', 'bas', 'ksf', 'nnh', 'dua',
  'ewo', 'sk', 'sl', 'sr', 'ca', 'et', 'lv', 'az', 'kk', 'uz',
  'ka', 'ta', 'ne', 'my', 'km', 'lo', 'tl', 'ff', 'tw', 'ak',
  'bm', 'byv', 'fan',
] as const;
