import { sliceCodePoints } from '@meeshy/shared/utils/text-truncate';

export type PostReplySnapshotablePost = {
  id: string;
  type: string;
  content: string | null;
  moodEmoji: string | null;
  reactionCount: number | null;
  commentCount: number | null;
  shareCount: number | null;
  createdAt: Date;
  media: Array<{ thumbnailUrl: string | null }>;
};

export type PostReplyTo = {
  id: string;
  type: string;
  moodEmoji: string | null;
  previewText: string;
  thumbnailUrl: string | null;
  reactionCount: number;
  commentCount: number;
  shareCount: number;
  createdAt: string;
};

export const POST_REPLY_SNAPSHOT_SELECT = Object.freeze({
  id: true,
  type: true,
  content: true,
  moodEmoji: true,
  reactionCount: true,
  commentCount: true,
  shareCount: true,
  createdAt: true,
  media: {
    select: Object.freeze({ thumbnailUrl: true }),
  },
});

export function buildPostReplyTo(post: PostReplySnapshotablePost): PostReplyTo {
  const rawText = post.content ?? '';
  const trimmed = rawText.trim();
  const previewText = sliceCodePoints(trimmed, 80);

  const thumbnailUrl = post.media[0]?.thumbnailUrl ?? null;

  return {
    id: post.id,
    type: post.type,
    moodEmoji: post.moodEmoji,
    previewText,
    thumbnailUrl,
    reactionCount: post.reactionCount ?? 0,
    commentCount: post.commentCount ?? 0,
    shareCount: post.shareCount ?? 0,
    createdAt: post.createdAt.toISOString(),
  };
}

export function normalizePostReplyTo(raw: unknown): PostReplyTo | null {
  if (raw === null || raw === undefined || typeof raw !== 'object' || Array.isArray(raw)) {
    return null;
  }
  const obj = raw as Record<string, unknown>;
  if (typeof obj['id'] !== 'string') return null;

  return {
    id: obj['id'],
    type: typeof obj['type'] === 'string' ? obj['type'] : 'POST',
    moodEmoji: typeof obj['moodEmoji'] === 'string' ? obj['moodEmoji'] : null,
    previewText: typeof obj['previewText'] === 'string' ? obj['previewText'] : '',
    thumbnailUrl: typeof obj['thumbnailUrl'] === 'string' ? obj['thumbnailUrl'] : null,
    reactionCount: typeof obj['reactionCount'] === 'number' ? obj['reactionCount'] : 0,
    commentCount: typeof obj['commentCount'] === 'number' ? obj['commentCount'] : 0,
    shareCount: typeof obj['shareCount'] === 'number' ? obj['shareCount'] : 0,
    createdAt: typeof obj['createdAt'] === 'string' ? obj['createdAt'] : new Date(0).toISOString(),
  };
}

export function postReplyToFromMetadata(metadata: unknown): PostReplyTo | null {
  if (metadata === null || metadata === undefined || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return null;
  }
  const obj = metadata as Record<string, unknown>;
  if (!('postReplyTo' in obj) || obj['postReplyTo'] === null || obj['postReplyTo'] === undefined) {
    return null;
  }
  return normalizePostReplyTo(obj['postReplyTo']);
}
