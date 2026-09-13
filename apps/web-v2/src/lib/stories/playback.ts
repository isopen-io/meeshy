/**
 * LA LECTURE D'UNE STORY — lois PURES, miroir vecteur à vecteur de la
 * référence iOS (#5817, D-1) :
 *
 *   `StoryViewerView+Content.swift:792-828` (durée de slide, 6 s),
 *   `StoryModels.swift:1731-1757` (expiration, 20 h — SSOT serveur
 *   `ephemeralPosts.ts`), `StoryContentPresence.swift:28-52` (« a-t-elle
 *   quoi que ce soit à restituer ? »), `StoryIndexResolver.swift:19-33`
 *   (résolution d'un post NOMMÉ, ASC `createdAt` — l'ordre de LECTURE),
 *   `StoryViewerView+Content.swift:457-500` (`goToNext`/`goToPrevious`),
 *   `StoryPlaybackSkipResolver.swift:37-99` (le saut des illisibles — le
 *   PROPRE groupe de l'auteur n'est JAMAIS sauté).
 *
 * Ce module ne connaît NI le DOM ni le réseau : `now` est TOUJOURS injecté
 * par l'appelant (même discipline que `relative-time.ts`, `lens/law.ts`) —
 * c'est ce qui le rend éprouvable sans horloge réelle ni minuteur en vol.
 */

/** `defaultSlideDuration` (`StoryViewerView+Content.swift:792-828`) — parité
 * Instagram/Snapchat, abaissée depuis 12 s. Le média a sa PROPRE durée (hors
 * périmètre #5817 — story TEXTE et IMAGE seulement). */
export const DEFAULT_SLIDE_DURATION_MS = 6000;

/** `defaultExpiryInterval` (`StoryModels.swift:1731-1757`) — 20 heures,
 * utilisé seulement quand `expiresAt` est absent du corpus servi. */
export const STORY_EXPIRY_MS = 20 * 60 * 60 * 1000;

export type StoryPlaybackAuthor = {
  readonly id: string;
  readonly username?: string;
  readonly displayName?: string;
  readonly firstName?: string;
  readonly lastName?: string;
  readonly avatar?: string;
};

export type StoryPlaybackMedia = {
  readonly id: string;
  readonly url?: string;
  readonly thumbnailUrl?: string;
  readonly mimeType?: string;
};

/** La forme MINIMALE qu'une story doit porter pour se lire — un sous-ensemble
 * de `StoryFeedPost` (`lib/api/stories.ts`), pour que ce module reste
 * éprouvable sans dépendre de la forme complète du fil réseau. */
export type StoryPlaybackStory = {
  readonly id: string;
  readonly author?: StoryPlaybackAuthor;
  readonly content?: string | null;
  readonly originalLanguage?: string | null;
  readonly translations?: unknown;
  readonly storyEffects?: { readonly background?: string | null } | null;
  readonly media?: readonly StoryPlaybackMedia[];
  readonly createdAt: string | Date;
  readonly expiresAt?: string | Date | null;
  readonly isViewedByMe?: boolean;
};

export type StoryPlaybackGroup = {
  readonly authorId: string;
  readonly author: StoryPlaybackAuthor | undefined;
  /** ASC `createdAt` — l'ordre de LECTURE, jamais l'ordre d'affichage du rail
   * (qui trie DESC, `lib/view/story-tray.ts`). */
  readonly stories: readonly StoryPlaybackStory[];
  /** Vrai pour le groupe du lecteur lui-même — jamais sauté par
   * {@link resolvePlayablePosition}, même expiré (il relit ses réactions). */
  readonly isMine: boolean;
  readonly hasUnseen: boolean;
  readonly latestAt: number;
};

export type StoryPlaybackPosition = { readonly groupIndex: number; readonly storyIndex: number };

function timeOf(value: string | Date | undefined | null): number {
  if (value === undefined || value === null) return 0;
  const date = value instanceof Date ? value : new Date(value);
  const ms = date.getTime();
  return Number.isNaN(ms) ? 0 : ms;
}

/** `isExpired(at:)` (`StoryModels.swift:1731-1757`) : `expiresAt` explicite
 * prime ; à défaut, `createdAt + 20h`. */
export function isStoryExpired(story: Pick<StoryPlaybackStory, 'createdAt' | 'expiresAt'>, now: number): boolean {
  if (story.expiresAt !== undefined && story.expiresAt !== null) {
    return timeOf(story.expiresAt) <= now;
  }
  return timeOf(story.createdAt) + STORY_EXPIRY_MS <= now;
}

/** `StoryContentPresence.hasRenderableContent` (`StoryContentPresence.swift:28-52`)
 * — réduit au périmètre TEXTE + IMAGE de #5817 (`content`, `media`,
 * `storyEffects.background`) : les autres formes (audio, dessins, stickers)
 * sont des compagnons hors tranche. */
export function hasRenderableStoryContent(
  story: Pick<StoryPlaybackStory, 'content' | 'media' | 'storyEffects'>,
): boolean {
  if (story.content !== undefined && story.content !== null && story.content.trim() !== '') return true;
  if (story.media !== undefined && story.media.length > 0) return true;
  const background = story.storyEffects?.background;
  if (background !== undefined && background !== null && background !== '') return true;
  return false;
}

/**
 * `toStoryGroups` (`StoryModels.swift:2013-2025`) — LA MÊME loi de groupe et
 * de tri que `groupStoriesByAuthor` (`lib/view/story-tray.ts`) : moi, puis le
 * non-vu, puis le vu, chaque groupe trié par sa story la plus RÉCENTE.
 *
 * CE QUI DIFFÈRE DE `groupStoriesByAuthor`, et c'est le seul écart : les
 * stories DANS un groupe sont ASC (la plus ANCIENNE d'abord) — l'ordre de
 * LECTURE (`StoryIndexResolver.swift:19-33`), jamais l'ordre d'affichage du
 * rail. Deux lois de tri pour deux usages ; les fusionner ferait lire le
 * plateau à l'envers ou jouer le fil à rebours.
 */
export function groupForPlayback(
  stories: readonly StoryPlaybackStory[],
  options: { readonly viewerId: string | undefined },
): readonly StoryPlaybackGroup[] {
  const byAuthor = new Map<string, StoryPlaybackStory[]>();
  for (const story of stories) {
    const authorId = story.author?.id;
    if (authorId === undefined) continue;
    const existing = byAuthor.get(authorId);
    if (existing === undefined) byAuthor.set(authorId, [story]);
    else existing.push(story);
  }

  const groups: StoryPlaybackGroup[] = [];
  for (const [authorId, lot] of byAuthor) {
    const ascending = [...lot].sort((a, b) => timeOf(a.createdAt) - timeOf(b.createdAt));
    groups.push({
      authorId,
      author: ascending[ascending.length - 1]?.author,
      stories: ascending,
      isMine: options.viewerId !== undefined && authorId === options.viewerId,
      hasUnseen: ascending.some((s) => !(s.isViewedByMe ?? false)),
      latestAt: timeOf(ascending[ascending.length - 1]?.createdAt),
    });
  }

  return groups.sort((a, b) => {
    if (a.isMine !== b.isMine) return a.isMine ? -1 : 1;
    if (a.hasUnseen !== b.hasUnseen) return a.hasUnseen ? -1 : 1;
    return b.latestAt - a.latestAt;
  });
}

/**
 * **L'ORDRE DE LECTURE NE BOUGE PAS SOUS LE LECTEUR** (#5817, revue-correction).
 *
 * {@link groupForPlayback} classe les groupes « moi, puis le NON VU, puis le
 * vu » — un rang qui dépend de `isViewedByMe`, c'est-à-dire d'une donnée que
 * la lecture elle-même FAIT CHANGER. Tout rafraîchissement du corpus pendant
 * la lecture (retour de focus fenêtre, `refetch()` après une erreur) reclasse
 * donc les groupes SOUS le lecteur : le groupe qu'on vient de finir tombe en
 * queue, `nextPosition` ne trouve plus de groupe après lui et rend `'close'`
 * — le lecteur se FERME au lieu de passer à l'auteur suivant. Défaut
 * invisible sur fixtures (le corpus bouchonné ne change jamais), certain sur
 * la passerelle.
 *
 * La lecture fige donc l'ordre des AUTEURS à l'ouverture et le ré-applique à
 * chaque corpus reçu ; un auteur apparu depuis (une story publiée pendant la
 * lecture) se range à la suite, dans l'ordre frais — `Array.sort` étant
 * stable, aucun rang inconnu ne se réordonne entre eux. Le CONTENU, lui,
 * reste frais : seul le rang est gelé.
 */
export function stableGroupOrder(
  groups: readonly StoryPlaybackGroup[],
  frozenAuthorIds: readonly string[],
): readonly StoryPlaybackGroup[] {
  if (frozenAuthorIds.length === 0) return groups;
  const rank = new Map(frozenAuthorIds.map((id, index) => [id, index] as const));
  return [...groups].sort(
    (a, b) =>
      (rank.get(a.authorId) ?? Number.POSITIVE_INFINITY) - (rank.get(b.authorId) ?? Number.POSITIVE_INFINITY),
  );
}

/**
 * `entryStory`/`entryIndex` (`StoryViewerView.swift:446-462`) : première NON
 * VUE non expirée, sinon première non expirée, sinon 0.
 */
export function entryIndexFor(group: StoryPlaybackGroup, now: number): number {
  const playable = (s: StoryPlaybackStory) => !isStoryExpired(s, now);
  const firstUnviewedPlayable = group.stories.findIndex((s) => playable(s) && !(s.isViewedByMe ?? false));
  if (firstUnviewedPlayable !== -1) return firstUnviewedPlayable;
  const firstPlayable = group.stories.findIndex(playable);
  if (firstPlayable !== -1) return firstPlayable;
  return 0;
}

/**
 * `targetingStory(postId)` (`StoryViewerRequestOrigin.swift:18-49`) — un
 * CONTENU nommé (lien, tuile du rail avec son entrée déjà calculée) commence
 * À cette story. `StoryIndexResolver.resolve` cherche dans `group.stories`,
 * ASC — l'ordre que {@link groupForPlayback} produit déjà.
 */
export function resolvePosition(groups: readonly StoryPlaybackGroup[], postId: string): StoryPlaybackPosition | null {
  for (let groupIndex = 0; groupIndex < groups.length; groupIndex++) {
    const storyIndex = groups[groupIndex]!.stories.findIndex((s) => s.id === postId);
    if (storyIndex !== -1) return { groupIndex, storyIndex };
  }
  return null;
}

export function currentStoryAt(
  groups: readonly StoryPlaybackGroup[],
  position: StoryPlaybackPosition,
): StoryPlaybackStory | undefined {
  return groups[position.groupIndex]?.stories[position.storyIndex];
}

/**
 * `goToNext()` (`StoryViewerView+Content.swift:457-483`) : story suivante du
 * groupe ; sinon groupe suivant à SON `entryIndex` ; sinon `'close'`
 * (`dismissViewer()`).
 */
export function nextPosition(
  groups: readonly StoryPlaybackGroup[],
  position: StoryPlaybackPosition,
  now: number,
): StoryPlaybackPosition | 'close' {
  const group = groups[position.groupIndex];
  if (group === undefined) return 'close';
  if (position.storyIndex + 1 < group.stories.length) {
    return { groupIndex: position.groupIndex, storyIndex: position.storyIndex + 1 };
  }
  const nextGroup = groups[position.groupIndex + 1];
  if (nextGroup === undefined) return 'close';
  return { groupIndex: position.groupIndex + 1, storyIndex: entryIndexFor(nextGroup, now) };
}

/**
 * `goToPrevious()` (`StoryViewerView+Content.swift:485-500`) : story
 * précédente ; sinon groupe précédent à sa DERNIÈRE story ; sinon `null`
 * (rien — le premier groupe ne recule pas).
 */
export function previousPosition(
  groups: readonly StoryPlaybackGroup[],
  position: StoryPlaybackPosition,
): StoryPlaybackPosition | null {
  if (position.storyIndex - 1 >= 0) return { groupIndex: position.groupIndex, storyIndex: position.storyIndex - 1 };
  const previousGroup = groups[position.groupIndex - 1];
  if (previousGroup === undefined) return null;
  return { groupIndex: position.groupIndex - 1, storyIndex: previousGroup.stories.length - 1 };
}

function isPlayable(story: StoryPlaybackStory, now: number): boolean {
  return !isStoryExpired(story, now) && hasRenderableStoryContent(story);
}

/**
 * `StoryPlaybackSkipResolver.resolve` (`:37-99`) — depuis `position`, saute
 * les stories ILLISIBLES (expirée OU sans contenu restituable) en avançant
 * comme {@link nextPosition}, JUSQU'À une story lisible ou la fin de la
 * liste. **Le propre groupe de l'auteur (`isMine`) n'est jamais sauté** — il
 * relit ses réactions même après expiration. `'close'` seulement quand la
 * liste entière est épuisée (jamais après un seul groupe).
 */
export function resolvePlayablePosition(
  groups: readonly StoryPlaybackGroup[],
  position: StoryPlaybackPosition,
  now: number,
): StoryPlaybackPosition | 'close' {
  const totalStories = groups.reduce((n, g) => n + g.stories.length, 0);
  let cursor: StoryPlaybackPosition | 'close' = position;
  for (let i = 0; i <= totalStories; i++) {
    if (cursor === 'close') return 'close';
    const group = groups[cursor.groupIndex];
    const story = group?.stories[cursor.storyIndex];
    if (group === undefined || story === undefined) return 'close';
    if (group.isMine || isPlayable(story, now)) return cursor;
    cursor = nextPosition(groups, cursor, now);
  }
  return 'close';
}
