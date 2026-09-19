import { parseCanvasDocument, type CanvasScene } from '@/lib/canvas/document';

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
 * Instagram/Snapchat, abaissée depuis 12 s. C'est un PLANCHER, jamais la
 * réponse : `slideDurationMs` ci-dessous élit la durée réelle (#6836). */
export const DEFAULT_SLIDE_DURATION_MS = 6000;

const dureeUtileOuNull = (value: number | null | undefined): number | null =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;

/**
 * `slideDurationMs` — LA DURÉE D'UNE DIAPOSITIVE (#6836). PORTAGE de la loi
 * iOS, déclarée « SINGLE SOURCE OF TRUTH » dans
 * `StoryViewerView+Content.swift` — rien n'est conçu ici :
 *
 *     max(durée du média, durée configurée, 6 s),
 *     puis arrondie au multiple SUPÉRIEUR de la période du média,
 *     « pour que la vidéo/audio bg ne soit JAMAIS coupée au milieu d'un cycle »
 *
 * Spécification porteur du 2026-05-27, citée par le même fichier : slide
 * statique ⇒ 6 s ; slide avec vidéo ou audio ⇒ durée du média, **loopé si
 * < 6 s** ; `storyEffects.slideDuration` prime quand > 0.
 *
 * L'ARRONDI est ce qui distingue cette loi d'un simple `max`, et c'est lui
 * qu'on oublie : un clip de 4 s sous un plancher de 6 s donne **8 s**, deux
 * cycles entiers — 6 s couperaient la seconde boucle en plein milieu.
 *
 * Le défaut corrigé avait DEUX faces, mesurées au navigateur sur
 * `/story/st-video` le 2026-09-16 : un clip de 3 s gelait sur sa dernière
 * trame pendant que la barre poursuivait jusqu'à 100 %, et un clip plus long
 * que 6 s aurait été COUPÉ — c'est exactement ce qu'iOS dit avoir corrigé
 * chez lui (« avant ce fix, `effects.slideDuration` early-returned et les
 * médias plus longs que la durée configurée étaient coupés »).
 *
 * La durée du média est REÇUE, jamais lue : `StoryTrayMedia` n'en sert aucune
 * (`api/stories.ts` — id, url, thumbnailUrl, mimeType), donc elle vient du
 * `<video>` à `loadedmetadata`. Même discipline que `now` dans ce module —
 * ce qui vient du monde est injecté par l'appelant, et c'est ce qui rend
 * cette loi éprouvable sans DOM.
 *
 * Une durée ABSURDE (nulle, négative, `NaN`, infinie — toutes servies par un
 * `HTMLMediaElement` selon l'état du décodage) se rabat sur le plancher : un
 * `Math.ceil(x / 0)` rendrait `Infinity`, donc une diapositive qui ne finit
 * jamais.
 */
export function slideDurationMs(params: {
  readonly mediaDurationMs?: number | null | undefined;
  readonly configuredMs?: number | null | undefined;
}): number {
  const media = dureeUtileOuNull(params.mediaDurationMs);
  const configuree = dureeUtileOuNull(params.configuredMs);
  const plancher = Math.max(media ?? 0, configuree ?? 0, DEFAULT_SLIDE_DURATION_MS);

  return media === null ? plancher : Math.ceil(plancher / media) * media;
}

/**
 * `slideDurationForScene` (T4, #6899) — la durée d'une diapositive de SCÈNE,
 * miroir de `StorySlide.computedTotalDuration()` (`StoryModels.swift:862-872`) :
 *
 * - **PRIORITÉ 0, l'épingle de la timeline** — `timelineDuration` (SECONDES,
 *   `canvas-v3.ts:146`) positif est AUTORITAIRE : « elle gagne sur le contenu
 *   (un média plus long est rogné) ». Ni plancher de 6 s, ni arrondi aux
 *   cycles : c'est la durée que l'auteur a posée dans l'éditeur.
 * - sinon, la loi du CONTENU {@link slideDurationMs}, inchangée.
 *
 * Ce n'est PAS `configuredMs` : celui-ci porte la sémantique du LEGACY
 * `slideDuration` (un plancher, arrondi aux cycles du média), qu'iOS a
 * justement distinguée d'une épingle de timeline — les confondre faisait
 * durer 30 s sur le web une story épinglée à 8 s sur une piste de 30 s.
 */
export function slideDurationForScene(params: {
  readonly scene: Pick<CanvasScene, 'timelineDuration'>;
  readonly mediaDurationMs?: number | null | undefined;
}): number {
  const pinned = dureeUtileOuNull(params.scene.timelineDuration);
  return pinned !== null ? pinned * 1000 : slideDurationMs({ mediaDurationMs: params.mediaDurationMs });
}

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
  /** La clé que la passerelle SERT (`mediaSelect.fileUrl`,
   * `services/posts/postIncludes.ts:104`, mesuré sur
   * `gate.staging.meeshy.me` le 2026-09-17). `url` est l'ancienne clé des
   * fixtures, qu'aucune réponse réelle ne porte : lue seule, elle laissait
   * toute story à média SANS image hors fixtures. {@link storyMediaUrl} lit
   * les deux. */
  readonly fileUrl?: string | null;
  readonly url?: string;
  readonly thumbnailUrl?: string | null;
  readonly mimeType?: string | null;
  readonly width?: number | null;
  readonly height?: number | null;
  readonly thumbHash?: string | null;
  /**
   * **LA LÉGENDE PROPRE DU MÉDIA** (#6944) — `PostMedia.caption`, avec sa
   * langue source et ses traductions. Le TROISIÈME contenu du dépôt : ni
   * `Post.content` (que `caption.ts` résout déjà pour cette même story), ni
   * `alt`. La passerelle les SERT depuis toujours sur une story
   * (`trayStorySelect` → `mediaInclude` → `mediaSelect`,
   * `postIncludes.ts:111-118`) ; c'est ce type qui ne les déclarait pas, donc
   * le décodeur les jetait et aucune légende de média n'atteignait le lecteur.
   */
  readonly caption?: string | null;
  readonly captionLanguage?: string | null;
  readonly captionTranslations?: unknown;
};

/** L'adresse d'un média de story — `fileUrl` (la passerelle), sinon `url`
 * (fixtures historiques) ; `''` quand aucune n'est servie. SITE UNIQUE : le
 * chemin v1 et le porteur de scène (`lib/stories/carrier.ts`) la lisent ici. */
export function storyMediaUrl(media: Pick<StoryPlaybackMedia, 'fileUrl' | 'url'>): string {
  if (typeof media.fileUrl === 'string' && media.fileUrl !== '') return media.fileUrl;
  return typeof media.url === 'string' ? media.url : '';
}

/** La forme MINIMALE qu'une story doit porter pour se lire — un sous-ensemble
 * de `StoryFeedPost` (`lib/api/stories.ts`), pour que ce module reste
 * éprouvable sans dépendre de la forme complète du fil réseau. */
export type StoryPlaybackStory = {
  readonly id: string;
  readonly author?: StoryPlaybackAuthor;
  readonly content?: string | null;
  readonly originalLanguage?: string | null;
  readonly translations?: unknown;
  /** `unknown` (#6899, T8) — un fond v1 (`{ background }`) OU un document
   * canvas v3 (`{ v: 3, scenes: […] }`) : `storyEffectsBackgroundOf` et
   * `parseCanvasDocument` (`lib/canvas/document.ts`) sont les DEUX portes
   * d'accès, jamais une lecture directe de champ. */
  readonly storyEffects?: unknown;
  readonly media?: readonly StoryPlaybackMedia[];
  readonly createdAt: string | Date;
  readonly expiresAt?: string | Date | null;
  readonly isViewedByMe?: boolean;
  /** LE RAIL D'ACTIONS lit ces trois-là, et RIEN d'autre du réseau : la loi
   * (`lib/stories/action-rail.ts`) décide du jeu de boutons depuis le corpus
   * DÉJÀ EN MAIN — « aucune résolution réseau n'est nécessaire pour décider
   * du set » (`StoryViewerView+Sidebar.swift:24-26`). */
  readonly commentCount?: number | null;
  readonly reactionCount?: number | null;
  readonly currentUserReactions?: readonly string[] | null;
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

const isPlainRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

/** Le fond v1 (`StoryFeedEffects.background`) d'un `storyEffects` de forme
 * INCONNUE — `undefined` sur tout ce qui n'est pas un fond v1 exploitable
 * (y compris un document v3, que {@link parseCanvasDocument} lit à sa place). */
export function storyEffectsBackgroundOf(storyEffects: unknown): string | null | undefined {
  if (!isPlainRecord(storyEffects)) return undefined;
  const background = storyEffects.background;
  return typeof background === 'string' || background === null ? background : undefined;
}

/** `StoryContentPresence.hasRenderableContent` (`StoryContentPresence.swift:28-52`)
 * — périmètre TEXTE + IMAGE de #5817 (`content`, `media`,
 * `storyEffects.background`), ÉTENDU (#6899, T8) à une scène de document
 * canvas v3 qui montre quelque chose : sans cette extension, une story dont
 * la SEULE matière est un objet de scène (texte, media…) sans `content` de
 * post ni `media` de post était jugée VIDE et SAUTÉE par
 * {@link resolvePlayablePosition} — alors que `parseCanvasDocument` (O3) l'a
 * déjà jugée non vide en refusant tout document sans scène. */
export function hasRenderableStoryContent(
  story: Pick<StoryPlaybackStory, 'content' | 'media' | 'storyEffects'>,
): boolean {
  if (story.content !== undefined && story.content !== null && story.content.trim() !== '') return true;
  if (story.media !== undefined && story.media.length > 0) return true;
  if (parseCanvasDocument(story.storyEffects) !== null) return true;
  const background = storyEffectsBackgroundOf(story.storyEffects);
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
