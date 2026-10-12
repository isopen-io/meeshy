import { normalizeLanguageForDedup } from '@meeshy/shared/utils/language-normalize';

export type DeviceTranslationPair = { readonly source: string; readonly target: string };

/**
 * **LA LANGUE QUE L'APPAREIL CALCULE** (#9898) — la même descente que
 * `resolvePrismTranslation` (`@meeshy/shared`), lue à l'envers : au lieu de
 * dire quel rang est SERVI, elle dit quel rang PLUS HAUT l'appareil peut
 * encore servir.
 *
 * Le prisme se parcourt dans l'ordre. Un rang déjà servi — par une traduction
 * ou parce que le message est écrit dans cette langue — arrête la descente :
 * calculer une langue moins préférée ne changerait rien à ce que le lecteur
 * voit. Un rang que l'appareil ne sait pas traduire est sauté, comme le
 * serveur saute une langue sans traduction. Sans langue d'origine connue,
 * rien n'est calculé : un moteur à qui l'on ment sur la source traduit mal.
 */
export function deviceTranslationTarget(params: {
  readonly preferredLanguages: readonly string[];
  readonly originalLanguage: string | null | undefined;
  readonly translatedLanguages: readonly string[];
  readonly canTranslate: (source: string, target: string) => boolean;
}): DeviceTranslationPair | null {
  const { preferredLanguages, originalLanguage, translatedLanguages, canTranslate } = params;
  if (originalLanguage === null || originalLanguage === undefined || originalLanguage.trim() === '') return null;

  const source = normalizeLanguageForDedup(originalLanguage);
  const served = new Set(translatedLanguages.map(normalizeLanguageForDedup));
  const ranks = preferredLanguages.filter((code) => code.trim() !== '').map(normalizeLanguageForDedup);

  for (const target of ranks) {
    if (target === source || served.has(target)) return null;
    if (canTranslate(source, target)) return { source, target };
  }
  return null;
}
