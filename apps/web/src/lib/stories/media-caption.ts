import { resolveMediaCaption } from '@/lib/api/prism';

import type { StoryPlaybackMedia } from './playback';

/**
 * **LA LÉGENDE D'UN MÉDIA DE STORY** (#6944) — `PostMedia.caption`, le
 * TROISIÈME contenu du dépôt : ni `Post.content` (le corps de la
 * publication), ni `alt` (l'accessibilité). La directive porteur du
 * 2026-09-17 le dit d'une phrase : « une story n'a pas de `content` mais
 * l'image ou la vidéo de fond peut avoir une légende ».
 *
 * **Deux règles que ce module tient, et une qu'il refuse :**
 *
 *  - il DESCEND le Prisme par le site existant (`resolveMediaCaption`,
 *    `lib/api/prism.ts`), jamais une boucle réécrite — c'est la réécriture
 *    qui a produit trois familles divergentes en trois cycles (CLAUDE.md
 *    § Prisme) ;
 *  - il rend la PAIRE texte + langue, pour que l'hôte pose son `lang=` : un
 *    texte français prononcé par une voix anglaise est le défaut du cycle 122
 *    rendu audible ;
 *  - il n'applique PAS `isDerivedCaption` (`caption.ts`). Cette règle-là
 *    efface un `Post.content` qui n'est que la concaténation des calques de
 *    la scène ; une légende de média a SON sujet — le média —, et y redire le
 *    texte de la scène est un choix de l'auteur, pas un doublon à masquer.
 */
export type ServedMediaCaption = { readonly text: string; readonly language: string; readonly translated: boolean };

/** Ce qu'une légende porte sur le wire — la forme de `mediaSelect`
 * (`services/gateway/src/services/posts/postIncludes.ts:111-118`), servie sur
 * une story par `trayStorySelect` → `mediaInclude`. */
export type StoryMediaCaptionFields = Pick<StoryPlaybackMedia, 'caption' | 'captionLanguage' | 'captionTranslations'>;

/** La borne du contrat serveur (`CreatePostSchema.mediaCaption`,
 * `services/gateway/src/routes/posts/types.ts:282` — `z.string().max(1000)`).
 * Un corps qui la dépasse est refusé ENTIER : mieux vaut tailler ici que
 * perdre la publication. */
export const MEDIA_CAPTION_MAX = 1000;

export function resolveStoryMediaCaption(params: {
  readonly media: StoryMediaCaptionFields | undefined;
  readonly preferredLanguages: readonly string[];
}): ServedMediaCaption | null {
  const caption = params.media?.caption;
  // Une pièce SANS légende n'a rien à résoudre : `resolveMediaCaption` sur une
  // chaîne vide rendrait un `language` trompeur — l'original vide « servi »
  // dans la langue du lecteur (même garde que `card-model.ts`, #6280).
  if (typeof caption !== 'string' || caption.trim() === '') return null;
  const served = resolveMediaCaption({
    preferredLanguages: params.preferredLanguages,
    captionLanguage: params.media?.captionLanguage,
    captionTranslations: params.media?.captionTranslations,
    caption,
  });
  return { text: served.text, language: served.language, translated: served.translated };
}

/**
 * LA CARTE `{ postMediaId → texte }` que `POST /api/v1/posts` attend
 * (`mediaCaption`, `routes/posts/types.ts:282`) — `undefined` quand aucune
 * légende n'est écrite, **jamais une carte vide posée quand même** : la
 * passerelle ignore toute clé absente de `mediaIds`, et une entrée vide
 * écraserait une légende par du vide.
 *
 * Un média sans identité SERVEUR ne peut rien porter : la passerelle
 * l'ignorerait en silence.
 */
export function storyMediaCaptionPayload(
  entries: readonly { readonly postMediaId?: string | undefined; readonly caption?: string | undefined }[],
): Record<string, string> | undefined {
  const pairs = entries.flatMap(({ postMediaId, caption }) => {
    if (postMediaId === undefined || postMediaId === '' || caption === undefined) return [];
    const trimmed = caption.trim().slice(0, MEDIA_CAPTION_MAX);
    return trimmed === '' ? [] : [[postMediaId, trimmed] as const];
  });
  return pairs.length === 0 ? undefined : Object.fromEntries(pairs);
}
