import { normalizeLanguageForDedup } from '@meeshy/shared/utils/language-normalize';

/**
 * Le raccord du gateway sur la SSOT `normalizeLanguageForDedup` pour le calcul
 * « quelles langues cibles restent à traduire ? ».
 *
 * Deux services jumeaux — `AttachmentTranslateService` et `AudioTranslateService`
 * — diffent la liste de cibles DEMANDÉE par le client contre les clés de
 * traduction DÉJÀ STOCKÉES, pour n'envoyer au translator (NLLB) que le manquant
 * et pour filtrer le cache. Les deux le faisaient VERBATIM
 * (`new Set(existing).has(lang)`), si bien que :
 *
 *   - une cible région-taguée (`'en-US'` d'un `Accept-Language`, `'FR'` d'une
 *     casse mixte) ne matchait jamais la clé canonique stockée (`'en'`, `'fr'`) —
 *     requête NLLB redondante ET filtre de cache qui ne rend jamais la ligne ;
 *   - deux variantes d'une MÊME langue (`'fr'`, `'fr-FR'`) comptaient pour deux
 *     cibles distinctes — deux travaux de traduction pour un seul résultat.
 *
 * Ce module compose la SSOT — jamais une boucle réécrite à la main — pour que la
 * règle vive à UN endroit partagé par les deux jumeaux (cf. `CLAUDE.md`
 * « Cette entité a-t-elle une JUMELLE ? »).
 *
 * @see packages/shared/utils/language-normalize.ts — `normalizeLanguageForDedup`
 * @see services/gateway/src/utils/recipient-language.ts — même patron de raccord
 */
export type TranslationTargetDiff = {
  /**
   * Codes de langue cibles DEMANDÉS mais absents du stockage, canonicalisés et
   * dédupliqués. C'est la liste à envoyer au translator.
   */
  readonly missing: string[];
  /**
   * Vrai lorsqu'une traduction stockée (identifiée par sa clé brute) satisfait
   * l'une des cibles demandées, sous comparaison canonique. Sert à filtrer les
   * traductions en cache vers ce que l'appelant a réellement demandé.
   */
  readonly wasRequested: (storedTargetLanguage: string) => boolean;
};

export function diffTranslationTargets(
  requestedTargetLanguages: readonly string[],
  existingTargetLanguages: readonly string[]
): TranslationTargetDiff {
  const existing = new Set(existingTargetLanguages.map(normalizeLanguageForDedup));
  const requested = new Set(requestedTargetLanguages.map(normalizeLanguageForDedup));
  const missing = [...requested].filter((lang) => !existing.has(lang));
  return {
    missing,
    wasRequested: (storedTargetLanguage) =>
      requested.has(normalizeLanguageForDedup(storedTargetLanguage)),
  };
}
