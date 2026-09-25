import { buildPostTranslationRecord } from '@meeshy/shared/utils/conversation-helpers';
import { normalizeLanguageForDedup } from '@meeshy/shared/utils/language-normalize';

import type { CanvasDocument } from '@/lib/canvas/document';
import { resolveSceneText } from '@/lib/canvas/text';
import { resolveStoryCaption } from '@/lib/stories/caption';

/**
 * **LA LOI DE DISPONIBILITÉ D'UNE STORY** (#7114, § 5.1 de la spécification)
 * — miroir de `StoryTextLanguageAvailability.swift`
 * (`packages/MeeshySDK/.../StoryTextLanguageAvailability.swift`) : le CANVAS
 * compte, exactement comme la légende (correction iOS du 2026-07-25) — une
 * story de scène sans légende reste traduisible par ses objets texte.
 */

const isPlainRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Les langues d'une carte `{ langue: texte }` DÉJÀ PLATE (un objet de
 * scène) — non vides, jamais dépouillées par `buildPostTranslationRecord`
 * (réservé à la forme `{ langue: { text } }` d'un post, `caption.ts`). */
function flatTranslationLanguages(translations: unknown): readonly string[] {
  if (!isPlainRecord(translations)) return [];
  return Object.entries(translations)
    .filter(([, text]) => typeof text === 'string' && text.trim() !== '')
    .map(([language]) => language);
}

/** Les langues des objets TEXTE non blancs d'une scène — leur langue
 * d'origine (`object.locale`) ET celles de leurs traductions. */
function sceneObjectLanguages(document: CanvasDocument | null): readonly string[] {
  if (document === null) return [];
  const languages: string[] = [];
  for (const scene of document.scenes) {
    for (const object of scene.objects) {
      if (object.kind !== 'text') continue;
      const text = typeof object.payload.text === 'string' ? object.payload.text : '';
      if (text.trim() === '') continue;
      if (object.locale !== undefined) languages.push(object.locale);
      languages.push(...flatTranslationLanguages(object.payload.translations));
    }
  }
  return languages;
}

/**
 * L'union des langues disponibles — légende (`Post.content` + `translations`)
 * ET canvas —, normalisées en base ISO 639-1 minuscule et TRIÉES. Une entrée
 * dupliquée après normalisation (`fr-FR`, `FR`, `fr`) n'apparaît qu'une fois.
 */
export function availableStoryLanguages(params: {
  readonly content: string | null | undefined;
  readonly originalLanguage: string | null | undefined;
  readonly translations: unknown;
  readonly document: CanvasDocument | null;
}): readonly string[] {
  const { content, originalLanguage, translations, document } = params;
  const raw: string[] = [];
  if (typeof content === 'string' && content.trim() !== '') {
    if (typeof originalLanguage === 'string' && originalLanguage.trim() !== '') raw.push(originalLanguage);
    raw.push(...Object.keys(buildPostTranslationRecord(translations)));
  }
  raw.push(...sceneObjectLanguages(document));

  const canonical = new Map<string, string>();
  for (const language of raw) {
    const key = normalizeLanguageForDedup(language);
    if (!canonical.has(key)) canonical.set(key, key);
  }
  return [...canonical.values()].sort();
}

/** `hasTranslatableText` (`StoryTextLanguageAvailability.swift`) — une légende
 * non blanche OU un objet texte non blanc. */
export function hasTranslatableStoryText(params: {
  readonly content: string | null | undefined;
  readonly document: CanvasDocument | null;
}): boolean {
  const { content, document } = params;
  if (typeof content === 'string' && content.trim() !== '') return true;
  if (document === null) return false;
  return document.scenes.some((scene) =>
    scene.objects.some(
      (object) => object.kind === 'text' && typeof object.payload.text === 'string' && object.payload.text.trim() !== '',
    ),
  );
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

  if (typeof content === 'string' && content.trim() !== '') {
    const resolved = resolveStoryCaption({ preferredLanguages: prism, originalLanguage, translations, content });
    if (resolved !== null && resolved.language !== (originalLanguage ?? '')) {
      return { servedLanguage: resolved.language, originalLanguage: originalLanguage ?? '' };
    }
  }

  if (document === null) return null;
  for (const scene of document.scenes) {
    for (const object of scene.objects) {
      if (object.kind !== 'text') continue;
      const resolved = resolveSceneText({ object, preferredLanguages: prism });
      if (resolved.translated) return { servedLanguage: resolved.language, originalLanguage: object.locale ?? '' };
    }
  }
  return null;
}

