import { buildPostTranslationRecord } from '@meeshy/shared/utils/conversation-helpers';
import { normalizeLanguageForDedup } from '@meeshy/shared/utils/language-normalize';

import type { CanvasDocument, CanvasObject } from '@/lib/canvas/document';
import { resolveSceneText } from '@/lib/canvas/text';
import { resolveStoryCaption } from '@/lib/stories/caption';

/**
 * **LA LOI DE DISPONIBILITÉ D'UNE STORY** (#7114, § 5.1 de la spécification)
 * — miroir de `StoryTextLanguageAvailability.swift`
 * (`packages/MeeshySDK/.../StoryTextLanguageAvailability.swift`) : le CANVAS
 * compte, exactement comme la légende (correction iOS du 2026-07-25) — une
 * story de scène sans légende reste traduisible par ses objets texte.
 *
 * Ce module vit dans le chunk `story_reader` (il est lu au PREMIER rendu du
 * lecteur) : UN seul parcours des scènes (`sceneTextObjects`) sert ses trois
 * lois, mesuré 0,68 Ko gzip quand chacune portait le sien (2026-10-04).
 */

const isBlank = (value: unknown): boolean => typeof value !== 'string' || value.trim() === '';

const isPlainRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Les objets TEXTE non blancs d'un document — l'unique parcours des scènes. */
const sceneTextObjects = (document: CanvasDocument | null): readonly CanvasObject[] =>
  document === null
    ? []
    : document.scenes.flatMap((scene) => scene.objects.filter((object) => object.kind === 'text' && !isBlank(object.payload.text)));

/** Les langues d'une carte `{ langue: texte }` DÉJÀ PLATE (un objet de
 * scène) — non vides, jamais dépouillées par `buildPostTranslationRecord`
 * (réservé à la forme `{ langue: { text } }` d'un post, `caption.ts`). */
const flatTranslationLanguages = (translations: unknown): readonly string[] =>
  isPlainRecord(translations)
    ? Object.entries(translations)
        .filter(([, text]) => !isBlank(text))
        .map(([language]) => language)
    : [];

/**
 * L'union des langues disponibles — légende (`Post.content` + `translations`)
 * ET canvas (`object.locale` + ses traductions) —, normalisées en base ISO
 * 639-1 minuscule et TRIÉES. Une entrée dupliquée après normalisation
 * (`fr-FR`, `FR`, `fr`) n'apparaît qu'une fois.
 */
export function availableStoryLanguages(params: {
  readonly content: string | null | undefined;
  readonly originalLanguage: string | null | undefined;
  readonly translations: unknown;
  readonly document: CanvasDocument | null;
}): readonly string[] {
  const { content, originalLanguage, translations, document } = params;
  const caption = isBlank(content)
    ? []
    : [...(isBlank(originalLanguage) ? [] : [originalLanguage as string]), ...Object.keys(buildPostTranslationRecord(translations))];
  const scene = sceneTextObjects(document).flatMap((object) => [
    ...(object.locale === undefined ? [] : [object.locale]),
    ...flatTranslationLanguages(object.payload.translations),
  ]);
  return [...new Set([...caption, ...scene].map(normalizeLanguageForDedup))].sort();
}

/** `hasTranslatableText` (`StoryTextLanguageAvailability.swift`) — une légende
 * non blanche OU un objet texte non blanc. */
export function hasTranslatableStoryText(params: {
  readonly content: string | null | undefined;
  readonly document: CanvasDocument | null;
}): boolean {
  return !isBlank(params.content) || sceneTextObjects(params.document).length > 0;
}

/**
 * **LA PORTE DU BOUTON** — tranche 1 : au moins DEUX langues prêtes (une
 * barre à un seul choix est inerte, loi 4). Tranche 2 : `canRequestTranslation`
 * réaligne sur iOS (`hasTranslatableText` seul suffit, `:1908-1921`) — la
 * même loi porte les deux tranches, sans rien à réécrire entre elles (Q1).
 */
export function hasTranslatableStoryContent(params: {
  readonly hasText: boolean;
  readonly availableLanguages: readonly string[];
  readonly canRequestTranslation: boolean;
}): boolean {
  const { hasText, availableLanguages, canRequestTranslation } = params;
  return hasText && (availableLanguages.length >= 2 || canRequestTranslation);
}

/** Ce que la PASTILLE du Prisme dit (§ 5.1, Q8) — la légende d'abord, sinon
 * le PREMIER objet texte servi traduit. `null` si rien n'est traduit dans le
 * prisme donné (l'AUTO servi, jamais le choix courant — sinon la pastille
 * disparaîtrait dès qu'on montre l'original et ne pourrait plus revenir). */
export function servedStoryIndicator(params: {
  readonly content: string | null | undefined;
  readonly originalLanguage: string | null | undefined;
  readonly translations: unknown;
  readonly document: CanvasDocument | null;
  readonly prism: readonly string[];
}): { readonly servedLanguage: string; readonly originalLanguage: string } | null {
  const { content, originalLanguage, translations, document, prism } = params;
  if (!isBlank(content)) {
    const resolved = resolveStoryCaption({ preferredLanguages: prism, originalLanguage, translations, content: content as string });
    if (resolved !== null && resolved.language !== (originalLanguage ?? '')) {
      return { servedLanguage: resolved.language, originalLanguage: originalLanguage ?? '' };
    }
  }
  for (const object of sceneTextObjects(document)) {
    const resolved = resolveSceneText({ object, preferredLanguages: prism });
    if (resolved.translated) return { servedLanguage: resolved.language, originalLanguage: object.locale ?? '' };
  }
  return null;
}
