import { storyTranslatableTexts } from './storyEffectsV3';

/**
 * Composition du `content` d'une story à partir des textes posés sur le canvas.
 *
 * ## L'intention d'origine est RÉVOQUÉE (directive porteur 2026-08-30, #4502)
 *
 * Ce module s'ouvrait sur cette phrase :
 *
 * > « Une story faite d'overlays n'a pas de légende : son `content` n'existe
 * > que comme index de recherche, produit par la concaténation des
 * > `textObjects`. »
 *
 * Elle a fondé une écriture — `PostService.createPost` remplissait `content`
 * avec la concaténation — que le porteur a explicitement retirée :
 *
 * > « C'est le texte de scène recopié, et c'est ce que je ne veux pas ! Il ne
 * > faut plus recopier le texte de scène pour mettre dans le contenu ! Pour la
 * > notification on peut récolter les textes de scène si le contenu est vide,
 * > mais sinon on référence le contenu réel. »
 *
 * Le symptôme : les trois lecteurs rendaient le texte DEUX fois — l'objet sur
 * le canvas, et sa copie en légende. Le lecteur ne faisait rien de faux ; il
 * rendait fidèlement un contenu qui n'aurait pas dû être écrit.
 *
 * **La phrase révoquée est citée ici, et pas simplement effacée**, parce que
 * c'est elle qui a coûté à l'issue le temps qu'elle a mis à trouver son site :
 * un commentaire qui explique POURQUOI le code fait quelque chose se lit comme
 * une raison de ne pas y toucher, et celui-ci justifiait avec assurance une
 * décision déjà annulée. L'effacer laisserait le prochain lecteur redécouvrir
 * la question sans savoir qu'elle a été tranchée.
 *
 * ## Ce que ces fonctions font MAINTENANT
 *
 * Elles DÉRIVENT, à la demande, et rien n'est plus persisté dans `content` :
 *
 * - `composeStoryContent` sert les signaux qui ont besoin d'un texte quand
 *   l'auteur n'a pas écrit de légende (`postSignalText`) ;
 * - `composeStoryContentForLanguage` sert la traduction du dérivé — chaque
 *   overlay porte sa traduction, le `content` d'une langue est leur assemblage.
 *   Traduire le `content` pour lui-même en faisait une SECONDE source, qui
 *   divergeait de la première dès que l'un des deux pipelines bronchait — six
 *   langues sur le `content` et zéro sur les overlays, constaté en production
 *   le 2026-07-27 ;
 * - `isContentDerivedFromTextObjects` reconnaît les stories DÉJÀ publiées, dont
 *   le `content` porte l'index et qu'aucune correction d'écriture ne réécrira.
 *   Son miroir client est `StoryDerivedContent` (SDK Swift).
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

/**
 * **Le texte qui alimente les SIGNAUX d'un post** — l'aperçu d'une notification
 * d'ami, l'extraction des hashtags.
 *
 * Ces deux consommateurs lisaient le `content` RECOPIÉ. La recopie retirée
 * (#4502), ils doivent dériver eux-mêmes, sinon :
 *
 * | consommateur | ce qu'il perdrait |
 * |---|---|
 * | l'aperçu de notification | la bannière retomberait sur « a publié une nouvelle story » |
 * | l'extraction des hashtags | un `#voyage` posé sur la scène cesserait d'être indexé |
 *
 * Le second n'était dans AUCUNE liste de consommateurs dressée avant le lot. Il
 * n'apparaît pas quand on cherche « qui lit `content` » : il lit `postContent`,
 * une variable locale de la route, deux cents lignes après son affectation.
 * C'est pourquoi la dérivation est une FONCTION et pas deux expressions en
 * ligne — un troisième consommateur s'y branchera au lieu de rouvrir la
 * question.
 *
 * **Le contenu de l'auteur gagne toujours**, et on ne concatène jamais les
 * deux : c'est la seconde moitié de la directive — « sinon on référence le
 * contenu réel » — et concaténer referait le doublon qu'on vient de retirer.
 *
 * `undefined` ⇒ ni légende ni texte de scène : le signal n'a rien à porter, et
 * ses consommateurs ont chacun leur repli (la phrase d'action pour la bannière,
 * aucun hashtag pour l'index).
 */
export function postSignalText(params: {
  content?: string | null;
  storyEffects?: unknown;
}): string | undefined {
  const written = nonEmpty(params.content);
  if (written) return written;
  // `storyTranslatableTexts` connaît les DEUX formes — v1 `textObjects` et v3
  // `scenes[].objects[kind=text]`. La recopier ici l'aurait fait diverger, et
  // le composer v3 est justement celui qui produit ces stories.
  return nonEmpty(composeStoryContent(storyTranslatableTexts(params.storyEffects)));
}
