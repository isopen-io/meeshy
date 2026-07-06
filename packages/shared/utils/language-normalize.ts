import { getSupportedLanguageCodes } from './languages.js';

/**
 * Ensemble des codes de langue supportés par Meeshy (lowercase), incluant les
 * codes ISO 639-3 des langues sans équivalent ISO 639-1 (`'bas'`, `'ksf'`,
 * `'nnh'`, `'dua'`, `'ewo'`). Construit une seule fois au chargement du module.
 *
 * Ces codes 3-lettres sont la forme canonique employée partout (clés de
 * traduction, mapping NLLB, `MessageTranslation.targetLanguage`) — ils NE
 * doivent JAMAIS être tronqués à 2 lettres (`'bas'` → `'ba'` = Bachkir, langue
 * sans rapport), sous peine de casser la résolution du Prisme Linguistique.
 */
const SUPPORTED_CODES = new Set(
  getSupportedLanguageCodes().map((code) => code.toLowerCase())
);

/**
 * Normalise un identifier de langue vers un code supporté par Meeshy.
 *
 * Entrées acceptées (cas réels rencontrés cross-platform) :
 * - `"fr"`, `"FR"` → `"fr"`
 * - `"fr-FR"`, `"fr_FR"` (iOS `Locale.current.identifier`) → `"fr"`
 * - `"zh-Hant-HK"` (script + region) → `"zh"`
 * - `"en-US"` (`Accept-Language` web) → `"en"`
 * - `"bas"`, `"bas-CM"` (ISO 639-3 supporté, sans équivalent 639-1) → `"bas"`
 *   Les codes 3-lettres supportés sont préservés tels quels — jamais tronqués.
 * - ISO 639-3 sans entrée Meeshy (`"eng"`, `"fra"`) : réduit au préfixe 2-lettres
 *   UNIQUEMENT si ce préfixe est lui-même supporté (`"eng"` → `"en"`,
 *   `"fra"` → `"fr"`). Sinon la réduction serait fausse (`"spa"` → `"sp"` ≠ `"es"`)
 *   et l'entrée est rejetée (`undefined`).
 *
 * Retourne `undefined` pour les entrées invalides (vides, malformées, codes
 * < 2 caractères alphabétiques, séparateurs uniquement, ou ISO 639-3 inconnu
 * irréductible). Le caller décide du fallback (`'fr'` pour `resolveUserLanguage`,
 * omission pour les listes).
 *
 * Miroir Swift à maintenir synchrone :
 * - `packages/MeeshySDK/Sources/MeeshySDK/Auth/AuthModels.swift`
 *   (`MeeshyUser.normalizeLanguageCode`)
 * - `apps/ios/Meeshy/Features/Main/Models/ConversationLanguagePreferences.swift`
 *   (`ConversationLanguagePreferences.normalize`, délègue à `MeeshyUser`)
 *
 * @see packages/shared/utils/conversation-helpers.ts — consommateur principal
 * @see packages/shared/utils/languages.ts — source des codes supportés
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

  // Un code supporté (2 ou 3 lettres, ex. 'bas', 'ewo') est renvoyé tel quel.
  if (SUPPORTED_CODES.has(primary)) return primary;

  // ISO 639-3 sans entrée Meeshy : réduction 2-lettres seulement si supportée.
  if (primary.length > 2) {
    const twoLetter = primary.slice(0, 2);
    return SUPPORTED_CODES.has(twoLetter) ? twoLetter : undefined;
  }

  // Code 2-lettres inconnu : conservé (ne matchera aucune traduction → le
  // caller applique son fallback). Préserve le comportement historique.
  return primary;
}
