import type { Post } from '@meeshy/shared/types/post';
import { formatTimeRemaining } from '@meeshy/shared/utils/time-remaining';
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
    // The iOS composer encodes the overlay text under `text`; `content` is a
    // decoder-only legacy alias. Read the canonical key first, fall back to the
    // legacy one — without this the web dropped every text overlay iOS sent.
    const textValue = typeof r.text === 'string'
      ? r.text
      : (typeof r.content === 'string' ? r.content : undefined);
    if (typeof r.id !== 'string' || textValue === undefined) continue;
    if (typeof r.x !== 'number' || typeof r.y !== 'number') continue;
    const translations = (r.translations && typeof r.translations === 'object' && !Array.isArray(r.translations))
      ? r.translations as Record<string, string>
      : undefined;
    result.push({
      id: r.id,
      content: textValue,
      x: r.x,
      y: r.y,
      scale: typeof r.scale === 'number' ? r.scale : 1,
      rotation: typeof r.rotation === 'number' ? r.rotation : 0,
      translations,
      sourceLanguage: typeof r.sourceLanguage === 'string' ? r.sourceLanguage : undefined,
      textStyle: parseTextStyle(r.textStyle),
      textColor: typeof r.textColor === 'string' ? r.textColor : undefined,
      // Legacy `textSize` is css px; canonical `fontSize` is design px on the
      // 1080-wide reference canvas. Keep them in distinct fields so the renderer
      // can scale `fontSizeDesign` to the live canvas instead of treating an
      // iOS 96-design-px size as 96 css px (≈2.25× too large).
      textSize: typeof r.textSize === 'number' ? r.textSize : undefined,
      fontSizeDesign: typeof r.fontSize === 'number' ? r.fontSize : undefined,
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
// Author group -> StoryItem (one tray bubble per author)
// ============================================================================

/// Collapse an author's stories into a single tray bubble. The bubble is keyed
/// by `authorId` (the group id used to scope the viewer), shows the first
/// story's thumbnail, and is considered unviewed when ANY story in the group is
/// still unviewed. `group` is assumed non-empty (callers map over the grouped
/// values produced by `groupStoriesByAuthor`).
export function groupToStoryItem(
  group: Post[],
  currentUserId: string,
  viewedIds: Set<string>
): StoryItem {
  const [first] = group;
  const author = first.author;
  return {
    id: first.authorId,
    author: {
      name: author?.displayName ?? author?.username ?? 'Unknown',
      avatar: author?.avatar ?? undefined,
    },
    thumbnailUrl: first.media?.[0]?.thumbnailUrl ?? first.media?.[0]?.fileUrl ?? undefined,
    hasUnviewed: group.some((post) => !viewedIds.has(post.id)),
    isOwn: first.authorId === currentUserId,
  };
}

// ============================================================================
// Post -> StoryData (for StoryViewer)
// ============================================================================

// ============================================================================
// Story timeline duration — single source of truth ported 1:1 from the iOS SDK
// (`StorySlide.computedTotalDuration()` / `contentDerivedDuration()` in
// MeeshySDK/Models/StoryModels.swift). The story lasts as long as its timeline,
// NOT a fixed slide duration: a 14s background video plays its full 14s, a
// looped 4s clip extends to the next full repetition past 6s, long text earns
// reading time, and an author-pinned `timelineDuration` overrides everything.
// The legacy `slideDuration` field is deliberately IGNORED (backend values are
// arbitrary; the composer stopped writing it).
// ============================================================================

const DEFAULT_STATIC_DURATION_S = 6.0;
const LONG_TEXT_THRESHOLD_WORDS = 30;
const LONG_TEXT_SECONDS_PER_WORD = 1 / 6;

function positiveNumber(value: unknown): number | undefined {
  return typeof value === 'number' && value > 0 ? value : undefined;
}

function asObjectArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? (value.filter((v) => v && typeof v === 'object') as Record<string, unknown>[]) : [];
}

export function computeStoryDurationMs(effects: Record<string, unknown> | undefined): number {
  // Priority 0 — author-pinned timeline duration is authoritative (the timeline
  // IS the story). `nil` for everything existing → falls back to content.
  const pinned = positiveNumber(effects?.timelineDuration);
  if (pinned !== undefined) return Math.round(pinned * 1000);

  const mediaObjects = asObjectArray(effects?.mediaObjects);
  const audioObjects = asObjectArray(effects?.audioPlayerObjects);
  const textObjects = asObjectArray(effects?.textObjects);

  // Component 1 — background video/audio of natural duration.
  const bgVideoDur = positiveNumber(
    mediaObjects.find((m) => m.isBackground === true && m.mediaType === 'video')?.duration,
  );
  const bgAudioDur = positiveNumber(audioObjects.find((a) => a.isBackground === true)?.duration);
  const rawMediaDur = bgVideoDur ?? bgAudioDur;

  // Component 2 — long text earns reading time (>30 words → 6s + 1s per 6 words).
  const totalWords = textObjects.reduce((acc, t) => {
    const text = typeof t.text === 'string' ? t.text.trim() : '';
    return acc + (text ? text.split(/\s+/).length : 0);
  }, 0);
  const textDur = totalWords > LONG_TEXT_THRESHOLD_WORDS
    ? DEFAULT_STATIC_DURATION_S + (totalWords - LONG_TEXT_THRESHOLD_WORDS) * LONG_TEXT_SECONDS_PER_WORD
    : DEFAULT_STATIC_DURATION_S;

  const target = Math.max(textDur, DEFAULT_STATIC_DURATION_S);

  // Background media looped up to the target (or its natural duration if longer).
  const bgResult = rawMediaDur === undefined
    ? target
    : rawMediaDur >= target
      ? rawMediaDur
      : Math.ceil(target / rawMediaDur) * rawMediaDur;

  // Foreground (non-bg) videos: the slide must at least cover their natural length.
  const fgMediaMax = mediaObjects
    .filter((m) => m.isBackground !== true)
    .map((m) => positiveNumber(m.duration) ?? 0)
    .reduce((a, b) => Math.max(a, b), 0);

  return Math.round(Math.max(bgResult, fgMediaMax) * 1000);
}

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
  // Duration derived from the timeline (background video length, looped clips,
  // long-text reading time, author pin) — never the fixed legacy slide duration.
  const slideDurationMs = computeStoryDurationMs(effects);

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
      // Canonical key is `background` (iOS composer + gateway StoryEffectsSchema);
      // `backgroundColor` is a legacy alias kept as a fallback for old payloads.
      background: typeof effects.background === 'string'
        ? effects.background
        : (typeof effects.backgroundColor === 'string' ? effects.backgroundColor : undefined),
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
  return formatTimeRemaining(new Date(expiresAt).getTime(), Date.now());
}

// ── W1 — Keyframes (portage 1:1 de KeyframeInterpolator.swift) ────────────────

export type StoryEasingName = 'linear' | 'easeIn' | 'easeOut' | 'easeInOut';

export interface StoryKeyframeData {
  time: number;          // secondes, RELATIF au startTime de l'objet porteur
  x?: number;            // normalisé 0-1
  y?: number;
  scale?: number;
  opacity?: number;
  easing?: StoryEasingName;
}

export function applyStoryEasing(easing: StoryEasingName, t: number): number {
  switch (easing) {
    case 'easeIn': return t * t;
    case 'easeOut': return 1 - (1 - t) * (1 - t);
    case 'easeInOut': return t < 0.5 ? 2 * t * t : 1 - ((-2 * t + 2) ** 2) / 2;
    default: return t;
  }
}

/** Portage exact de `KeyframeInterpolator.interpolate` : tri par time, un seul
 *  keyframe = constante, clamp avant le premier / après le dernier, sinon
 *  interpolation du segment avec l'easing du keyframe BAS. */
export function interpolateKeyframeChannel(
  channel: Array<{ time: number; value: number; easing: StoryEasingName }>,
  at: number
): number | undefined {
  if (channel.length === 0) return undefined;
  const sorted = [...channel].sort((a, b) => a.time - b.time);
  if (sorted.length === 1) return sorted[0].value;
  if (at <= sorted[0].time) return sorted[0].value;
  if (at >= sorted[sorted.length - 1].time) return sorted[sorted.length - 1].value;
  for (let i = 0; i < sorted.length - 1; i += 1) {
    const lo = sorted[i];
    const hi = sorted[i + 1];
    if (at >= lo.time && at <= hi.time) {
      const span = hi.time - lo.time;
      const u = span > 0 ? (at - lo.time) / span : 0;
      const eased = applyStoryEasing(lo.easing, u);
      return lo.value + (hi.value - lo.value) * eased;
    }
  }
  return undefined;
}

export interface ResolvedKeyframeState {
  x?: number;
  y?: number;
  scale?: number;
  opacity?: number;
}

/** État interpolé d'un objet à `playheadSec` (temps slide). `startTime` est
 *  celui de l'objet porteur — `keyframe.time` lui est relatif (spec 2.1). */
export function resolveKeyframeState(
  keyframes: StoryKeyframeData[] | undefined,
  playheadSec: number,
  startTime: number = 0
): ResolvedKeyframeState | null {
  if (!keyframes || keyframes.length === 0) return null;
  const local = playheadSec - startTime;
  const channel = (pick: (k: StoryKeyframeData) => number | undefined) =>
    keyframes.flatMap((k) => {
      const v = pick(k);
      return v == null ? [] : [{ time: k.time, value: v, easing: k.easing ?? ('linear' as StoryEasingName) }];
    });
  return {
    x: interpolateKeyframeChannel(channel((k) => k.x), local),
    y: interpolateKeyframeChannel(channel((k) => k.y), local),
    scale: interpolateKeyframeChannel(channel((k) => k.scale), local),
    opacity: interpolateKeyframeChannel(channel((k) => k.opacity), local),
  };
}

export interface StoryClipTransitionData {
  id?: string;
  fromClipId: string;
  toClipId: string;
  kind: 'crossfade' | 'dissolve';
  duration: number;
  easing?: StoryEasingName;
}

/**
 * W1 inc.4 — portage 1:1 de `ReaderTransitionResolver.opacity` (iOS, branché
 * au playback par R14) : facteur d'opacité d'un clip foreground sous ses
 * `clipTransitions` crossfade. Sortant : 1→0 sur `[end-d, end]` ; entrant :
 * 0→1 sur `[start, start+d]` ; multiplicatif quand plusieurs transitions
 * matchent ; `dissolve` ignoré (compositor-only, parité reader iOS) ; hors
 * fenêtre `[start, end]` du média → 0 ; interpolation linéaire (l'easing est
 * ignoré par le reader iOS). Clamp [0, 1].
 */
export function resolveClipTransitionOpacity(
  media: { id: string; startTime?: number; duration?: number },
  transitions: readonly StoryClipTransitionData[] | undefined,
  currentTime: number
): number {
  if (!transitions || transitions.length === 0) return 1;
  const start = media.startTime ?? 0;
  const end = start + (media.duration ?? 0);
  if (currentTime < start || currentTime > end) return 0;

  let opacity = 1;
  for (const tr of transitions) {
    if (tr.kind !== 'crossfade' || tr.duration <= 0) continue;
    const isOutgoing = tr.fromClipId === media.id;
    const isIncoming = tr.toClipId === media.id;
    if (!isOutgoing && !isIncoming) continue;
    const trStart = isOutgoing ? end - tr.duration : start;
    if (currentTime < trStart || currentTime > trStart + tr.duration) continue;
    const progress = (currentTime - trStart) / tr.duration;
    opacity *= isOutgoing ? 1 - progress : progress;
  }
  return Math.max(0, Math.min(1, opacity));
}
