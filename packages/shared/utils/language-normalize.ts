/**
 * Normalise un identifier de langue vers la forme ISO 639-1 (2 lettres lowercase).
 *
 * Entrées acceptées (cas réels rencontrés cross-platform) :
 * - `"fr"`, `"FR"` → `"fr"`
 * - `"fr-FR"`, `"fr_FR"` (iOS `Locale.current.identifier`) → `"fr"`
 * - `"zh-Hant-HK"` (script + region) → `"zh"`
 * - `"en-US"` (`Accept-Language` web) → `"en"`
 * - ISO 639-3 (`"eng"`, `"fra"`) tronqué aux 2 premières lettres pour rester
 *   compatible avec le mapping NLLB-200 (`"fr" → "fra_Latn"`).
 *
 * Retourne `undefined` pour les entrées invalides (vides, malformées, codes
 * < 2 caractères alphabétiques, séparateurs uniquement). Le caller décide du
 * fallback (`'fr'` pour `resolveUserLanguage`, omission pour les listes).
 *
 * Miroir Swift à maintenir synchrone :
 * - `packages/MeeshySDK/Sources/MeeshySDK/Auth/AuthModels.swift`
 *   (`MeeshyUser.normalizeLanguageCode`)
 * - `apps/ios/Meeshy/Features/Main/Models/ConversationLanguagePreferences.swift`
 *   (`ConversationLanguagePreferences.normalize`)
 *
 * @see packages/shared/utils/conversation-helpers.ts — consommateur principal
 * @see packages/shared/utils/attachment-validators.ts — `languageCodeSchema`
 *   valide la forme BCP-47 brute (sans normaliser).
 */
export function normalizeLanguageCode(
  input: string | null | undefined
): string | undefined {
  if (typeof input !== 'string') return undefined;
  const trimmed = input.trim();
  if (trimmed.length < 2) return undefined;

  // Garder uniquement la partie avant le premier séparateur (-, _)
  const primary = trimmed.split(/[-_]/)[0]?.toLowerCase();
  if (!primary || primary.length < 2) return undefined;

  // Filtre des caractères non-alphabétiques (ex: "@@@", "fr2", "fr!")
  if (!/^[a-z]+$/.test(primary)) return undefined;

  // Restreindre à 2 lettres (ISO 639-1 ; NLLB-200 mapping)
  return primary.slice(0, 2);
}
