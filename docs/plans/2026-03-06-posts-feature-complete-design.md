# Posts Feature — Complete Design

**Date**: 2026-03-06
**Scope**: End-to-end posts feature for iOS with translations, feed algorithm, and full UI

## Overview

Implement the complete posts feature on iOS with Prisme Linguistique integration (automatic translation), engagement+affinity feed ranking, post detail view, bookmarks, reposts/quotes, and real-time socket updates.

## What Already Exists

- Composer embedded in FeedView (text + media + audio + status)
- FeedViewModel with `createPost`, `loadFeed`, `likePost`, `bookmarkPost`
- FeedPostCard, FeedCommentsSheet, FeedView+Attachments
- AudioPostComposerView, StatusComposerView
- SDK: PostService (CRUD, like, bookmark, comment, repost, share)
- Backend: Prisma schema (Post, PostMedia, PostComment, PostView, PostBookmark), routes, socket handlers

## Section 1: Models & Translations (Prisme Linguistique)

### FeedPost Model Updates

Add translation fields to `FeedPost` (SDK):
```swift
translations: [String: PostTranslation]?  // { "en": { text, model, confidence } }
originalLanguage: String?
translatedContent: String?  // resolved content for user's language
```

### Translation Pipeline

- On post creation → backend segments content by sentences (reuses `segment_by_sentences_and_lines()`)
- Pre-translate top 5 languages (fr, en, es, ar, pt) immediately
- Other languages = on-demand on first view by a user of that language
- Short segments → better cache-hit between similar posts
- Socket `post:translation-updated` for real-time push

### Translation UI

- Content displayed in language resolved by `resolveUserLanguage()`
- Subtle translate icon indicator when content is translated
- Long-press → sheet "View original" + available languages
- Comments translated with same mechanism

### Out of Scope (TODOs)

- `// TODO: Post draft management (save/restore)`
- `// TODO: PostComposerViewModel (extract state from FeedView)`
- `// TODO: Media picker abstraction layer`
- `// TODO: Post preview modal before publishing`

## Section 2: Feed Algorithm (Engagement + Affinity)

### Hybrid Score

```
score = (0.35 × recency_score)
      + (0.25 × engagement_score)
      + (0.30 × affinity_score)
      + (0.10 × language_boost)
```

| Factor | Calculation |
|--------|-------------|
| **Recency** | Exponential decay from `createdAt` (half-life ~6h) |
| **Engagement** | Normalized `likeCount + commentCount×2 + repostCount×3 + viewCount×0.1` |
| **Affinity** | Past interactions with author (likes, comments, DMs) + shared communities |
| **Language** | Boost if `originalLanguage` == user language (no translation needed) |

### Backend Implementation

- New endpoint `GET /posts/feed` with scoring (replaces chronological feed)
- MongoDB aggregation pipeline for posts < 7 days
- Redis cache of computed feed per user (TTL 5 min)
- Chronological fallback if insufficient affinity data

### Out of Scope (TODOs)

- `// TODO: ML-based embedding scoring (cosine similarity)`
- `// TODO: Feed diversification (anti-filter-bubble)`
- `// TODO: A/B testing framework for weights`
- `// TODO: Topic/hashtag-based affinity`

## Section 3: iOS Views

### 3a. Enhanced Feed (modify existing FeedView)

- Translation indicator on each FeedPostCard
- Long-press for original/other languages
- Visibility selector in existing composer (Public/Friends/Private)
- Pull-to-refresh and infinite pagination preserved
- "New posts" badge preserved (socket `post:created`)

### 3b. PostDetailView (NEW)

- Dedicated full post view
- Translated content + all paginated comments
- Nested reply threads
- Comment composer at bottom
- Actions: like, repost, bookmark, share
- Navigation: push on NavigationStack via Router

### 3c. BookmarksView (NEW)

- List of user's bookmarked posts
- New endpoint `GET /posts/bookmarks` backend
- Reuses FeedPostCard
- Accessible from profile/settings

### 3d. RepostView / QuoteComposer (NEW)

- Simple repost = 1 tap → confirmation → `PostService.repost(postId:)`
- Quote = opens composer with original post embedded (preview)
- Original post displayed in indented frame under quote content

### 3e. Router Additions

```swift
case postDetail(postId: String)
case bookmarks
```

### Out of Scope (TODOs)

- `// TODO: Post editing (edit after publishing)`
- `// TODO: Post pinning (pin to profile top)`
- `// TODO: Native iOS share sheet (UIActivityViewController)`
- `// TODO: Deep links to posts (URL scheme)`
- `// TODO: User profile with their posts`

## Section 4: Backend — Routes, Services, Socket Events

### New Endpoints

| Method | Route | Description |
|--------|-------|-------------|
| `GET` | `/posts/feed` | Feed with scoring |
| `GET` | `/posts/bookmarks` | User's bookmarked posts |
| `GET` | `/posts/:id` | Post detail with translations |
| `GET` | `/posts/:id/comments` | Paginated comments with translations |
| `POST` | `/posts/:id/translate` | On-demand translation request |
| `DELETE` | `/posts/:id/bookmark` | Remove bookmark |

### New Services

- **PostFeedService**: Score calculation, aggregation pipeline, Redis cache
- **PostTranslationService**: Sentence segmentation, pre-translate top 5, on-demand for rest. Reuses `ZmqTranslationClient` and `TranslationCache`.
- Modify **PostsService**: add `originalLanguage` on creation, trigger async translation

### New Socket Events

| Event | Direction | Payload |
|-------|-----------|---------|
| `post:translation-updated` | server → client | `{ postId, language, translation }` |
| `comment:translation-updated` | server → client | `{ commentId, language, translation }` |

### Translation Pipeline Flow

```
Post created → PostsService.create()
  → detect originalLanguage
  → segment by sentences (segment_by_sentences_and_lines)
  → ZMQ PUSH to translator (top 5 languages)
  → translator translates each segment
  → ZMQ PUB response → PostTranslationService
  → store in Post.translations (MongoDB)
  → socket emit post:translation-updated
```

### Out of Scope (TODOs)

- `// TODO: Translation quality feedback (user reports bad translation)`
- `// TODO: Custom translation model per community`
- `// TODO: Hashtag/mention parsing in content`
- `// TODO: Content moderation pipeline (auto-flag)`
- `// TODO: Rate limiting per-user on post creation`
