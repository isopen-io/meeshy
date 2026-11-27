import type { FeedPost } from '@/lib/api/feed-pages';
import { publicationShareUrl } from '@/lib/feed/share-url';
import type { PublishFormat, SendPayload, SendPreview } from '@/lib/send/send-sheet-plan';

const postTypeOf = (post: FeedPost | undefined): PublishFormat => (post?.type === 'REEL' || post?.type === 'STORY' ? post.type : 'POST');

const thumbOf = (post: FeedPost | undefined): string | undefined => {
  const first = post?.media?.[0];
  if (first === undefined || first === null) return undefined;
  if (typeof first.thumbnailUrl === 'string' && first.thumbnailUrl !== '') return first.thumbnailUrl;
  return first.mimeType?.startsWith('image/') === true ? first.fileUrl : undefined;
};

const previewOf = (post: FeedPost | undefined): SendPreview => {
  const text = post?.content?.trim();
  const thumbUrl = thumbOf(post);
  return {
    kind: 'publication',
    ...(text === undefined || text === '' ? {} : { text }),
    ...(thumbUrl === undefined ? {} : { thumbUrl }),
  };
};

/** Ce qu'une publication devient quand elle part : son type, son adresse canonique et son aperçu. */
export function publicationPayloadOf(postId: string, post: FeedPost | undefined): Extract<SendPayload, { readonly kind: 'publication' }> {
  return { kind: 'publication', postId, postType: postTypeOf(post), url: publicationShareUrl(postId), preview: previewOf(post) };
}
