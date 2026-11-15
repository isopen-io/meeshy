import type { StatusMoodPost } from '@/lib/api/stories';
import { resolveFeedText } from '@/lib/feed/text';
import { currentMoodPosts } from '@/lib/view/story-tray';

/**
 * **CE QUE LA FEUILLE D'HUMEUR MONTRE** (#10528) — l'humeur touchée et le
 * texte du POST courant de son auteur, tel que le corpus servi le porte
 * (`?scope=statuses`, la même élection que la pastille : `currentMoodPosts`).
 * Le texte descend le Prisme du lecteur par `resolveFeedText`, le site des
 * posts — jamais une boucle réécrite ici. Un auteur absent du corpus, ou une
 * humeur sans texte : l'humeur seule, sans rien inventer.
 */
export type MoodPeekContent = {
  readonly emoji: string;
  readonly text: string;
  readonly language?: string;
  /** Le post montré — celui dont la feuille compte la VUE (#10530). Absent
   * quand le corpus ne porte pas l'humeur touchée : rien à compter. */
  readonly postId?: string;
};

export function moodPeekContent(params: {
  readonly posts: readonly StatusMoodPost[];
  readonly authorId: string;
  readonly emoji: string;
  readonly languages: readonly string[];
}): MoodPeekContent {
  const post = currentMoodPosts(params.posts).get(params.authorId);
  const content = post?.content ?? '';
  if (post === undefined) return { emoji: params.emoji, text: '' };
  if (content.trim() === '') return { emoji: post.moodEmoji ?? params.emoji, text: '', postId: post.id };
  const served = resolveFeedText({
    preferredLanguages: params.languages,
    originalLanguage: post.originalLanguage,
    translations: post.translations,
    content,
  });
  return { emoji: post.moodEmoji ?? params.emoji, text: served.text, language: served.language, postId: post.id };
}
