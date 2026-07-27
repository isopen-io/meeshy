/**
 * Composition du `content` d'une story à partir des textes posés sur le canvas.
 *
 * Une story faite d'overlays n'a pas de légende : son `content` n'existe que
 * comme index de recherche, produit par la concaténation des `textObjects`.
 * Le traduire pour lui-même en faisait une SECONDE source, qui divergeait de la
 * première dès que l'un des deux pipelines bronchait — six langues sur le
 * `content` et zéro sur les overlays, constaté en production le 2026-07-27.
 *
 * Ici le `content` traduit redevient ce qu'il est : un dérivé. Chaque overlay
 * porte sa traduction, le `content` d'une langue est leur assemblage.
 */

/** Séparateur entre deux overlays dans l'index — un simple espace, comme à la
 *  création du post (`PostService.createPost`). */
const OVERLAY_SEPARATOR = ' ';

type StoryTextObjectLike = {
  text?: unknown;
  content?: unknown;
  translations?: unknown;
};

/**
 * Résolution canonique du texte d'un overlay.
 *
 * Le composer iOS encode le texte sous `text` ; `content` est l'alias legacy
 * pré-renommage, encore présent en base et accepté par le décodeur SDK. Lire la
 * mauvaise clé fait disparaître l'overlay de l'indexation, du tracking de liens
 * ET de la traduction — même famille de bug que celui déjà corrigé côté web
 * dans `apps/web/lib/story-transforms.ts`.
 */
export function storyTextObjectText(obj: StoryTextObjectLike): string | undefined {
  if (typeof obj.text === 'string') return obj.text;
  if (typeof obj.content === 'string') return obj.content;
  return undefined;
}

const asTextObjects = (textObjects: unknown): StoryTextObjectLike[] =>
  Array.isArray(textObjects) ? (textObjects as StoryTextObjectLike[]) : [];

const nonEmpty = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

/** Index de recherche original : les textes du canvas dans l'ordre. */
export function composeStoryContent(textObjects: unknown): string {
  return asTextObjects(textObjects)
    .map((obj) => storyTextObjectText(obj))
    .filter((text): text is string => !!text)
    .join(OVERLAY_SEPARATOR);
}

/**
 * `content` dérivé pour une langue donnée.
 *
 * Chaque overlay contribue sa traduction si elle existe, son texte original
 * sinon : une story est multilingue par nature — un overlay déjà écrit dans la
 * langue demandée n'a pas de traduction à offrir et ne doit pas pour autant
 * disparaître de l'index.
 *
 * Renvoie `null` tant qu'AUCUN overlay ne porte cette langue : sans traduction
 * à assembler, écrire le dérivé reviendrait à ranger l'original sous une
 * étiquette de langue qui ment.
 */
export function composeStoryContentForLanguage(
  textObjects: unknown,
  language: string,
): string | null {
  const objects = asTextObjects(textObjects);
  if (objects.length === 0) return null;

  let hasTranslation = false;
  const parts: string[] = [];

  for (const obj of objects) {
    const original = storyTextObjectText(obj);
    const translations = (obj.translations ?? null) as Record<string, unknown> | null;
    const translated = translations ? nonEmpty(translations[language]) : undefined;

    if (translated) {
      hasTranslation = true;
      parts.push(translated);
      continue;
    }
    if (original) parts.push(original);
  }

  if (!hasTranslation) return null;
  return parts.join(OVERLAY_SEPARATOR);
}

/**
 * Le `content` est-il l'index dérivé des overlays, ou une vraie légende ?
 *
 * Une légende écrite par l'auteur reste une source à part entière et garde son
 * propre pipeline de traduction ; seul l'index dérivé devient un assemblage.
 * Le test est structurel — pas de drapeau à maintenir en base : le `content`
 * dérivé EST, par construction, la concaténation des overlays.
 */
export function isContentDerivedFromTextObjects(
  content: string | null | undefined,
  textObjects: unknown,
): boolean {
  const trimmed = nonEmpty(content);
  if (!trimmed) return false;

  const composed = composeStoryContent(textObjects);
  if (!composed) return false;

  return trimmed === composed.trim();
}
