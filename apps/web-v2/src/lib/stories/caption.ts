import { buildPostTranslationRecord } from '@meeshy/shared/utils/conversation-helpers';

import { served } from '@/lib/api/prism';

/**
 * LA LÉGENDE D'UNE STORY — miroir de `StoryDerivedContent.swift:1-102`
 * (#5817, D-1) : « on décide sur l'ORIGINAL, on rend le RÉSOLU ».
 *
 * Une story synthétise parfois son texte affiché sur la scène depuis des
 * calques (`textObjects`, hors périmètre TEXTE/IMAGE de #5817 mais déjà
 * possible sur le corpus servi) : quand le `content` du post n'est QUE la
 * concaténation de ces calques, la légende REPLIÉE (sous la scène) ne doit
 * pas redire ce que la scène affiche déjà. `isDerivedCaption` compare
 * l'ORIGINAL à la composition des calques — ÉGALITÉ STRICTE, jamais une
 * inclusion, sans quoi une légende qui commence par les mêmes mots que la
 * scène disparaîtrait à tort.
 */

/** `composed(overlays)` (`StoryDerivedContent.swift`) — les textes non blancs, joints par UN espace. */
export function composeOverlayText(overlays: readonly string[]): string {
  return overlays
    .map((text) => text.trim())
    .filter((text) => text !== '')
    .join(' ');
}

/** `isDerivedIndex(content, overlays)` — ÉGALITÉ STRICTE. */
export function isDerivedCaption(content: string, overlays: readonly string[]): boolean {
  return content === composeOverlayText(overlays);
}

/**
 * `caption()` — `null` si le contenu est DÉRIVÉ des calques (déjà affiché
 * sur la scène) ou vide, sinon le texte RÉSOLU (Prisme) — jamais l'original,
 * jamais un mélange des deux.
 */
export function captionFor(params: {
  readonly content: string;
  readonly resolvedContent: string;
  readonly overlayTexts: readonly string[];
}): string | null {
  const { content, resolvedContent, overlayTexts } = params;
  if (content.trim() === '') return null;
  if (isDerivedCaption(content, overlayTexts)) return null;
  return resolvedContent;
}

/** Une légende SERVIE — le texte ET la langue dans laquelle il est rendu
 * (posée en `lang=` par l'appelant — CLAUDE.md § Prisme, cycle 122). */
export type ResolvedStoryCaption = { readonly text: string; readonly language: string };

/**
 * **LE SITE UNIQUE** qui compose la descente du Prisme (`served()`,
 * `lib/api/prism.ts` — JAMAIS réécrite ici, D-14) et la règle de dérivation
 * ci-dessus, pour UNE story. `routes/story.tsx` l'appelle plutôt que de
 * recomposer les deux à la main — la forme exacte de « jumelle » que le
 * CLAUDE.md racine interdit (Prisme, § Cohérence).
 *
 * **`translations` d'un POST est une carte `langue → { text, … }`**
 * (`schema.prisma:911`), PAS la forme `langue → texte` que `served()`
 * accepte telle quelle (`prism.ts` ne dépouille que le dialecte TABLEAU d'un
 * message via `buildTranslationRecord`) : passée sans dépouillement, chaque
 * entrée échoue `typeof text !== 'string'` et `resolvePrismTranslation` sert
 * l'ORIGINAL en silence — la « jumelle d'adaptateur » que
 * `buildPostTranslationRecord` (`@meeshy/shared`) existe pour fermer.
 * Dépouillée ICI, au site d'appel : étendre `served()` lui-même pour
 * détecter ce second dialecte toucherait tout consommateur de messages, hors
 * du périmètre de ce lot.
 */
export function resolveStoryCaption(params: {
  readonly preferredLanguages: readonly string[];
  readonly originalLanguage: string | null | undefined;
  readonly translations: unknown;
  readonly content: string;
  readonly overlayTexts?: readonly string[];
}): ResolvedStoryCaption | null {
  const resolved = served({
    preferredLanguages: params.preferredLanguages,
    originalLanguage: params.originalLanguage,
    translations: buildPostTranslationRecord(params.translations),
    original: params.content,
  });
  const text = captionFor({
    content: params.content,
    resolvedContent: resolved.text,
    overlayTexts: params.overlayTexts ?? [],
  });
  return text === null ? null : { text, language: resolved.language };
}
