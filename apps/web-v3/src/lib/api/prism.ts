import {
  buildTranslationRecord,
  resolvePrismTranslation,
} from '@meeshy/shared/utils/conversation-helpers';

/**
 * LE PRISME LINGUISTIQUE — servi par `@meeshy/shared`, jamais réécrit ici.
 *
 * Ce fichier portait une COPIE de `resolvePrismTranslation()`, écrite quand le
 * POC ne construisait pas le paquet partagé et documentée comme devant
 * disparaître. Elle a disparu : il ne reste qu'une ADAPTATION DE FORME, et
 * même celle-là est faite par `shared` (`buildTranslationRecord`, qui accepte
 * les deux dialectes de traduction du dépôt — `{language,content}` et
 * `{targetLanguage,translatedContent}`).
 *
 * CE QUE CE FICHIER AJOUTE, et pourquoi il existe encore : `served()` rend la
 * PAIRE — le texte ET la langue dans laquelle il est servi. Un appelant qui
 * peint lit `text` ; un appelant qui doit DIRE la langue (attribut `lang`,
 * pastille, `aria-label`) lit `language`. C'est la distinction que le CLAUDE.md
 * tire du cycle 122 : un résolveur qui élit la bonne traduction n'a corrigé
 * personne tant qu'on ne sait pas QUI l'affiche — et un lecteur d'écran qui
 * prononce un texte français avec une voix anglaise est ce défaut-là, rendu
 * audible.
 */
export type Served = {
  readonly text: string;
  readonly language: string;
  /** Vrai quand le texte servi n'est PAS l'original. */
  readonly translated: boolean;
};

/**
 * @param preferredLanguages le prisme du LECTEUR, ordonné — la sortie de
 *   `resolveUserLanguagesOrdered`, jamais une liste reconstruite à la main.
 * @param translations soit le tableau d'un message, soit la carte
 *   `{ langue: texte }` que la passerelle précalcule pour une ligne de liste.
 */
export function served(params: {
  readonly preferredLanguages: readonly string[];
  readonly originalLanguage: string | null | undefined;
  readonly translations: unknown;
  readonly original: string;
}): Served {
  const { preferredLanguages, originalLanguage, translations, original } = params;
  const record = Array.isArray(translations)
    ? buildTranslationRecord(translations)
    : ((translations ?? {}) as Readonly<Record<string, string>>);

  // `exactOptionalPropertyTypes` : `shared` déclare `originalLanguage?: string
  // | null`, donc passer explicitement `undefined` est refusé — on n'écrit la
  // clé que lorsqu'elle a une valeur.
  const resolved = resolvePrismTranslation({
    translations: record,
    ...(originalLanguage === undefined ? {} : { originalLanguage }),
    preferredLanguages,
  });

  // `null` ⇒ servir l'original : soit aucune traduction vers une langue du
  // lecteur, soit — et c'est le cas qu'un résolveur faux rate — le message est
  // DÉJÀ écrit dans une de ses langues, à son rang.
  if (resolved === null) return { text: original, language: originalLanguage ?? '', translated: false };
  return { text: resolved.text, language: resolved.language, translated: true };
}
