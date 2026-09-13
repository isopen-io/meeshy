import { normalizeLanguageCode } from '@meeshy/shared/utils/language-normalize';
import { isSupportedLanguage } from '@meeshy/shared/utils/languages';

/**
 * LA LOI DE COMPOSITION (#5828) — miroir pur de
 * `ConversationViewModel+Send.swift:66-71` (`composeLanguage(for:preferred:)`) :
 *
 * ```swift
 * nonisolated static func composeLanguage(for content: String, preferred: [String]) -> String {
 *     LanguageDetection.detectLanguageCode(for: content, fallback: preferred.first)
 *         ?? preferred.first ?? "fr"
 * }
 * ```
 *
 * Trois rangs, dans cet ordre : un CHOIX explicite (l'utilisateur a touché la
 * pastille pour CE message) → une DÉTECTION suffisamment sûre → le rang 1 du
 * PRISME du lecteur → `"fr"`. Jamais le rang 1 seul (le défaut que #5828
 * corrige, `thread.tsx:255` posait `originalLanguage: readerLocale`).
 *
 * PURE : aucun import de `lib/reader`, de `navigator`, de `document` — la loi
 * ne sait rien de QUI tape, seulement ce qu'on lui donne. `useComposeLanguage`
 * (`lib/view/use-compose-language.ts`) est le SEUL site qui la nourrit d'un
 * état vivant.
 */
export type DetectedLanguage = { readonly language: string; readonly confidence: number };

/** `LanguageDetection.minAlphaCount` (SDK, `Utilities/LanguageDetection.swift:13-14`) —
 * sous ce nombre de LETTRES (jamais de caractères — chiffres et ponctuation ne
 * comptent pas), une détection n'est jamais consultée. */
export const COMPOSE_MIN_LETTERS = 4;

/** `ComposerLanguageResolver.confidenceFloor` (`ComposerModels.swift:153`) —
 * en dessous, la pastille n'adopte pas le verdict : « un utilisateur qui tape
 * "ok" ou "lol" envoie son message tagué français tant que le détecteur n'a
 * pas un signal franc » (`:146-152`). */
export const COMPOSE_CONFIDENCE_FLOOR = 0.86;

/** `DefaultComposerLanguage.resolve()` (`ComposerModels.swift:92-98`) — le
 * dernier repli, quand ni un choix, ni une détection, ni le Prisme du lecteur
 * ne tranchent. */
export const COMPOSE_FALLBACK_LANGUAGE = 'fr';

/**
 * LE SEGMENTEUR, CONSTRUIT UNE FOIS — `letterCount` est appelée jusqu'à trois
 * fois par FRAPPE (la loi, le rang servi, la garde du détecteur). Mesuré
 * (bun, 3 000 itérations, 61 caractères) : 0,0283 ms avec un `Intl.Segmenter`
 * neuf par appel contre 0,0090 ms en le réutilisant. Ce n'est pas une
 * lenteur — 85 µs de frappe, 0,5 % d'une image à 60 fps — c'est une
 * allocation par frappe qu'aucune raison ne justifie.
 */
const GRAPHEMES = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

/**
 * Le nombre de LETTRES (`\p{L}`) d'un texte, par grapheme Unicode — jamais un
 * `[a-z]` qui manquerait toute écriture non latine (arabe, japonais, coréen,
 * chinois…), ni un `.length` qui compterait chiffres et ponctuation comme des
 * lettres. `Intl.Segmenter` segmente en GRAPHÈMES (un emoji multi-code-point
 * compte pour un, jamais pour deux lettres par accident).
 */
export function letterCount(text: string): number {
  let count = 0;
  for (const { segment } of GRAPHEMES.segment(text)) {
    if (/\p{L}/u.test(segment)) count += 1;
  }
  return count;
}

/**
 * LA LOI — ordre : `chosen` (normalisé) → `detected` (si le texte porte assez
 * de lettres ET que la confiance atteint le plancher, normalisé) →
 * `preferred[0]` (normalisé) → `"fr"`.
 *
 * Un `chosen`/`detected`/rang-1 qui ne normalise vers RIEN — ou vers un code
 * que Meeshy ne SUPPORTE pas (`isSupportedLanguage`, un `'xx'` inconnu que
 * `normalizeLanguageCode` conserve verbatim faute de mieux) — est IGNORÉ,
 * jamais transmis tel quel : fail-closed, comme tout ce que ce module rend.
 * La passerelle rejette de toute façon en 400 un code hors du motif
 * `CommonSchemas.language` (`packages/shared/utils/validation.ts:115`), donc
 * cette loi ne peut jamais produire une valeur qu'elle refuserait.
 */
/** Exportée pour `use-compose-language.ts` (§ Étape 3) — le hook doit pouvoir
 * dire QUELLE part de la loi a tranché (`source`), pas seulement le résultat. */
export function normalizedSupportedCode(code: string | null | undefined): string | undefined {
  const normalized = normalizeLanguageCode(code);
  return normalized !== undefined && isSupportedLanguage(normalized) ? normalized : undefined;
}

export function composeLanguage(input: {
  readonly text: string;
  readonly detected: DetectedLanguage | null;
  readonly preferred: readonly string[];
  readonly chosen?: string | null;
}): string {
  const { text, detected, preferred, chosen } = input;

  const normalizedChoice = normalizedSupportedCode(chosen);
  if (normalizedChoice !== undefined) return normalizedChoice;

  if (detected !== null && detected.confidence >= COMPOSE_CONFIDENCE_FLOOR && letterCount(text) >= COMPOSE_MIN_LETTERS) {
    const normalizedDetection = normalizedSupportedCode(detected.language);
    if (normalizedDetection !== undefined) return normalizedDetection;
  }

  const normalizedPreferred = normalizedSupportedCode(preferred[0]);
  if (normalizedPreferred !== undefined) return normalizedPreferred;

  return COMPOSE_FALLBACK_LANGUAGE;
}
