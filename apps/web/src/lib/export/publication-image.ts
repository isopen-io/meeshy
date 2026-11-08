import type { FeedMedia } from '@/lib/api/feed-pages';
import type { FeedCardModel } from '@/lib/feed/card-model';
import { postImagingOf, type PostImagingInput } from '@/lib/feed/publication-imaging';
import { resolveStoryCaption } from '@/lib/stories/caption';
import type { StoryPlaybackStory } from '@/lib/stories/playback';

import { authoredBy, mediaAuthorOf, servedCardMediaOf, type MessageCardSubjectPart } from './message-card-subject';
import type { PublicationImageRequest } from './publication-image-store';
import { postExportSubject, storyExportSubject, storyMediaExportSubject, type SceneExportSubject } from './scene/scene-export-subject';

/**
 * **LES DEMANDES D'« IMAGER »** (#16393, #16166) — ce que chaque surface remet à
 * l'atelier de carte (`publication-image-store.ts`).
 */
const bare = (subject: SceneExportSubject | null): SceneExportSubject | null => {
  return subject === null ? null : { key: subject.key, fileStem: subject.fileStem, document: subject.document, carrier: subject.carrier, watermark: null };
};

/** Un post ou un réel — `null` quand la loi (`postImagingOf`) n'image rien. */
export function postImageRequestOf(model: PostImagingInput & Pick<FeedCardModel, 'isReel'>): PublicationImageRequest | null {
  const imaging = postImagingOf(model);
  if (imaging.kind === 'hidden') return null;
  return {
    key: `post:${model.id}`,
    subject: imaging.subject,
    scene: imaging.scene === null ? null : bare(postExportSubject({ id: model.id, isReel: model.isReel, scene: imaging.scene, author: model.author })),
  };
}

const nonBlank = (value: string | null | undefined): string | null => (typeof value === 'string' && value.trim() !== '' ? value.trim() : null);

/** Une story — sa légende servie par le Prisme, sa scène (ou son média v1) rendue en média. */
export function storyImageRequestOf(story: StoryPlaybackStory | undefined, preferredLanguages: readonly string[]): PublicationImageRequest | null {
  if (story === undefined) return null;
  const scene = bare(storyExportSubject(story) ?? storyMediaExportSubject(story));
  if (scene === null) return null;
  const caption = resolveStoryCaption({ preferredLanguages, originalLanguage: story.originalLanguage, translations: story.translations, content: story.content ?? '' });
  const author = story.author;
  const reply: MessageCardSubjectPart = {
    author: nonBlank(author?.displayName) ?? nonBlank(author?.username) ?? 'Meeshy',
    text: caption?.text.trim() ?? '',
    handle: nonBlank(author?.username)?.replace(/^@+/, '') ?? null,
  };
  return { key: `story:${story.id}`, subject: { quoted: null, reply, sentAt: new Date(story.createdAt), quotedAt: null, media: [] }, scene };
}

/** Le média d'un commentaire, ouvert en plein écran — la pièce seule, signée par l'auteur du commentaire. */
export function commentMediaImageRequestOf(params: {
  readonly piece: FeedMedia;
  readonly commentId: string;
  readonly author: { readonly displayName?: string | null; readonly username?: string | null };
  readonly createdAt?: string | Date | null;
}): PublicationImageRequest | null {
  const reply: MessageCardSubjectPart = {
    author: nonBlank(params.author.displayName) ?? nonBlank(params.author.username) ?? 'Meeshy',
    text: '',
    handle: nonBlank(params.author.username)?.replace(/^@+/, '') ?? null,
  };
  const media = authoredBy(servedCardMediaOf([params.piece], null), mediaAuthorOf(reply, false));
  if (media.length === 0) return null;
  const sentAt = params.createdAt === undefined || params.createdAt === null ? new Date() : new Date(params.createdAt);
  return { key: `comment:${params.commentId}:${params.piece.id}`, subject: { quoted: null, reply, sentAt, quotedAt: null, media }, scene: null };
}
