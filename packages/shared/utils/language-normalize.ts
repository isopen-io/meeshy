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
 * Réduction EXPLICITE ISO 639-2 / 639-3 → ISO 639-1 pour les codes 3-lettres
 * SANS entrée Meeshy directe (les codes 639-3 supportés — `bas`, `dua`, `ewo`,
 * `ksf`, `nnh` — sont renvoyés verbatim en amont et n'atteignent jamais ce map).
 *
 * Remplace l'ancienne troncature aveugle `slice(0, 2)`, qui produisait des
 * collisions silencieuses dès que les 2 premières lettres d'un code 3-lettres
 * formaient PAR HASARD une autre langue supportée :
 *   - `'fil'` (Filipino — code canonique CLDR/Apple, `Locale.current = "fil_PH"`)
 *     → `'fi'` (Finnois) : un utilisateur philippin recevait des traductions
 *     finnoises, violation directe du Prisme Linguistique.
 *   - `'swe'` (Suédois, 639-2/T) → `'sw'` (Swahili) au lieu de `'sv'`.
 * Un préfixe 2-lettres supporté n'implique JAMAIS que la réduction soit correcte.
 *
 * Couvre les variantes 639-2/T (terminologie) ET 639-2/B (bibliographique) qui
 * diffèrent (`deu`/`ger`, `fra`/`fre`, `ces`/`cze`, `ell`/`gre`, `fas`/`per`,
 * `hye`/`arm`, `msa`/`may`, `nld`/`dut`, `ron`/`rum`, `zho`/`chi`). Chaque cible
 * est re-validée contre `SUPPORTED_CODES` avant retour : une langue retirée de
 * `languages.ts` retombe automatiquement sur `undefined`. Tout code 3-lettres
 * absent de ce map (dont `'fil'`, `'tgl'`) est rejeté — jamais tronqué.
 *
 * Miroir Swift à maintenir synchrone : `MeeshyUser.normalizeLanguageCode`
 * (packages/MeeshySDK/Sources/MeeshySDK/Auth/AuthModels.swift, `iso639ReductionMap`).
 */
export const ISO_639_3_TO_1: Readonly<Record<string, string>> = {
  afr: 'af', amh: 'am', ara: 'ar', ben: 'bn', bul: 'bg',
  ces: 'cs', cze: 'cs', dan: 'da', deu: 'de', ger: 'de',
  ell: 'el', gre: 'el', eng: 'en', ewe: 'ee', fas: 'fa', per: 'fa',
  fin: 'fi', fra: 'fr', fre: 'fr', hau: 'ha', heb: 'he', hin: 'hi',
  hrv: 'hr', hun: 'hu', hye: 'hy', arm: 'hy', ibo: 'ig', ind: 'id',
  ita: 'it', jpn: 'ja', kin: 'rw', kor: 'ko', lin: 'ln', lit: 'lt',
  lug: 'lg', mlg: 'mg', msa: 'ms', may: 'ms', nld: 'nl', dut: 'nl',
  nor: 'no', nya: 'ny', orm: 'om', pol: 'pl', por: 'pt', ron: 'ro',
  rum: 'ro', run: 'rn', rus: 'ru', sna: 'sn', som: 'so', spa: 'es',
  swa: 'sw', swe: 'sv', tha: 'th', tir: 'ti', tur: 'tr', ukr: 'uk',
  urd: 'ur', vie: 'vi', wol: 'wo', xho: 'xh', yor: 'yo', zho: 'zh',
  chi: 'zh', zul: 'zu',
};

/**
 * Réduction EXPLICITE des codes ISO 639-1 DÉPRÉCIÉS vers leur code canonique
 * courant. `iw`/`in`/`ji` sont les anciens codes retirés du registre ISO 639-1
 * pour l'hébreu, l'indonésien et le yiddish. La JVM les conserve pour
 * compatibilité descendante : `java.util.Locale.getLanguage()` normalise
 * `he→iw`, `id→in`, `yi→ji`. Un client Android (plateforme miroir Meeshy) sur
 * une locale hébraïque émet donc `iw`, qui — laissé verbatim — ne matche AUCUNE
 * ligne `MessageTranslation` (clé `he`) et fait retomber le lecteur sur
 * l'original non traduit : violation directe du Prisme Linguistique, même classe
 * de collision silencieuse que le map 3-lettres élimine pour `fil`/`swe`.
 *
 * Chaque cible est re-validée contre `SUPPORTED_CODES` avant retour (comme le
 * chemin 3-lettres) : `ji` → `yi` non supporté retombe donc sur `undefined`.
 *
 * Miroir Swift à maintenir synchrone : `MeeshyUser.normalizeLanguageCode`
 * (packages/MeeshySDK/Sources/MeeshySDK/Auth/AuthModels.swift, `iso639ReductionMap`).
 */
export const LEGACY_ISO_639_1: Readonly<Record<string, string>> = {
  iw: 'he', in: 'id', ji: 'yi',
};

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
 * - ISO 639-2/639-3 sans entrée Meeshy (`"eng"`, `"fra"`, `"spa"`, `"deu"`) :
 *   réduit à son ISO 639-1 via la table EXPLICITE {@link ISO_639_3_TO_1}
 *   (`"eng"` → `"en"`, `"spa"` → `"es"`, `"swe"` → `"sv"`). JAMAIS par troncature
 *   aveugle : `"swe"` (Suédois) ne devient pas `"sw"` (Swahili), `"fil"`
 *   (Filipino, sans équivalent 639-1) n'est PAS mappé sur `"fi"` (Finnois) mais
 *   rejeté (`undefined`).
 *
 * Retourne `undefined` pour les entrées invalides (vides, malformées, codes
 * < 2 caractères alphabétiques, séparateurs uniquement, ou code 3-lettres absent
 * de la table de réduction). Le caller décide du fallback (`'fr'` pour
 * `resolveUserLanguage`, omission pour les listes).
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

  // ISO 639-2/639-3 sans entrée Meeshy directe : réduction via table EXPLICITE
  // (jamais par troncature — `'fil'` → `'fi'`, `'swe'` → `'sw'` étaient des
  // collisions silencieuses). La cible est re-validée contre les codes supportés.
  if (primary.length > 2) {
    const reduced = ISO_639_3_TO_1[primary];
    return reduced && SUPPORTED_CODES.has(reduced) ? reduced : undefined;
  }

  // Alias ISO 639-1 DÉPRÉCIÉ (`iw`/`in`/`ji`) : réduit vers le code canonique
  // courant via table EXPLICITE, re-validé contre les codes supportés (comme le
  // chemin 3-lettres). Sinon un `iw` verbatim ne matcherait aucune traduction `he`.
  const legacy = LEGACY_ISO_639_1[primary];
  if (legacy) return SUPPORTED_CODES.has(legacy) ? legacy : undefined;

  // Code 2-lettres inconnu : conservé (ne matchera aucune traduction → le
  // caller applique son fallback). Préserve le comportement historique.
  return primary;
}

/**
 * Canonicalise un code de langue **verbatim** (BCP-47, casse mixte, tags de
 * région/script) vers une clé stable de **déduplication / affichage**, sans
 * jamais perdre les codes que {@link normalizeLanguageCode} ne sait pas réduire.
 *
 * Contrat : `normalizeLanguageCode(code) ?? <sous-tag primaire lowercased>`
 * - `'en-US'`, `'EN'`, `'en'` → `'en'` (une seule entrée dans un `Set`)
 * - `'pt-BR'` → `'pt'`, `'zh-Hant-HK'` → `'zh'`, `'fr_FR'` → `'fr'`
 * - ISO 639-3 irréductible inconnu (`'xyz'`) → `'xyz'` conservé lowercased plutôt
 *   que supprimé (le repli `undefined` ferait disparaître la donnée, changement
 *   de comportement non désiré pour une liste/un compteur).
 * - Irréductible inconnu MAIS tagué région/script (`'yue-HK'`, `'xyz-AB'`) →
 *   `'yue'`, `'xyz'` : la clé de dedup est région-aveugle pour TOUT code, pas
 *   seulement ceux que `normalizeLanguageCode` sait réduire. Sinon `'yue'` et
 *   `'yue-HK'` (Cantonais, hors catalogue) compteraient pour deux langues — la
 *   fuite exacte que le cas `'en'`/`'en-US'` interdit.
 *
 * Garde « ne jamais perdre la donnée » : quand le sous-tag primaire est vide
 * (`'-US'`) ou purement non-alphabétique (`'@@@'`), le découpage retomberait sur
 * `''` — on préserve alors la chaîne entière lowercased plutôt que de la vider.
 *
 * SSOT unique du couple normalisation-avec-repli employé partout où des codes
 * verbatim (préférences in-app persistées sans normalisation, `participant.language`
 * de lignes héritées) sont agrégés en une liste ou dédupliqués — un `.toLowerCase()`
 * brut compterait `'en'` et `'en-US'` comme deux langues distinctes.
 *
 * @see conversation-helpers.ts — resolver de langue préférée (in-app prefs)
 * @see services/gateway/src/routes/anonymous.ts — agrégat `spokenLanguages`
 */
export function normalizeLanguageForDedup(code: string): string {
  const normalized = normalizeLanguageCode(code);
  if (normalized) return normalized;
  const primary = code.trim().split(/[-_]/)[0]?.toLowerCase();
  return primary ? primary : code.toLowerCase();
}

/**
 * Égalité de langue conforme au Prisme Linguistique : deux codes verbatim
 * peuvent être région-tagués (`en-US`, `fr_FR`), 3-lettres (`fra`) ou legacy
 * (`iw`) et désigner la même langue. Un `===` brut les traite comme des
 * langues distinctes — cf. § « Le drapeau original/traduit … ignorent la
 * canonicalisation du Prisme » (CLAUDE.md racine).
 *
 * SSOT unique de cette comparaison : avant cette fonction, cinq copies
 * locales identiques coexistaient dans `apps/web` (`use-message-display.ts`,
 * `messages-display.tsx`, `TranslationToggle.tsx`, `use-stream-translation.ts`,
 * `CanvasV3Scene.tsx`), et un sixième site (`MessageActionsBar.tsx`) n'en avait
 * aucune et comparait en `===` brut.
 *
 * Retourne `false` si l'un des deux codes est absent/vide — un code manquant
 * ne "matche" jamais, y compris lui-même.
 */
export function isSameLanguage(a?: string | null, b?: string | null): boolean {
  return !!a && !!b && normalizeLanguageForDedup(a) === normalizeLanguageForDedup(b);
}
