/**
 * Canonical Prisma `select` / `include` shapes for Post-related queries.
 *
 * Single source of truth — every service that fetches Posts or PostMedia MUST
 * import these constants instead of redeclaring them. Drift between local
 * copies has caused production bugs (Prisme Linguistique fields silently
 * dropped from feed endpoints, etc.). See commit 42cae57 for the R1 fix that
 * motivated this consolidation.
 *
 * All exports are wrapped in `Prisma.validator<…Select>()` so a typo or a
 * stale field name fails the build instead of failing in production. The
 * `Prisma.<Model>GetPayload<...>` type exports give every consumer a fully
 * typed result without resorting to `as any`.
 */

import { Prisma } from '@meeshy/shared/prisma/client';

/**
 * MongoDB "live post" matcher for the `deletedAt` soft-delete column.
 *
 * Prisma's bare `{ deletedAt: null }` filter does NOT match documents where the
 * field is ABSENT on MongoDB — Prisma omits unset optional fields at insert
 * time, so every never-deleted Post stores no `deletedAt` key at all. The naive
 * `null` filter then silently drops EVERY live post, which emptied the feed /
 * reels / stories endpoints in production (all posts returned `data: []` while
 * the collection was full).
 *
 * Match on the field being unset instead — the same `isSet:false` pattern used
 * for `parentId` (commentsPreviewInclude below) and `expiresAt` (PostFeedService).
 * Soft-deleted posts always carry a real `deletedAt` date (`isSet:true`) and so
 * remain excluded.
 */
export const NOT_DELETED = { isSet: false };

export const authorSelect = Prisma.validator<Prisma.UserSelect>()({
  id: true,
  username: true,
  displayName: true,
  avatar: true,
});

/**
 * Canonical media select.
 *
 * Includes the Prisme Linguistique foundation fields:
 *   - language       : base language of this media
 *   - variantOf      : link to the source media when this is an auto-generated variant
 *   - transcription  : Whisper output for the base language
 *   - translations   : per-language TTS variants + sub-titles
 *
 * Adding a new field to PostMedia? Add it here ONCE.
 */
export const mediaSelect = Prisma.validator<Prisma.PostMediaSelect>()({
  id: true,
  fileName: true,
  originalName: true,
  mimeType: true,
  fileSize: true,
  fileUrl: true,
  width: true,
  height: true,
  thumbnailUrl: true,
  thumbHash: true,
  duration: true,
  order: true,
  caption: true,
  alt: true,
  language: true,
  variantOf: true,
  transcription: true,
  translations: true,
});

/**
 * Ordered media include block — the de facto way to attach media to any
 * Post query. Use as: `media: mediaInclude`.
 */
export const mediaInclude = Prisma.validator<Prisma.Post$mediaArgs>()({
  select: mediaSelect,
  orderBy: { order: 'asc' },
});

/**
 * Comment media include — the single media a comment may carry. Reuses
 * `mediaSelect` (same PostMedia shape, same Prisme fields) so a comment's
 * media is decoded identically to a post's media on every client.
 * A comment never holds more than one media, but the relation stays ordered.
 */
export const commentMediaInclude = Prisma.validator<Prisma.PostComment$mediaArgs>()({
  select: mediaSelect,
  orderBy: { order: 'asc' },
});

/**
 * Top-3 comments preview shape attached to every Post response.
 *
 * The `OR isSet:false` clause is REQUIRED — MongoDB documents that were
 * created before `parentId` existed in the schema don't have the field at all,
 * and a bare `parentId: null` filter silently drops them. Removing the OR
 * caused PostAudioService to broadcast `post:updated` payloads with empty
 * comment lists for older threads — see R3 of the stories media-model refactor.
 */
export const commentsPreviewInclude = Prisma.validator<Prisma.Post$commentsArgs>()({
  where: {
    deletedAt: NOT_DELETED,
    OR: [{ parentId: null }, { parentId: { isSet: false } }],
  },
  select: {
    id: true,
    content: true,
    originalLanguage: true,
    translations: true,
    likeCount: true,
    replyCount: true,
    createdAt: true,
    author: { select: authorSelect },
    // A comment's single media (image/video/audio + Prisme transcription/TTS).
    // Without this the feed/reels comments sheet — which reads top-level
    // comments ONLY from this post-embedded preview, never re-fetching them —
    // loses every comment attachment on reload, and contacts receiving the
    // post:updated broadcast see comments stripped of their media. Reuses the
    // canonical commentMediaInclude so the preview decodes exactly like getComments.
    media: commentMediaInclude,
  },
  orderBy: { likeCount: 'desc' },
  take: 3,
});

/**
 * Nested repost preview shape attached to every Post response.
 *
 * Includes `originalLanguage` + `translations` — required by the Prisme
 * Linguistique resolver on the client. Dropping either field strips a
 * repost down to its base language only, breaking translation rendering
 * for any user whose preferred language differs from the source.
 */
export const repostOfInclude = Prisma.validator<Prisma.Post$repostOfArgs>()({
  select: {
    id: true,
    type: true,
    content: true,
    originalLanguage: true,
    translations: true,
    storyEffects: true,
    audioUrl: true,
    moodEmoji: true,
    originalRepostOfId: true,
    author: { select: authorSelect },
    media: mediaInclude,
    createdAt: true,
    likeCount: true,
    commentCount: true,
  },
});

/**
 * G1(b) — lean tray projection for `GET /posts/feed/stories?projection=tray`.
 *
 * The story TRAY renders rings + author + latest thumbnail + viewed state:
 * it needs ids, timestamps, the author and the media rows (thumbnailUrl /
 * thumbHash), NOT the canvas (`storyEffects`), the content translations or
 * the comments preview — which dominate the full-body payload (50 stories
 * shipped whole). Opt-in per request; the full body stays the default so
 * every existing client keeps decoding unchanged. Reposted stories keep a
 * minimal `repostOf` (the shell's own media is empty — the thumbnail lives
 * on the original, same resolution as `toStoryGroups` client-side).
 */
export const trayStorySelect = Prisma.validator<Prisma.PostSelect>()({
  id: true,
  type: true,
  visibility: true,
  createdAt: true,
  updatedAt: true,
  expiresAt: true,
  originalRepostOfId: true,
  viewCount: true,
  author: { select: authorSelect },
  media: mediaInclude,
  repostOf: {
    select: {
      id: true,
      type: true,
      createdAt: true,
      author: { select: authorSelect },
      media: mediaInclude,
    },
  },
});

/**
 * Canonical post include — single source of truth used by every service that
 * needs a fully-hydrated Post (PostService, PostFeedService, PostAudioService,
 * etc.). DO NOT redeclare a local copy: drift between copies is what caused
 * R1 (feed missing Prisme fields) and R3 (audio service stripping reposts).
 */
export const postInclude = Prisma.validator<Prisma.PostInclude>()({
  author: { select: authorSelect },
  media: mediaInclude,
  comments: commentsPreviewInclude,
  repostOf: repostOfInclude,
});

// ============================================================================
// Derived payload types — consumers get fully-typed results, no `as any`.
// ============================================================================

/** Public-author identity attached to every Post / Comment response. */
export type AuthorPayload = Prisma.UserGetPayload<{ select: typeof authorSelect }>;

/** Single PostMedia row as returned by every Post response. */
export type MediaPayload = Prisma.PostMediaGetPayload<{ select: typeof mediaSelect }>;

/** Fully-hydrated Post — author + media + top-3 comments + repostOf. */
export type PostPayload = Prisma.PostGetPayload<{ include: typeof postInclude }>;
