import type { Post } from '@meeshy/shared/types/post';
import type { StoryItem } from '@/components/v2/StoryTray';
import type { StoryData, StoryTextObjectData, StoryMediaObjectData, StoryAudioObjectData } from '@/components/v2/StoryViewer';

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

/// Parse the `textObjects[]` array produced by the iOS composer. Required fields
/// (id, content, x, y, scale, rotation) are validated; optional fields are
/// passed through. `translations` is `Record<lang, translated_text>` matching
/// the SDK's `StoryTextObject.translations`. The Prisme resolution happens at
/// render time.
function parseTextObjects(value: unknown): StoryTextObjectData[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const result: StoryTextObjectData[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') continue;
    const r = raw as Record<string, unknown>;
    if (typeof r.id !== 'string' || typeof r.content !== 'string') continue;
    if (typeof r.x !== 'number' || typeof r.y !== 'number') continue;
    const translations = (r.translations && typeof r.translations === 'object' && !Array.isArray(r.translations))
      ? r.translations as Record<string, string>
      : undefined;
    result.push({
      id: r.id,
      content: r.content,
      x: r.x,
      y: r.y,
      scale: typeof r.scale === 'number' ? r.scale : 1,
      rotation: typeof r.rotation === 'number' ? r.rotation : 0,
      translations,
      sourceLanguage: typeof r.sourceLanguage === 'string' ? r.sourceLanguage : undefined,
      textStyle: parseTextStyle(r.textStyle),
      textColor: typeof r.textColor === 'string' ? r.textColor : undefined,
      textSize: typeof r.textSize === 'number' ? r.textSize : undefined,
      textAlign: typeof r.textAlign === 'string' ? r.textAlign : undefined,
      textBg: typeof r.textBg === 'string' ? r.textBg : undefined,
      zIndex: typeof r.zIndex === 'number' ? r.zIndex : undefined,
    });
  }
  return result.length > 0 ? result : undefined;
}

/// Parse `mediaObjects[]`. Each entry references a `PostMedia` by `postMediaId`
/// — the actual file URL is resolved against `post.media[]` at render time.
function parseMediaObjects(value: unknown): StoryMediaObjectData[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const result: StoryMediaObjectData[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') continue;
    const r = raw as Record<string, unknown>;
    if (typeof r.id !== 'string' || typeof r.postMediaId !== 'string') continue;
    if (typeof r.x !== 'number' || typeof r.y !== 'number') continue;
    const mediaType = r.mediaType === 'video' ? 'video' : 'image';
    result.push({
      id: r.id,
      postMediaId: r.postMediaId,
      mediaType: mediaType as 'image' | 'video',
      x: r.x,
      y: r.y,
      scale: typeof r.scale === 'number' ? r.scale : 1,
      rotation: typeof r.rotation === 'number' ? r.rotation : 0,
      isBackground: r.isBackground === true,
      zIndex: typeof r.zIndex === 'number' ? r.zIndex : undefined,
    });
  }
  return result.length > 0 ? result : undefined;
}

function parseAudioObjects(value: unknown): StoryAudioObjectData[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const result: StoryAudioObjectData[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') continue;
    const r = raw as Record<string, unknown>;
    if (typeof r.id !== 'string' || typeof r.postMediaId !== 'string') continue;
    result.push({
      id: r.id,
      postMediaId: r.postMediaId,
      x: typeof r.x === 'number' ? r.x : 0.5,
      y: typeof r.y === 'number' ? r.y : 0.85,
      volume: typeof r.volume === 'number' ? r.volume : 1,
      isBackground: r.isBackground === true,
      zIndex: typeof r.zIndex === 'number' ? r.zIndex : undefined,
    });
  }
  return result.length > 0 ? result : undefined;
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

  // Resolve a `postMediaId -> { url, mimeType }` lookup for the foreground media
  // / audio renderers — they store only the id, not the URL.
  const mediaById = new Map<string, { url: string; mimeType: string }>();
  for (const m of post.media ?? []) {
    if (m.id && m.fileUrl) mediaById.set(m.id, { url: m.fileUrl, mimeType: m.mimeType ?? '' });
  }

  // Pass the post-level `translations` straight through. Previously this was
  // hardcoded `undefined`, so `TranslationToggle` was dead on stories — even
  // when the gateway had cached translations for the post content.
  const translations = (post.translations && typeof post.translations === 'object')
    ? Object.entries(post.translations as Record<string, unknown>)
        .map(([languageCode, raw]) => {
          if (typeof raw === 'string') {
            return { languageCode, languageName: languageCode, content: raw };
          }
          if (raw && typeof raw === 'object' && typeof (raw as { text?: unknown }).text === 'string') {
            return { languageCode, languageName: languageCode, content: (raw as { text: string }).text };
          }
          return null;
        })
        .filter((t): t is { languageCode: string; languageName: string; content: string } => t !== null)
    : undefined;

  const textObjects = effects ? parseTextObjects(effects.textObjects) : undefined;
  const mediaObjects = effects ? parseMediaObjects(effects.mediaObjects) : undefined;
  const audioObjects = effects ? parseAudioObjects(effects.audioPlayerObjects) : undefined;
  const slideDurationRaw = effects?.slideDuration;
  const slideDurationMs = (typeof slideDurationRaw === 'number' && slideDurationRaw > 0)
    ? slideDurationRaw * 1000
    : undefined;

  return {
    id: post.id,
    authorId: post.authorId,
    author: {
      name: author?.displayName ?? author?.username ?? 'Unknown',
      avatar: author?.avatar ?? undefined,
    },
    content: post.content ?? undefined,
    originalLanguage: post.originalLanguage ?? undefined,
    translations: translations && translations.length > 0 ? translations : undefined,
    storyEffects: effects ? {
      background: typeof effects.backgroundColor === 'string' ? effects.backgroundColor : undefined,
      textStyle: parseTextStyle(effects.textStyle),
      textColor: typeof effects.textColor === 'string' ? effects.textColor : undefined,
      textPosition: parseTextPosition(effects.textPosition),
      filter: parseFilter(effects.filter),
      stickers: parseStickers(effects.stickers),
      textObjects,
      mediaObjects,
      audioObjects,
      slideDurationMs,
    } : undefined,
    mediaById,
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
