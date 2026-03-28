import type { Post } from '@meeshy/shared/types/post';
import type { StoryItem } from '@/components/v2/StoryTray';
import type { StoryData } from '@/components/v2/StoryViewer';

// ============================================================================
// Post -> StoryItem (for StoryTray)
// ============================================================================

export function postToStoryItem(
  post: Post,
  currentUserId: string,
  viewedIds: Set<string>
): StoryItem {
  const author = post.author;
  return {
    id: post.id,
    author: {
      name: author?.displayName ?? author?.username ?? 'Unknown',
      avatar: author?.avatar ?? undefined,
    },
    thumbnailUrl: post.media?.[0]?.thumbnailUrl ?? post.media?.[0]?.fileUrl ?? undefined,
    hasUnviewed: !viewedIds.has(post.id),
    isOwn: post.authorId === currentUserId,
  };
}

// ============================================================================
// Post -> StoryData (for StoryViewer)
// ============================================================================

export function postToStoryData(post: Post): StoryData {
  const author = post.author;
  const effects = post.storyEffects as Record<string, unknown> | undefined;
  const firstMedia = post.media?.[0];

  let mediaUrl: string | undefined;
  let mediaType: 'image' | 'video' | undefined;
  if (firstMedia) {
    mediaUrl = firstMedia.fileUrl;
    if (firstMedia.mimeType.startsWith('image/')) mediaType = 'image';
    else if (firstMedia.mimeType.startsWith('video/')) mediaType = 'video';
  }

  return {
    id: post.id,
    author: {
      name: author?.displayName ?? author?.username ?? 'Unknown',
      avatar: author?.avatar ?? undefined,
    },
    content: post.content ?? undefined,
    originalLanguage: post.originalLanguage ?? undefined,
    translations: undefined, // translations come from storyEffects or post translation events
    storyEffects: effects ? {
      background: effects.backgroundColor as string | undefined,
      textStyle: effects.textStyle as StoryData['storyEffects'] extends { textStyle?: infer T } ? T : undefined,
      textColor: effects.textColor as string | undefined,
      textPosition: effects.textPosition as { x: number; y: number } | undefined,
      filter: effects.filter as StoryData['storyEffects'] extends { filter?: infer T } ? T : undefined,
      stickers: effects.stickers as Array<{ emoji: string; x: number; y: number; scale: number; rotation: number }> | undefined,
    } : undefined,
    mediaUrl,
    mediaType,
    createdAt: typeof post.createdAt === 'string' ? post.createdAt : post.createdAt.toISOString(),
    expiresAt: post.expiresAt
      ? (typeof post.expiresAt === 'string' ? post.expiresAt : post.expiresAt.toISOString())
      : new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    viewCount: post.viewCount,
  };
}

// ============================================================================
// Group stories by author (for StoryTray display)
// ============================================================================

export function groupStoriesByAuthor(posts: Post[]): Map<string, Post[]> {
  const grouped = new Map<string, Post[]>();
  for (const post of posts) {
    const authorId = post.authorId;
    const existing = grouped.get(authorId);
    if (existing) {
      existing.push(post);
    } else {
      grouped.set(authorId, [post]);
    }
  }
  return grouped;
}

// ============================================================================
// Time remaining helper
// ============================================================================

export function timeRemaining(expiresAt: string): string | null {
  const diff = new Date(expiresAt).getTime() - Date.now();
  if (diff <= 0) return null;

  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);

  if (hours >= 1) return `${hours}h${minutes % 60 > 0 ? `${minutes % 60}m` : ''}`;
  return `${minutes}m`;
}
