import type { FeedPost } from '@/lib/api/feed-pages';
import type { StatusMoodPost } from '@/lib/api/stories';
import { resolveFeedText } from '@/lib/feed/text';

/**
 * **CE QUE LA PAGE D'UNE HUMEUR MONTRE** (#10813) — l'auteur, l'emoji et le mot,
 * ce dernier dans la langue du lecteur par `resolveFeedText` (le site des
 * posts — jamais une boucle de Prisme réécrite ici).
 *
 * Deux sources, une précédence : le DÉTAIL de la publication fait foi ; le
 * corpus des humeurs (`?scope=statuses`, déjà en cache pour la pastille du
 * rail) peint la page sans attendre. Aucune ⇒ `null`, jamais une vue inventée.
 */
export type MoodPageView = {
  readonly postId: string;
  readonly authorId: string;
  readonly authorName: string;
  /** Ce qui désigne l'auteur au profil public — le pseudo, sinon l'id. */
  readonly handle: string;
  readonly avatar: string | null;
  readonly emoji: string;
  readonly text: string;
  readonly language?: string;
  /** Faux pour une publication qui n'est pas une humeur : la page rend la main au détail. */
  readonly isMood: boolean;
};

const MOOD_TYPES: ReadonlySet<string> = new Set(['STATUS', 'MOOD']);

type Source = {
  readonly type: string;
  readonly authorId: string;
  readonly username: string | null;
  readonly displayName: string | null;
  readonly avatar: string | null;
  readonly emoji: string;
  readonly content: string;
  readonly originalLanguage: string | null | undefined;
  readonly translations: unknown;
};

function fromDetail(post: FeedPost): Source | null {
  const authorId = post.author?.id ?? '';
  if (authorId === '') return null;
  return {
    type: post.type,
    authorId,
    username: post.author?.username ?? null,
    displayName: post.author?.displayName ?? null,
    avatar: post.author?.avatar ?? null,
    emoji: post.moodEmoji ?? '',
    content: post.content ?? '',
    originalLanguage: post.originalLanguage,
    translations: post.translations,
  };
}

function fromCorpus(post: StatusMoodPost): Source | null {
  const authorId = post.author?.id ?? post.authorId ?? '';
  if (authorId === '') return null;
  return {
    type: 'STATUS',
    authorId,
    username: post.author?.username ?? null,
    displayName: post.author?.displayName ?? fullName(post.author?.firstName, post.author?.lastName),
    avatar: post.author?.avatar ?? null,
    emoji: post.moodEmoji ?? '',
    content: post.content ?? '',
    originalLanguage: post.originalLanguage,
    translations: post.translations,
  };
}

const fullName = (first: string | undefined, last: string | undefined): string | null => {
  const joined = [first, last].filter((part) => part !== undefined && part.trim() !== '').join(' ');
  return joined === '' ? null : joined;
};

export function moodPageView(params: {
  readonly postId: string;
  readonly post: FeedPost | undefined;
  readonly corpus: StatusMoodPost | undefined;
  readonly languages: readonly string[];
}): MoodPageView | null {
  const source = (params.post === undefined ? null : fromDetail(params.post)) ?? (params.corpus === undefined ? null : fromCorpus(params.corpus));
  if (source === null) return null;
  const served =
    source.content.trim() === ''
      ? null
      : resolveFeedText({
          preferredLanguages: params.languages,
          originalLanguage: source.originalLanguage,
          translations: source.translations,
          content: source.content,
        });
  return {
    postId: params.postId,
    authorId: source.authorId,
    authorName: source.displayName?.trim() || source.username || '',
    handle: source.username ?? source.authorId,
    avatar: source.avatar,
    emoji: source.emoji,
    text: served?.text ?? '',
    ...(served === null ? {} : { language: served.language }),
    isMood: MOOD_TYPES.has(source.type.toUpperCase()),
  };
}
