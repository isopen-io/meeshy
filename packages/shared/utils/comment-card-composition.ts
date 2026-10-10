import { MESSAGE_EFFECT_FLAGS } from '../types/message-effect-flags.js';

/**
 * **CE QU'« IMAGER » UN COMMENTAIRE DE POST MET SUR LA CARTE** (#9687,
 * jumelle web de #9686) — fonction PURE : la même source et le même choix
 * donnent toujours les mêmes blocs.
 *
 * Miroir EXACT de `PostCommentCardComposition`
 * (`packages/MeeshySDK/Sources/MeeshySDK/MessageCard/PostCommentCardComposition.swift`)
 * et de ses témoins : toute évolution de la règle touche les deux sites.
 *
 * Un commentaire de premier niveau : le post en tête puis le commentaire
 * (défaut), ou le commentaire seul. Une RÉPONSE : le fil jusqu'à elle (défaut),
 * le post puis la racine puis elle, ou les réponses choisies — l'ordre
 * chronologique gardé, la réponse visée toujours incluse et dernière. Dans
 * tous les modes, le post en tête se retire d'un toucher (`showsPost`).
 *
 * GARDES (fail-closed) : un commentaire protégé (éphémère, flouté, vue unique)
 * ou en vol ne s'image pas. Une réponse dont un ANCÊTRE est protégé ne s'image
 * dans aucun mode : elle le cite (la loi de la discussion, #9573). Une réponse
 * voisine protégée ou vide n'entre pas dans le fil. Un post qui disparaît
 * (story, statut, canvas de story) ou sans rien à montrer ne se met pas en tête.
 *
 * BORNES : le texte du post s'arrête à 4 lignes et 280 caractères, coupé au
 * mot ; au plus 6 blocs — au-delà, le milieu du fil se replie en « +N
 * réponses » ; au plus 4 médias, la vignette du post d'abord.
 *
 * Les TEXTES arrivent déjà SERVIS (le Prisme, ou l'original que la puce de
 * langue du commentaire visé demande) et les MÉDIAS déjà PEIGNABLES : la
 * composition ne décide que de l'ordre, des bornes et des gardes.
 */

export const POST_COMMENT_CARD_LIMITS = {
  maxPostLines: 4,
  maxPostCharacters: 280,
  maxBlocks: 6,
  maxMedia: 4,
} as const;

export type PostCommentCardMode = 'postAndComment' | 'commentAlone' | 'threadToHere' | 'postRootAndReply' | 'chosenReplies';

export type PostCommentCardMediaKind = 'image' | 'video' | 'audio';

export type PostCommentCardMediaLike = { readonly kind: PostCommentCardMediaKind };

export type PostCommentCardAuthor = {
  readonly id: string;
  readonly displayName?: string | null;
  readonly username?: string | null;
};

export type PostCommentCardComment<M extends PostCommentCardMediaLike> = {
  readonly id: string;
  readonly parentId: string | null;
  /** Epoch en millisecondes. */
  readonly createdAt: number;
  readonly effectFlags: number;
  /** Encore en vol : il n'a pas d'existence à partager. */
  readonly inFlight?: boolean;
  readonly author: PostCommentCardAuthor;
  /** Le texte SERVI. */
  readonly text: string;
  /** Les médias PEIGNABLES, dans leur ordre. */
  readonly media: readonly M[];
};

export type PostCommentCardPost<M extends PostCommentCardMediaLike> = {
  readonly type: string | null;
  /** Le post porte un canvas de story : il disparaît comme elle. */
  readonly hasStoryCanvas: boolean;
  readonly createdAt: number;
  readonly author: PostCommentCardAuthor;
  readonly text: string;
  readonly media: readonly M[];
};

export type PostCommentCardViewer = { readonly id: string; readonly displayName: string };

export type PostCommentCardSource<M extends PostCommentCardMediaLike> = {
  readonly post: PostCommentCardPost<M> | null;
  readonly target: PostCommentCardComment<M>;
  /** La racine et ses réponses chargées, dans n'importe quel ordre. */
  readonly thread: readonly PostCommentCardComment<M>[];
  readonly viewer: PostCommentCardViewer;
};

export type PostCommentCardPart = { readonly author: string; readonly text: string; readonly handle: string | null };

export type PostCommentCardBlock =
  | { readonly kind: 'post'; readonly part: PostCommentCardPart }
  | { readonly kind: 'comment'; readonly id: string; readonly part: PostCommentCardPart }
  | { readonly kind: 'folded'; readonly count: number };

export type PostCommentCardChoice = {
  readonly mode: PostCommentCardMode;
  readonly showsPost: boolean;
  readonly chosen?: ReadonlySet<string>;
};

export type PostCommentCardMediaAuthor = { readonly name: string; readonly handle: string | null; readonly quoted: boolean };

export type PostCommentCardSubject<M extends PostCommentCardMediaLike> = {
  readonly quoted: PostCommentCardPart | null;
  readonly reply: PostCommentCardPart;
  readonly sentAt: number;
  readonly quotedAt: number | null;
  readonly media: readonly { readonly media: M; readonly author: PostCommentCardMediaAuthor }[];
};

type Comment<M extends PostCommentCardMediaLike> = PostCommentCardComment<M>;
type Source<M extends PostCommentCardMediaLike> = PostCommentCardSource<M>;

const LIFECYCLE_MASK =
  MESSAGE_EFFECT_FLAGS.EPHEMERAL | MESSAGE_EFFECT_FLAGS.EPHEMERAL_AFTER_READ | MESSAGE_EFFECT_FLAGS.BLURRED | MESSAGE_EFFECT_FLAGS.VIEW_ONCE;

/** Le post est-il en tête quand on choisit ce mode ? */
export const postCommentCardShowsPostByDefault = (mode: PostCommentCardMode): boolean => mode === 'postAndComment' || mode === 'postRootAndReply';

const nonBlank = (value: string | null | undefined): string | null => {
  const trimmed = (value ?? '').trim();
  return trimmed === '' ? null : trimmed;
};

const isProtected = <M extends PostCommentCardMediaLike>(comment: Comment<M>): boolean => (comment.effectFlags & LIFECYCLE_MASK) !== 0;

const isPaintable = <M extends PostCommentCardMediaLike>(comment: Comment<M>): boolean =>
  !isProtected(comment) && comment.inFlight !== true && (nonBlank(comment.text) !== null || comment.media.length > 0);

const byId = <M extends PostCommentCardMediaLike>(thread: readonly Comment<M>[]): ReadonlyMap<string, Comment<M>> =>
  thread.reduce((known, comment) => (known.has(comment.id) ? known : new Map(known).set(comment.id, comment)), new Map<string, Comment<M>>());

/** La chaîne des ancêtres, de la racine au parent direct — `null` quand un maillon manque. */
function ancestors<M extends PostCommentCardMediaLike>(source: Source<M>): readonly Comment<M>[] | null {
  const known = byId(source.thread);
  const walk = (next: string | null, chain: readonly Comment<M>[]): readonly Comment<M>[] | null => {
    if (next === null) return chain;
    const parent = known.get(next);
    if (parent === undefined || next === source.target.id || chain.some((link) => link.id === next)) return null;
    return walk(parent.parentId, [parent, ...chain]);
  };
  return walk(source.target.parentId, []);
}

const rootOf = <M extends PostCommentCardMediaLike>(source: Source<M>): Comment<M> | null => ancestors(source)?.[0] ?? null;

function descends<M extends PostCommentCardMediaLike>(rootId: string, comment: Comment<M>, known: ReadonlyMap<string, Comment<M>>): boolean {
  const walk = (next: string | null, seen: ReadonlySet<string>): boolean => {
    if (next === null) return false;
    if (next === rootId) return true;
    const parent = known.get(next);
    if (seen.has(next) || parent === undefined) return false;
    return walk(parent.parentId, new Set([...seen, next]));
  };
  return walk(comment.parentId, new Set([comment.id]));
}

const unique = <M extends PostCommentCardMediaLike>(comments: readonly Comment<M>[]): readonly Comment<M>[] =>
  comments.filter((comment, index) => comments.findIndex((other) => other.id === comment.id) === index);

/** L'ordre chronologique, stable à horodatage égal. */
const chronological = <M extends PostCommentCardMediaLike>(comments: readonly Comment<M>[]): readonly Comment<M>[] =>
  [...unique(comments)].sort((a, b) => a.createdAt - b.createdAt);

/** Les commentaires qu'on peut cocher sous « Choisir les réponses » — la racine et ses réponses peignables, sans la réponse visée, dans l'ordre. */
export function postCommentCardChoosable<M extends PostCommentCardMediaLike>(source: Source<M>): readonly Comment<M>[] {
  const root = rootOf(source);
  if (root === null) return [];
  const known = byId(source.thread);
  const tree = source.thread.filter((comment) => comment.id === root.id || descends(root.id, comment, known));
  return chronological(unique(tree).filter((comment) => comment.id !== source.target.id && isPaintable(comment)));
}

/** La racine, les réponses peignables écrites jusqu'à la réponse visée, puis elle. */
function threadToHere<M extends PostCommentCardMediaLike>(source: Source<M>): readonly Comment<M>[] {
  const chain = ancestors(source);
  if (chain === null || chain.length === 0) return [];
  const ancestorIds = new Set(chain.map((comment) => comment.id));
  const others = postCommentCardChoosable(source).filter((comment) => !ancestorIds.has(comment.id) && comment.createdAt <= source.target.createdAt);
  return [...chronological([...chain, ...others]), source.target];
}

/** Les cases cochées à l'ouverture de « Choisir les réponses » : le fil jusqu'ici. */
export function postCommentCardInitialChoice<M extends PostCommentCardMediaLike>(source: Source<M>): ReadonlySet<string> {
  return new Set(threadToHere(source).map((comment) => comment.id).filter((id) => id !== source.target.id));
}

/** Le texte du post, lisible : 4 lignes, 280 caractères, coupé à un mot. */
export function postCommentCardExcerpt(text: string): string {
  const lines = text.trim().split('\n');
  const kept = lines.slice(0, POST_COMMENT_CARD_LIMITS.maxPostLines).join('\n');
  const characters = [...kept];
  if (characters.length <= POST_COMMENT_CARD_LIMITS.maxPostCharacters) {
    return lines.length > POST_COMMENT_CARD_LIMITS.maxPostLines ? `${kept.trim()}…` : kept;
  }
  const prefix = characters.slice(0, POST_COMMENT_CARD_LIMITS.maxPostCharacters).join('');
  const boundary = Math.max(prefix.lastIndexOf(' '), prefix.lastIndexOf('\n'));
  const cut = boundary === -1 ? prefix : prefix.slice(0, boundary);
  return `${cut.trim()}…`;
}

const authorOf = (author: PostCommentCardAuthor, viewer: PostCommentCardViewer): string => {
  const isViewer = viewer.id !== '' && author.id === viewer.id;
  const candidates = isViewer ? [viewer.displayName, author.displayName, author.username] : [author.displayName, author.username];
  return candidates.map(nonBlank).find((name) => name !== null) ?? 'Meeshy';
};

const handleOf = (author: PostCommentCardAuthor): string | null => nonBlank(author.username)?.replace(/^@+/, '') ?? null;

/** Une story ou un statut disparaît : il ne se fige pas en tête d'une image. */
const disappears = <M extends PostCommentCardMediaLike>(post: PostCommentCardPost<M>): boolean => {
  const type = (post.type ?? '').toUpperCase();
  return type === 'STORY' || type === 'STATUS' || post.hasStoryCanvas;
};

/** La vignette du post : sa première photo ou vidéo. */
const postMediaOf = <M extends PostCommentCardMediaLike>(post: PostCommentCardPost<M>): readonly M[] =>
  post.media.filter((item) => item.kind === 'image' || item.kind === 'video').slice(0, 1);

/** Le post en tête : son auteur et son texte servi, tronqué — `null` quand il ne se met pas en tête. */
function postHead<M extends PostCommentCardMediaLike>(source: Source<M>): PostCommentCardPart | null {
  const post = source.post;
  if (post === null || disappears(post)) return null;
  const text = nonBlank(post.text);
  if (text === null && postMediaOf(post).length === 0) return null;
  return { author: authorOf(post.author, source.viewer), text: text === null ? '' : postCommentCardExcerpt(text), handle: handleOf(post.author) };
}

/** Le post peut-il être en tête de cette carte ? */
export const postCommentCardOffersPost = <M extends PostCommentCardMediaLike>(source: Source<M>): boolean => postHead(source) !== null;

/** Les modes qui composent une carte, le défaut en tête — vide : rien ne s'image. */
export function postCommentCardModes<M extends PostCommentCardMediaLike>(source: Source<M>): readonly PostCommentCardMode[] {
  if (!isPaintable(source.target)) return [];
  const offersPost = postHead(source) !== null;
  if (source.target.parentId === null) return offersPost ? ['postAndComment', 'commentAlone'] : ['commentAlone'];
  const chain = ancestors(source);
  if (chain === null || chain.some(isProtected)) return [];
  return [
    'threadToHere',
    ...(offersPost ? (['postRootAndReply'] as const) : []),
    ...(postCommentCardChoosable(source).length >= 2 ? (['chosenReplies'] as const) : []),
  ];
}

/** Le mode d'ouverture : « Post + commentaire » ou « Fil jusqu'ici » — `null` : rien ne s'image. */
export const postCommentCardDefaultMode = <M extends PostCommentCardMediaLike>(source: Source<M>): PostCommentCardMode | null =>
  postCommentCardModes(source)[0] ?? null;

const symbolOf = (kind: PostCommentCardMediaKind): string => (kind === 'image' ? '📷' : kind === 'video' ? '🎬' : '🎤');

function partOf<M extends PostCommentCardMediaLike>(comment: Comment<M>, source: Source<M>): PostCommentCardPart {
  const text = nonBlank(comment.text) ?? comment.media.map((item) => symbolOf(item.kind)).join(' ');
  return { author: authorOf(comment.author, source.viewer), text, handle: handleOf(comment.author) };
}

/** Plus de commentaires que de place : la tête, « +N », puis les derniers. */
function folded<M extends PostCommentCardMediaLike>(comments: readonly Comment<M>[], budget: number, source: Source<M>): readonly PostCommentCardBlock[] {
  const blocks = comments.map((comment): PostCommentCardBlock => ({ kind: 'comment', id: comment.id, part: partOf(comment, source) }));
  const head = blocks[0];
  if (blocks.length <= budget || budget < 3 || head === undefined) return blocks;
  const tail = budget - 2;
  return [head, { kind: 'folded', count: blocks.length - 1 - tail }, ...blocks.slice(blocks.length - tail)];
}

function commentsOf<M extends PostCommentCardMediaLike>(source: Source<M>, choice: PostCommentCardChoice): readonly Comment<M>[] {
  switch (choice.mode) {
    case 'postAndComment':
    case 'commentAlone':
      return [source.target];
    case 'threadToHere':
      return threadToHere(source);
    case 'postRootAndReply': {
      const root = rootOf(source);
      return root === null ? [] : [root, source.target];
    }
    case 'chosenReplies': {
      const chosen = choice.chosen ?? new Set<string>();
      return [...postCommentCardChoosable(source).filter((comment) => chosen.has(comment.id)), source.target];
    }
  }
}

/** Les blocs de la carte, dans l'ordre — vide quand le mode ne s'offre pas. */
export function postCommentCardBlocks<M extends PostCommentCardMediaLike>(source: Source<M>, choice: PostCommentCardChoice): readonly PostCommentCardBlock[] {
  if (!postCommentCardModes(source).includes(choice.mode)) return [];
  const comments = commentsOf(source, choice);
  if (comments.length === 0) return [];
  const head = choice.showsPost ? postHead(source) : null;
  const budget = POST_COMMENT_CARD_LIMITS.maxBlocks - (head === null ? 0 : 1);
  return [...(head === null ? [] : [{ kind: 'post', part: head } as const]), ...folded(comments, budget, source)];
}

const partOfBlock = (block: PostCommentCardBlock): PostCommentCardPart | null => (block.kind === 'folded' ? null : block.part);

function timeOf<M extends PostCommentCardMediaLike>(block: PostCommentCardBlock, source: Source<M>): number | null {
  if (block.kind === 'post') return source.post?.createdAt ?? null;
  if (block.kind === 'folded') return null;
  return block.id === source.target.id ? source.target.createdAt : (byId(source.thread).get(block.id)?.createdAt ?? null);
}

/** La vignette du post en tête, puis les médias des commentaires peints — les plus récents. */
function mediaOf<M extends PostCommentCardMediaLike>(blocks: readonly PostCommentCardBlock[], source: Source<M>): PostCommentCardSubject<M>['media'] {
  const known = byId([...source.thread, source.target]);
  const quotes = blocks.length > 1;
  const painted = blocks.map((block, index) => {
    const author = (part: PostCommentCardPart): PostCommentCardMediaAuthor => ({ name: part.author, handle: part.handle, quoted: quotes && index === 0 });
    if (block.kind === 'post') return (source.post === null ? [] : postMediaOf(source.post)).map((media) => ({ media, author: author(block.part) }));
    if (block.kind === 'folded') return [];
    return (known.get(block.id)?.media ?? []).map((media) => ({ media, author: author(block.part) }));
  });
  const head = blocks[0]?.kind === 'post' ? (painted[0] ?? []) : [];
  const rest = painted.slice(head.length === 0 ? 0 : 1).flat();
  const room = Math.max(0, POST_COMMENT_CARD_LIMITS.maxMedia - head.length);
  return [...head, ...(room === 0 ? [] : rest.slice(-room))];
}

/**
 * La carte que l'atelier peint pour ces blocs — `null` quand rien ne s'image.
 * Deux blocs : le premier en citation, le second en réponse. Au-delà, le
 * premier reste la citation et les suivants s'écrivent comme une discussion,
 * « Auteur : texte », sous `title` ; le pli dit `foldedLabel`.
 */
export function postCommentCardSubject<M extends PostCommentCardMediaLike>(
  source: Source<M>,
  choice: PostCommentCardChoice & { readonly title: string; readonly foldedLabel: (count: number) => string },
): PostCommentCardSubject<M> | null {
  const composed = postCommentCardBlocks(source, choice);
  const first = composed[0];
  const last = composed[composed.length - 1];
  if (first === undefined || last === undefined) return null;
  const quoted = composed.length > 1 ? partOfBlock(first) : null;
  const rest = composed.length > 1 ? composed.slice(1) : composed;
  const only = rest.length === 1 ? partOfBlock(last) : null;
  const reply: PostCommentCardPart =
    only ?? {
      author: choice.title,
      text: rest
        .map((block) => (block.kind === 'folded' ? choice.foldedLabel(block.count) : `${block.part.author} : ${block.part.text}`))
        .join('\n'),
      handle: null,
    };
  return {
    quoted,
    reply,
    sentAt: source.target.createdAt,
    quotedAt: quoted === null ? null : timeOf(first, source),
    media: mediaOf(composed, source),
  };
}
