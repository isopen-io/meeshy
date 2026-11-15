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

/**
 * **CE QUE LA FILE CALCULE POUR UN MESSAGE CONFIÉ** (#9898, #11372) — rien
 * pour un message chiffré sans clair ici ni pour un texte vide ; sinon la
 * descente ci-dessus. La file (`scheduler.ts`) et l'offre du menu
 * (`deviceTranslationWanted`) lisent cette seule loi : le menu n'offre jamais
 * un geste que la file sauterait.
 */
export function offeredMessageTarget(params: {
  readonly message: {
    readonly encrypted: boolean;
    readonly content: string;
    readonly originalLanguage: string | null | undefined;
    readonly translatedLanguages: readonly string[];
  };
  readonly preferredLanguages: readonly string[];
  readonly canTranslate: (source: string, target: string) => boolean;
}): DeviceTranslationPair | null {
  const { message, preferredLanguages, canTranslate } = params;
  if (message.encrypted || message.content.trim() === '') return null;
  return deviceTranslationTarget({
    preferredLanguages,
    originalLanguage: message.originalLanguage,
    translatedLanguages: message.translatedLanguages,
    canTranslate,
  });
}
