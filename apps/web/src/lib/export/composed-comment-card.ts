import {
  postCommentCardInitialChoice,
  postCommentCardModes,
  postCommentCardShowsPostByDefault,
  postCommentCardSubject,
  type PostCommentCardAuthor,
  type PostCommentCardChoice,
  type PostCommentCardComment,
  type PostCommentCardMode,
  type PostCommentCardSource,
} from '@meeshy/shared/utils/comment-card-composition';

import type { FeedAuthor, FeedPost } from '@/lib/api/feed-pages';
import type { PostComment } from '@/lib/api/publication-comments';
import { resolveFeedText } from '@/lib/feed/text';

import { cardMediaOf, type MessageCardMediaItem, type MessageCardSubject } from './message-card-subject';

/**
 * **IMAGER UN COMMENTAIRE DE POST — CE QUE LE WEB REMET À LA COMPOSITION**
 * (#9687, jumelle de `MessageCardExportMenu.request(post:comment:…)` iOS).
 * Les RÈGLES (modes, gardes, bornes, ordre) vivent dans
 * `@meeshy/shared/utils/comment-card-composition` ; ici, ce que seul le
 * web sait : le texte SERVI de chaque commentaire et du post (le Prisme des
 * commentaires, `resolveFeedText`), celui que la rangée visée AFFICHE (sa puce
 * de langue), les médias PEIGNABLES (`cardMediaOf`), et la projection sur la
 * carte d'« Imagine » (`MessageCardSubject`), dont le moteur ne change pas.
 */

export type PostCommentCardEntry = { readonly kind: MessageCardMediaItem['card']['kind']; readonly item: MessageCardMediaItem };

export type PostCommentSource = PostCommentCardSource<PostCommentCardEntry>;

export type PostCommentCardLabels = { readonly title: string; readonly folded: (count: number) => string };

export type PostCommentCardInput = {
  readonly post: FeedPost | null;
  readonly target: PostComment;
  /** Le texte que la rangée visée AFFICHE — le Prisme, ou l'original demandé. */
  readonly targetText: string;
  /** La racine et les réponses chargées autour de la cible. */
  readonly thread: readonly PostComment[];
  readonly readerLanguages: readonly string[];
  readonly viewer: { readonly id: string; readonly displayName: string };
};

const entriesOf = (media: Parameters<typeof cardMediaOf>[0]): readonly PostCommentCardEntry[] => cardMediaOf(media).map((item) => ({ kind: item.card.kind, item }));

const authorOf = (author: FeedAuthor | null | undefined): PostCommentCardAuthor => ({
  id: author?.id ?? '',
  displayName: author?.displayName ?? null,
  username: author?.username ?? null,
});

const timeOf = (value: string | Date): number => (value instanceof Date ? value.getTime() : Date.parse(value));

const parentOf = (comment: PostComment): string | null => (typeof comment.parentId === 'string' && comment.parentId !== '' ? comment.parentId : null);

function entryOf(comment: PostComment, text: string): PostCommentCardComment<PostCommentCardEntry> {
  return {
    id: comment.id,
    parentId: parentOf(comment),
    createdAt: timeOf(comment.createdAt),
    effectFlags: comment.effectFlags ?? 0,
    inFlight: comment.pending === true,
    author: authorOf(comment.author),
    text,
    media: entriesOf(comment.media),
  };
}

export function postCommentCardSourceOf(input: PostCommentCardInput): PostCommentSource {
  const served = (content: string | null | undefined, originalLanguage: string | null | undefined, translations: unknown): string =>
    resolveFeedText({ preferredLanguages: input.readerLanguages, originalLanguage, translations, content: content ?? '' }).text;
  const post = input.post;
  return {
    post:
      post === null
        ? null
        : {
            type: post.type,
            hasStoryCanvas: post.storyEffects !== undefined && post.storyEffects !== null,
            createdAt: timeOf(post.createdAt),
            author: authorOf(post.author),
            text: served(post.content, post.originalLanguage, post.translations),
            media: entriesOf(post.media),
          },
    target: entryOf(input.target, input.targetText),
    thread: input.thread.map((comment) => entryOf(comment, served(comment.content, comment.originalLanguage, comment.translations))),
    viewer: input.viewer,
  };
}

/** La carte qu'« Imagine » peint pour ce choix — `null` quand rien ne s'image. */
export function postCommentMessageCardSubjectOf(source: PostCommentSource, choice: PostCommentCardChoice, labels: PostCommentCardLabels): MessageCardSubject | null {
  const subject = postCommentCardSubject(source, { ...choice, title: labels.title, foldedLabel: labels.folded });
  if (subject === null) return null;
  return {
    quoted: subject.quoted,
    reply: subject.reply,
    sentAt: new Date(subject.sentAt),
    quotedAt: subject.quotedAt === null ? null : new Date(subject.quotedAt),
    media: subject.media.map(({ media, author }) => ({ ...media.item, author })),
  };
}

/**
 * LE POST QUI COMPOSE la carte d'un de ses commentaires — `null` pour une
 * story ou un statut (le lecteur de stories garde la carte du commentaire,
 * comme iOS ne lui passe aucun post) et quand aucune caisse ne le connaît.
 */
export function composingPostOf(post: FeedPost | null | undefined): FeedPost | null {
  if (post === undefined || post === null) return null;
  const type = post.type.toUpperCase();
  return type === 'STORY' || type === 'STATUS' ? null : post;
}

/** « Imager » s'offre-t-il ? Dès qu'un mode compose une carte. */
export const postCommentImageable = (input: PostCommentCardInput): boolean => postCommentCardModes(postCommentCardSourceOf(input)).length > 0;

/**
 * CE QUE L'ATELIER A CHOISI — `null` partout : le défaut. Le mode retombe sur
 * le défaut s'il ne s'offre plus ; « Post en tête » vaut pour SON mode ; les
 * cases non touchées suivent le fil jusqu'ici, qui grandit quand les réponses
 * arrivent.
 */
export type PostCommentPick = {
  readonly mode: PostCommentCardMode | null;
  readonly showsPost: boolean | null;
  readonly chosen: ReadonlySet<string> | null;
};

export const NO_POST_COMMENT_PICK: PostCommentPick = { mode: null, showsPost: null, chosen: null };

export type PostCommentPickAction =
  | { readonly kind: 'mode'; readonly mode: PostCommentCardMode }
  | { readonly kind: 'togglePost' }
  | { readonly kind: 'reply'; readonly id: string };

/** Le choix effectif — `null` quand rien ne s'image. */
export function postCommentChoiceOf(source: PostCommentSource, pick: PostCommentPick): Required<PostCommentCardChoice> | null {
  const modes = postCommentCardModes(source);
  const mode = pick.mode !== null && modes.includes(pick.mode) ? pick.mode : (modes[0] ?? null);
  if (mode === null) return null;
  return {
    mode,
    showsPost: pick.showsPost !== null && pick.mode === mode ? pick.showsPost : postCommentCardShowsPostByDefault(mode),
    chosen: pick.chosen ?? postCommentCardInitialChoice(source),
  };
}

/** Un toucher sur une puce : choisir un mode remet « Post en tête » à son défaut, comme iOS. */
export function postCommentPickAfter(source: PostCommentSource, pick: PostCommentPick, action: PostCommentPickAction): PostCommentPick {
  const choice = postCommentChoiceOf(source, pick);
  if (choice === null) return pick;
  switch (action.kind) {
    case 'mode':
      return action.mode === choice.mode
        ? pick
        : { mode: action.mode, showsPost: null, chosen: action.mode === 'chosenReplies' ? postCommentCardInitialChoice(source) : pick.chosen };
    case 'togglePost':
      return { ...pick, mode: choice.mode, showsPost: !choice.showsPost };
    case 'reply': {
      const chosen = choice.chosen.has(action.id) ? [...choice.chosen].filter((id) => id !== action.id) : [...choice.chosen, action.id];
      return { ...pick, mode: choice.mode, chosen: new Set(chosen) };
    }
  }
}

