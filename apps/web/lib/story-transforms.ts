import type { Post } from '@meeshy/shared/types/post';
import type { StoryItem } from '@/components/v2/StoryTray';
import type { StoryData } from '@/components/v2/StoryViewer';

// ============================================================================
// Shared StoryEffects shape (used by StoryViewer)
// ============================================================================

type TextStyle = 'bold' | 'neon' | 'typewriter' | 'handwriting';
type StoryFilter = 'vintage' | 'bw' | 'warm' | 'cool' | 'dramatic' | null;

const VALID_TEXT_STYLES = new Set<string>(['bold', 'neon', 'typewriter', 'handwriting']);
const VALID_FILTERS = new Set<string>(['vintage', 'bw', 'warm', 'cool', 'dramatic']);

function parseTextStyle(value: unknown): TextStyle | undefined {
  return typeof value === 'string' && VALID_TEXT_STYLES.has(value) ? value as TextStyle : undefined;
}

function parseFilter(value: unknown): StoryFilter | undefined {
  if (value === null) return null;
  return typeof value === 'string' && VALID_FILTERS.has(value) ? value as StoryFilter : undefined;
}

function parseTextPosition(value: unknown): { x: number; y: number } | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const pos = value as Record<string, unknown>;
  if (typeof pos.x === 'number' && typeof pos.y === 'number') return { x: pos.x, y: pos.y };
  return undefined;
}

function parseStickers(value: unknown): Array<{ emoji: string; x: number; y: number; scale: number; rotation: number }> | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter(
    (s): s is { emoji: string; x: number; y: number; scale: number; rotation: number } =>
      s && typeof s === 'object' &&
      typeof s.emoji === 'string' &&
      typeof s.x === 'number' &&
      typeof s.y === 'number' &&
      typeof s.scale === 'number' &&
      typeof s.rotation === 'number'
  );
}

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
  const effects = (post.storyEffects && typeof post.storyEffects === 'object')
    ? post.storyEffects as Record<string, unknown>
    : undefined;
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
    authorId: post.authorId,
    author: {
      name: author?.displayName ?? author?.username ?? 'Unknown',
      avatar: author?.avatar ?? undefined,
    },
    content: post.content ?? undefined,
    originalLanguage: post.originalLanguage ?? undefined,
    translations: undefined,
    storyEffects: effects ? {
      background: typeof effects.backgroundColor === 'string' ? effects.backgroundColor : undefined,
      textStyle: parseTextStyle(effects.textStyle),
      textColor: typeof effects.textColor === 'string' ? effects.textColor : undefined,
      textPosition: parseTextPosition(effects.textPosition),
      filter: parseFilter(effects.filter),
      stickers: parseStickers(effects.stickers),
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
