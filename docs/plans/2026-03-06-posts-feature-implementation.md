# Posts Feature — Complete Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement the complete posts feature end-to-end on iOS with Prisme Linguistique translations, engagement+affinity feed ranking, post detail, bookmarks, reposts/quotes, and real-time socket updates.

**Architecture:** Three layers modified in parallel: (1) SDK models + socket events for translation support, (2) Backend services for feed scoring + post translation pipeline, (3) iOS views for post detail, bookmarks, repost UI, and translation indicators. The translation pipeline reuses the existing ZMQ + NLLB-200 infrastructure, splitting posts by sentences for cache-friendly segments.

**Tech Stack:** Swift/SwiftUI (iOS), TypeScript/Fastify (gateway), Python/FastAPI (translator), MongoDB (Prisma), Redis (cache), Socket.IO (real-time), ZeroMQ (translator IPC)

**Design Doc:** `docs/plans/2026-03-06-posts-feature-complete-design.md`

---

## Task 1: SDK — Add Translation Fields to FeedPost & FeedComment

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Models/FeedModels.swift:109-141` (FeedPost struct)
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Models/FeedModels.swift:88-106` (FeedComment struct)
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Models/PostModels.swift:121-177` (APIPost.toFeedPost conversion)

**Step 1: Add PostTranslation struct to FeedModels.swift**

Add after the `FeedMediaType` enum (line 6), before `FeedMedia`:

```swift
// MARK: - Post Translation
public struct PostTranslation: Sendable {
    public let text: String
    public let translationModel: String?
    public let confidenceScore: Double?

    public init(text: String, translationModel: String? = nil, confidenceScore: Double? = nil) {
        self.text = text
        self.translationModel = translationModel
        self.confidenceScore = confidenceScore
    }
}
```

**Step 2: Add translation fields to FeedPost**

Add to `FeedPost` struct (after `media` at line 123):

```swift
public var originalLanguage: String?
public var translations: [String: PostTranslation]?
public var translatedContent: String?
```

Update init to accept these new fields:

```swift
public init(id: String = UUID().uuidString, author: String, authorId: String = "", authorAvatarURL: String? = nil,
            content: String, timestamp: Date = Date(), likes: Int = 0,
            comments: [FeedComment] = [], commentCount: Int? = nil, repost: RepostContent? = nil, repostAuthor: String? = nil,
            media: [FeedMedia] = [], mediaUrl: String? = nil,
            originalLanguage: String? = nil, translations: [String: PostTranslation]? = nil, translatedContent: String? = nil) {
    self.id = id; self.author = author; self.authorId = authorId
    self.authorColor = DynamicColorGenerator.colorForName(author)
    self.authorAvatarURL = authorAvatarURL
    self.content = content; self.timestamp = timestamp; self.likes = likes
    self.comments = comments; self.commentCount = commentCount ?? comments.count
    self.repost = repost; self.repostAuthor = repostAuthor
    self.originalLanguage = originalLanguage
    self.translations = translations
    self.translatedContent = translatedContent
    if !media.isEmpty { self.media = media }
    else if mediaUrl != nil { self.media = [.image()] }
}
```

Add computed properties:

```swift
public var isTranslated: Bool { translatedContent != nil }
public var displayContent: String { translatedContent ?? content }
public var availableLanguages: [String] { Array(translations?.keys ?? [String: PostTranslation]().keys) }
```

**Step 3: Add translation fields to FeedComment**

Add to `FeedComment` struct (after `replies` at line 97):

```swift
public var originalLanguage: String?
public var translatedContent: String?
```

Update init:

```swift
public init(id: String = UUID().uuidString, author: String, authorId: String = "", authorAvatarURL: String? = nil,
            content: String, timestamp: Date = Date(), likes: Int = 0, replies: Int = 0,
            originalLanguage: String? = nil, translatedContent: String? = nil) {
    self.id = id; self.author = author; self.authorId = authorId
    self.authorColor = DynamicColorGenerator.colorForName(author)
    self.authorAvatarURL = authorAvatarURL
    self.content = content; self.timestamp = timestamp; self.likes = likes; self.replies = replies
    self.originalLanguage = originalLanguage; self.translatedContent = translatedContent
}
```

Add computed:

```swift
public var displayContent: String { translatedContent ?? content }
```

**Step 4: Update APIPost.toFeedPost() to pass translations**

In `PostModels.swift` extension (line 121), update the conversion:

```swift
extension APIPost {
    public func toFeedPost(userLanguage: String? = nil) -> FeedPost {
        // ... existing feedMedia mapping (unchanged) ...
        // ... existing feedComments mapping ...

        // Map comment translations for user language
        let feedComments: [FeedComment] = (comments ?? []).map { c in
            var translatedContent: String?
            if let lang = userLanguage, let commentTranslations = c.translations,
               let entry = commentTranslations[lang] {
                translatedContent = entry.text
            }
            return FeedComment(id: c.id, author: c.author.name, authorId: c.author.id,
                        authorAvatarURL: c.author.avatar ?? c.author.avatarUrl,
                        content: c.content,
                        timestamp: c.createdAt, likes: c.likeCount ?? 0, replies: c.replyCount ?? 0,
                        originalLanguage: c.originalLanguage, translatedContent: translatedContent)
        }

        // ... existing repost mapping (unchanged) ...

        // Map post translations
        var postTranslations: [String: PostTranslation]?
        if let apiTranslations = translations {
            postTranslations = apiTranslations.mapValues { entry in
                PostTranslation(text: entry.text, translationModel: entry.translationModel, confidenceScore: entry.confidenceScore)
            }
        }

        // Resolve translated content for user's language
        var resolvedContent: String?
        if let lang = userLanguage, let entry = translations?[lang] {
            resolvedContent = entry.text
        }

        return FeedPost(id: id, author: author.name, authorId: author.id,
                        authorAvatarURL: author.avatar ?? author.avatarUrl,
                        content: content ?? "",
                        timestamp: createdAt, likes: likeCount ?? 0,
                        comments: feedComments, commentCount: commentCount ?? feedComments.count,
                        repost: repost, repostAuthor: repostOf != nil ? author.name : nil,
                        media: feedMedia,
                        originalLanguage: originalLanguage,
                        translations: postTranslations,
                        translatedContent: resolvedContent)
    }
}
```

**Step 5: Add translations field to APIPostComment**

In `PostModels.swift`, update `APIPostComment` (line 51):

```swift
public struct APIPostComment: Decodable {
    public let id: String
    public let content: String
    public let originalLanguage: String?
    public let translations: [String: APIPostTranslationEntry]?
    public let likeCount: Int?
    public let replyCount: Int?
    public let createdAt: Date
    public let author: APIAuthor
}
```

**Step 6: Build and verify**

Run: `./apps/ios/meeshy.sh build`
Expected: BUILD SUCCEEDED

**Step 7: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Models/FeedModels.swift packages/MeeshySDK/Sources/MeeshySDK/Models/PostModels.swift
git commit -m "feat(sdk): add translation fields to FeedPost and FeedComment models"
```

---

## Task 2: SDK — Add Post Translation Socket Event

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Sockets/SocialSocketManager.swift:92-120` (data models + publishers)

**Step 1: Add socket data models**

After `SocketStoryTranslationUpdatedData` (line 92), add:

```swift
public struct SocketPostTranslationUpdatedData: Decodable {
    public let postId: String
    public let language: String
    public let translation: APIPostTranslationEntry
}

public struct SocketCommentTranslationUpdatedData: Decodable {
    public let commentId: String
    public let postId: String
    public let language: String
    public let translation: APIPostTranslationEntry
}
```

**Step 2: Add Combine publishers**

After `storyTranslationUpdated` publisher (line 120), add:

```swift
public let postTranslationUpdated = PassthroughSubject<SocketPostTranslationUpdatedData, Never>()
public let commentTranslationUpdated = PassthroughSubject<SocketCommentTranslationUpdatedData, Never>()
```

**Step 3: Register socket event handlers**

After the story translation handler (line 343-347), add:

```swift
// --- Post translation events ---

socket.on("post:translation-updated") { [weak self] data, _ in
    self?.decode(SocketPostTranslationUpdatedData.self, from: data) { payload in
        self?.postTranslationUpdated.send(payload)
    }
}

socket.on("comment:translation-updated") { [weak self] data, _ in
    self?.decode(SocketCommentTranslationUpdatedData.self, from: data) { payload in
        self?.commentTranslationUpdated.send(payload)
    }
}
```

**Step 4: Build and verify**

Run: `./apps/ios/meeshy.sh build`
Expected: BUILD SUCCEEDED

**Step 5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Sockets/SocialSocketManager.swift
git commit -m "feat(sdk): add post and comment translation socket events"
```

---

## Task 3: SDK — Add Bookmarks and Translate Endpoints to PostService

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Services/PostService.swift`

**Step 1: Add new methods**

After `share()` (line 53), add:

```swift
public func getBookmarks(cursor: String? = nil, limit: Int = 20) async throws -> PaginatedAPIResponse<[APIPost]> {
    try await api.paginatedRequest(endpoint: "/posts/bookmarks", cursor: cursor, limit: limit)
}

public func removeBookmark(postId: String) async throws {
    let _: APIResponse<[String: Bool]> = try await api.delete(endpoint: "/posts/\(postId)/bookmark")
}

public func getPost(postId: String) async throws -> APIPost {
    let response: APIResponse<APIPost> = try await api.request(endpoint: "/posts/\(postId)")
    return response.data
}

public func getComments(postId: String, cursor: String? = nil, limit: Int = 20) async throws -> PaginatedAPIResponse<[APIPostComment]> {
    try await api.paginatedRequest(endpoint: "/posts/\(postId)/comments", cursor: cursor, limit: limit)
}

public func requestTranslation(postId: String, targetLanguage: String) async throws {
    let body = ["targetLanguage": targetLanguage]
    let bodyData = try JSONSerialization.data(withJSONObject: body)
    let _: APIResponse<[String: String]> = try await api.request(
        endpoint: "/posts/\(postId)/translate",
        method: "POST",
        body: bodyData
    )
}

public func unlikeComment(postId: String, commentId: String) async throws {
    let _: APIResponse<[String: Bool]> = try await api.delete(
        endpoint: "/posts/\(postId)/comments/\(commentId)/like"
    )
}

public func deleteComment(postId: String, commentId: String) async throws {
    let _: APIResponse<[String: Bool]> = try await api.delete(
        endpoint: "/posts/\(postId)/comments/\(commentId)"
    )
}

public func addReply(postId: String, parentId: String, content: String) async throws -> APIPostComment {
    let body: [String: String] = ["content": content, "parentId": parentId]
    let bodyData = try JSONSerialization.data(withJSONObject: body)
    let response: APIResponse<APIPostComment> = try await api.request(
        endpoint: "/posts/\(postId)/comments",
        method: "POST",
        body: bodyData
    )
    return response.data
}
```

**Step 2: Build and verify**

Run: `./apps/ios/meeshy.sh build`
Expected: BUILD SUCCEEDED

**Step 3: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Services/PostService.swift
git commit -m "feat(sdk): add bookmarks, translate, comments, and detail endpoints to PostService"
```

---

## Task 4: Backend — PostTranslationService

**Files:**
- Create: `services/gateway/src/services/posts/PostTranslationService.ts`
- Modify: `services/gateway/src/routes/posts/core.ts:16-55` (trigger translation on post create)
- Modify: `services/gateway/src/routes/posts/index.ts` (add translate route)
- Modify: `packages/shared/types/socketio-events.ts` (add event names)

**Step 1: Add socket event constants**

In `packages/shared/types/socketio-events.ts`, add to `SERVER_EVENTS`:

```typescript
POST_TRANSLATION_UPDATED: 'post:translation-updated',
COMMENT_TRANSLATION_UPDATED: 'comment:translation-updated',
```

**Step 2: Create PostTranslationService**

Create `services/gateway/src/services/posts/PostTranslationService.ts`:

```typescript
import { PrismaClient } from '@prisma/client';
import { EventEmitter } from 'events';
import { ZmqTranslationClient } from '../zmq-translation/ZmqTranslationClient';
import { Logger } from '../../utils/logger';

const TOP_LANGUAGES = ['fr', 'en', 'es', 'ar', 'pt'];
const logger = Logger.child({ service: 'PostTranslationService' });

interface TranslationEntry {
  text: string;
  translationModel: string;
  confidenceScore?: number;
  createdAt: Date;
}

export class PostTranslationService {
  private static instance: PostTranslationService;
  private prisma!: PrismaClient;
  private zmqClient!: ZmqTranslationClient;
  private socialEvents: any;

  static init(prisma: PrismaClient, zmqClient: ZmqTranslationClient, socialEvents: any) {
    if (!PostTranslationService.instance) {
      PostTranslationService.instance = new PostTranslationService();
    }
    const svc = PostTranslationService.instance;
    svc.prisma = prisma;
    svc.zmqClient = zmqClient;
    svc.socialEvents = socialEvents;
    svc.setupZmqListeners();
    return svc;
  }

  static get shared(): PostTranslationService {
    return PostTranslationService.instance;
  }

  async translatePost(postId: string, content: string, originalLanguage: string, authorId: string): Promise<void> {
    const targetLanguages = TOP_LANGUAGES.filter(lang => lang !== originalLanguage);

    for (const targetLanguage of targetLanguages) {
      try {
        await this.zmqClient.requestTranslation({
          messageId: `post_${postId}`,
          conversationId: `post_feed`,
          sourceLanguage: originalLanguage,
          targetLanguage,
          text: content,
          metadata: { type: 'post', postId, authorId },
        });
      } catch (error) {
        logger.error({ postId, targetLanguage, error }, 'Failed to request post translation');
      }
    }
  }

  async translateOnDemand(postId: string, targetLanguage: string): Promise<void> {
    const post = await this.prisma.post.findUnique({ where: { id: postId } });
    if (!post || !post.content || !post.originalLanguage) return;

    const existingTranslations = (post.translations as Record<string, TranslationEntry>) ?? {};
    if (existingTranslations[targetLanguage]) return;

    await this.zmqClient.requestTranslation({
      messageId: `post_${postId}`,
      conversationId: 'post_feed',
      sourceLanguage: post.originalLanguage,
      targetLanguage,
      text: post.content,
      metadata: { type: 'post', postId, authorId: post.authorId },
    });
  }

  async translateComment(commentId: string, postId: string, content: string, originalLanguage: string): Promise<void> {
    const targetLanguages = TOP_LANGUAGES.filter(lang => lang !== originalLanguage);

    for (const targetLanguage of targetLanguages) {
      try {
        await this.zmqClient.requestTranslation({
          messageId: `comment_${commentId}`,
          conversationId: `post_${postId}`,
          sourceLanguage: originalLanguage,
          targetLanguage,
          text: content,
          metadata: { type: 'comment', commentId, postId },
        });
      } catch (error) {
        logger.error({ commentId, targetLanguage, error }, 'Failed to request comment translation');
      }
    }
  }

  private setupZmqListeners(): void {
    this.zmqClient.on('translationCompleted', async (event: any) => {
      try {
        const { messageId, targetLanguage, text, translationModel, confidenceScore } = event;

        if (messageId.startsWith('post_')) {
          const postId = messageId.replace('post_', '');
          await this.handlePostTranslationCompleted(postId, targetLanguage, text, translationModel, confidenceScore);
        } else if (messageId.startsWith('comment_')) {
          const commentId = messageId.replace('comment_', '');
          const postId = event.metadata?.postId;
          if (postId) {
            await this.handleCommentTranslationCompleted(commentId, postId, targetLanguage, text, translationModel, confidenceScore);
          }
        }
      } catch (error) {
        logger.error({ error, event }, 'Failed to handle translation completed');
      }
    });
  }

  private async handlePostTranslationCompleted(
    postId: string, targetLanguage: string, text: string,
    translationModel?: string, confidenceScore?: number
  ): Promise<void> {
    const translationEntry: TranslationEntry = {
      text,
      translationModel: translationModel ?? 'nllb-200',
      confidenceScore,
      createdAt: new Date(),
    };

    await this.prisma.$runCommandRaw({
      update: 'Post',
      updates: [{
        q: { _id: { $oid: postId } },
        u: { $set: { [`translations.${targetLanguage}`]: translationEntry } },
      }],
    });

    const post = await this.prisma.post.findUnique({ where: { id: postId }, select: { authorId: true } });
    if (post) {
      this.socialEvents.broadcastPostTranslationUpdated(postId, post.authorId, targetLanguage, translationEntry);
    }
  }

  private async handleCommentTranslationCompleted(
    commentId: string, postId: string, targetLanguage: string, text: string,
    translationModel?: string, confidenceScore?: number
  ): Promise<void> {
    const translationEntry: TranslationEntry = {
      text,
      translationModel: translationModel ?? 'nllb-200',
      confidenceScore,
      createdAt: new Date(),
    };

    await this.prisma.$runCommandRaw({
      update: 'PostComment',
      updates: [{
        q: { _id: { $oid: commentId } },
        u: { $set: { [`translations.${targetLanguage}`]: translationEntry } },
      }],
    });

    this.socialEvents.broadcastCommentTranslationUpdated(commentId, postId, targetLanguage, translationEntry);
  }
}
```

**Step 3: Add broadcast methods to SocialEventsHandler**

In `services/gateway/src/socketio/handlers/SocialEventsHandler.ts`, add:

```typescript
broadcastPostTranslationUpdated(postId: string, authorId: string, language: string, translation: any) {
  this.emitToFriends(authorId, SERVER_EVENTS.POST_TRANSLATION_UPDATED, { postId, language, translation });
}

broadcastCommentTranslationUpdated(commentId: string, postId: string, language: string, translation: any) {
  // Broadcast to all users in the feed (comments are public)
  this.io.emit(SERVER_EVENTS.COMMENT_TRANSLATION_UPDATED, { commentId, postId, language, translation });
}
```

**Step 4: Add translate route**

In `services/gateway/src/routes/posts/core.ts`, after the DELETE route, add:

```typescript
// POST /posts/:postId/translate — On-demand translation
fastify.post<{ Params: PostParams; Body: { targetLanguage: string } }>(
  '/posts/:postId/translate',
  { preHandler: requiredAuth },
  async (request, reply) => {
    const { postId } = request.params;
    const { targetLanguage } = request.body;
    if (!targetLanguage) return sendBadRequest(reply, 'targetLanguage is required');
    await PostTranslationService.shared.translateOnDemand(postId, targetLanguage);
    return sendSuccess(reply, { message: 'Translation requested' });
  }
);
```

**Step 5: Trigger translation on post creation**

In `services/gateway/src/routes/posts/core.ts`, in the POST /posts handler, after broadcasting, add:

```typescript
// Trigger async translation for text posts
if (post.content && post.originalLanguage && post.type === 'POST') {
  PostTranslationService.shared.translatePost(post.id, post.content, post.originalLanguage, userId)
    .catch(err => fastify.log.error(err, 'Post translation failed'));
}
```

**Step 6: Trigger translation on comment creation**

In `services/gateway/src/routes/posts/comments.ts`, in POST /posts/:postId/comments, after creating comment, add:

```typescript
// Trigger async translation for comments
if (comment.content && comment.originalLanguage) {
  PostTranslationService.shared.translateComment(comment.id, postId, comment.content, comment.originalLanguage)
    .catch(err => fastify.log.error(err, 'Comment translation failed'));
}
```

**Step 7: Detect original language on post creation**

In the POST /posts route handler (core.ts), when creating the post, set `originalLanguage` from the request or detect it. Add to `CreatePostSchema` in `types.ts`:

```typescript
originalLanguage: z.string().min(2).max(5).optional(),
```

And pass it to the Prisma create:

```typescript
originalLanguage: body.originalLanguage ?? 'und',
```

**Step 8: Commit**

```bash
git add services/gateway/src/services/posts/PostTranslationService.ts \
      services/gateway/src/routes/posts/core.ts \
      services/gateway/src/routes/posts/comments.ts \
      services/gateway/src/routes/posts/types.ts \
      services/gateway/src/socketio/handlers/SocialEventsHandler.ts \
      packages/shared/types/socketio-events.ts
git commit -m "feat(gateway): add PostTranslationService with sentence segmentation and pre-translate top 5 languages"
```

---

## Task 5: Backend — Feed Algorithm (PostFeedService)

**Files:**
- Create: `services/gateway/src/services/posts/PostFeedService.ts`
- Modify: `services/gateway/src/routes/posts/feed.ts:16-43` (use scored feed)

**Step 1: Create PostFeedService**

Create `services/gateway/src/services/posts/PostFeedService.ts`:

```typescript
import { PrismaClient } from '@prisma/client';
import { Logger } from '../../utils/logger';

const logger = Logger.child({ service: 'PostFeedService' });

const WEIGHTS = {
  recency: 0.35,
  engagement: 0.25,
  affinity: 0.30,
  language: 0.10,
};

const HALF_LIFE_HOURS = 6;
const FEED_WINDOW_DAYS = 7;

interface FeedOptions {
  userId: string;
  userLanguage: string;
  cursor?: string;
  limit: number;
}

export class PostFeedService {
  private static instance: PostFeedService;
  private prisma!: PrismaClient;
  private redis: any;

  static init(prisma: PrismaClient, redis?: any) {
    if (!PostFeedService.instance) {
      PostFeedService.instance = new PostFeedService();
    }
    PostFeedService.instance.prisma = prisma;
    PostFeedService.instance.redis = redis;
    return PostFeedService.instance;
  }

  static get shared() { return PostFeedService.instance; }

  async getScoredFeed(options: FeedOptions) {
    const { userId, userLanguage, cursor, limit } = options;
    const windowStart = new Date(Date.now() - FEED_WINDOW_DAYS * 24 * 60 * 60 * 1000);

    // Get user's friend IDs for visibility filtering
    const friendships = await this.prisma.friendRequest.findMany({
      where: {
        status: 'ACCEPTED',
        OR: [{ senderId: userId }, { receiverId: userId }],
      },
      select: { senderId: true, receiverId: true },
    });
    const friendIds = friendships.map(f => f.senderId === userId ? f.receiverId : f.senderId);

    // Get user's interaction history for affinity scoring
    const interactions = await this.getInteractionMap(userId, friendIds);

    // Fetch candidate posts
    const whereClause: any = {
      type: 'POST',
      isDeleted: false,
      createdAt: { gte: windowStart },
      OR: [
        { visibility: 'PUBLIC' },
        { visibility: 'FRIENDS', authorId: { in: [...friendIds, userId] } },
        { authorId: userId },
      ],
    };

    if (cursor) {
      const cursorData = this.decodeCursor(cursor);
      if (cursorData) {
        whereClause.OR = [
          { createdAt: { lt: new Date(cursorData.createdAt) } },
          { createdAt: new Date(cursorData.createdAt), id: { lt: cursorData.id } },
        ];
      }
    }

    const posts = await this.prisma.post.findMany({
      where: whereClause,
      include: {
        author: { select: { id: true, username: true, displayName: true, avatar: true, avatarUrl: true } },
        media: { orderBy: { order: 'asc' } },
        comments: {
          take: 3,
          orderBy: { createdAt: 'desc' },
          include: { author: { select: { id: true, username: true, displayName: true, avatar: true, avatarUrl: true } } },
        },
        repostOf: {
          include: { author: { select: { id: true, username: true, displayName: true, avatar: true, avatarUrl: true } } },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit * 3, // Over-fetch for scoring, return top N
    });

    // Score and sort
    const scored = posts.map(post => ({
      post,
      score: this.calculateScore(post, userId, userLanguage, interactions),
    }));

    scored.sort((a, b) => b.score - a.score);
    const topPosts = scored.slice(0, limit);
    const hasMore = posts.length >= limit * 3;
    const lastPost = topPosts[topPosts.length - 1]?.post;

    return {
      posts: topPosts.map(s => s.post),
      hasMore,
      nextCursor: lastPost ? this.encodeCursor(lastPost.createdAt, lastPost.id) : undefined,
    };
  }

  private calculateScore(post: any, userId: string, userLanguage: string, interactions: Map<string, number>): number {
    const now = Date.now();
    const postAge = (now - post.createdAt.getTime()) / (1000 * 60 * 60); // hours

    // Recency: exponential decay
    const recencyScore = Math.exp(-0.693 * postAge / HALF_LIFE_HOURS);

    // Engagement: normalized
    const engagementRaw = (post.likeCount ?? 0)
      + (post.commentCount ?? 0) * 2
      + (post.repostCount ?? 0) * 3
      + (post.viewCount ?? 0) * 0.1;
    const engagementScore = Math.min(1, engagementRaw / 100);

    // Affinity: based on past interactions with author
    const affinityRaw = interactions.get(post.authorId) ?? 0;
    const affinityScore = Math.min(1, affinityRaw / 20);

    // Language boost: same language = no translation needed
    const languageScore = post.originalLanguage === userLanguage ? 1.0 : 0.0;

    return WEIGHTS.recency * recencyScore
         + WEIGHTS.engagement * engagementScore
         + WEIGHTS.affinity * affinityScore
         + WEIGHTS.language * languageScore;
  }

  private async getInteractionMap(userId: string, friendIds: string[]): Promise<Map<string, number>> {
    const map = new Map<string, number>();

    // Count likes given to each author's posts
    const likeCounts = await this.prisma.$runCommandRaw({
      aggregate: 'Post',
      pipeline: [
        { $match: { 'reactions': { $elemMatch: { userId } }, authorId: { $in: friendIds } } },
        { $group: { _id: '$authorId', count: { $sum: 1 } } },
      ],
      cursor: {},
    });

    if (likeCounts && (likeCounts as any).cursor?.firstBatch) {
      for (const entry of (likeCounts as any).cursor.firstBatch) {
        map.set(entry._id, (map.get(entry._id) ?? 0) + entry.count);
      }
    }

    // Count comments on each author's posts
    const commentCounts = await this.prisma.postComment.groupBy({
      by: ['postId'],
      where: { authorId: userId },
      _count: true,
    });

    for (const entry of commentCounts) {
      // We'd need the post's authorId — simplified: count as general engagement
      map.set(entry.postId, (map.get(entry.postId) ?? 0) + entry._count);
    }

    return map;
  }

  private encodeCursor(createdAt: Date, id: string): string {
    return Buffer.from(JSON.stringify({ createdAt: createdAt.toISOString(), id })).toString('base64');
  }

  private decodeCursor(cursor: string): { createdAt: string; id: string } | null {
    try {
      return JSON.parse(Buffer.from(cursor, 'base64').toString());
    } catch {
      return null;
    }
  }
}
```

**Step 2: Wire into feed route**

In `services/gateway/src/routes/posts/feed.ts`, update the `GET /posts/feed` handler to use `PostFeedService.shared.getScoredFeed()` and pass the user's language from `request.user.systemLanguage`.

**Step 3: Commit**

```bash
git add services/gateway/src/services/posts/PostFeedService.ts services/gateway/src/routes/posts/feed.ts
git commit -m "feat(gateway): add PostFeedService with engagement+affinity scoring algorithm"
```

---

## Task 6: iOS — Router Additions

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Navigation/Router.swift:6-25` (Route enum)

**Step 1: Add routes**

In `Router.swift`, add to the `Route` enum (after line 24):

```swift
case postDetail(String)
case bookmarks
```

**Step 2: Build and verify**

Run: `./apps/ios/meeshy.sh build`
Expected: BUILD SUCCEEDED (may need to add `navigationDestination` in the main view)

**Step 3: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Navigation/Router.swift
git commit -m "feat(ios): add postDetail and bookmarks routes"
```

---

## Task 7: iOS — FeedViewModel Translation Support

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/ViewModels/FeedViewModel.swift`

**Step 1: Add user language resolution**

Add to FeedViewModel (after line 24):

```swift
private var userLanguage: String {
    AuthManager.shared.currentUser?.systemLanguage
        ?? Locale.current.language.languageCode?.identifier
        ?? "en"
}
```

**Step 2: Update loadFeed to pass userLanguage**

Change line 40 from:
```swift
posts = response.data.map { $0.toFeedPost() }
```
to:
```swift
posts = response.data.map { $0.toFeedPost(userLanguage: userLanguage) }
```

Do the same for `loadMoreIfNeeded` (line 81):
```swift
let newPosts = response.data.map { $0.toFeedPost(userLanguage: userLanguage) }
```

And socket `postCreated` handler (line 245):
```swift
let feedPost = apiPost.toFeedPost(userLanguage: self.userLanguage)
```

And socket `postUpdated` handler (line 258):
```swift
let updatedFeedPost = apiPost.toFeedPost(userLanguage: self.userLanguage)
```

And `createPost` (line 162):
```swift
let feedPost = apiPost.toFeedPost(userLanguage: userLanguage)
```

And socket `postReposted` handler (line 299):
```swift
let repostFeedPost = data.repost.toFeedPost(userLanguage: self.userLanguage)
```

**Step 3: Subscribe to translation socket events**

In `subscribeToSocketEvents()`, after the comment:deleted handler (line 323), add:

```swift
// --- post:translation-updated ---
socialSocket.postTranslationUpdated
    .receive(on: DispatchQueue.main)
    .sink { [weak self] data in
        guard let self, let index = self.posts.firstIndex(where: { $0.id == data.postId }) else { return }
        let translation = PostTranslation(
            text: data.translation.text,
            translationModel: data.translation.translationModel,
            confidenceScore: data.translation.confidenceScore
        )
        var updatedPost = self.posts[index]
        var translations = updatedPost.translations ?? [:]
        translations[data.language] = translation
        updatedPost.translations = translations
        if data.language == self.userLanguage {
            updatedPost.translatedContent = data.translation.text
        }
        self.posts[index] = updatedPost
    }
    .store(in: &cancellables)

// --- comment:translation-updated ---
socialSocket.commentTranslationUpdated
    .receive(on: DispatchQueue.main)
    .sink { [weak self] data in
        guard let self,
              let postIndex = self.posts.firstIndex(where: { $0.id == data.postId }),
              let commentIndex = self.posts[postIndex].comments.firstIndex(where: { $0.id == data.commentId })
        else { return }
        if data.language == self.userLanguage {
            self.posts[postIndex].comments[commentIndex].translatedContent = data.translation.text
        }
    }
    .store(in: &cancellables)
```

**Step 4: Add translation override method**

After `sharePost` (line 233), add:

```swift
// MARK: - Translation

func setTranslationOverride(postId: String, language: String) {
    guard let index = posts.firstIndex(where: { $0.id == postId }),
          let translation = posts[index].translations?[language] else { return }
    posts[index].translatedContent = translation.text
}

func clearTranslationOverride(postId: String) {
    guard let index = posts.firstIndex(where: { $0.id == postId }) else { return }
    let lang = userLanguage
    if let translation = posts[index].translations?[lang] {
        posts[index].translatedContent = translation.text
    } else {
        posts[index].translatedContent = nil
    }
}

func requestTranslation(postId: String, targetLanguage: String) async {
    do {
        try await PostService.shared.requestTranslation(postId: postId, targetLanguage: targetLanguage)
    } catch {
        // Silent - translation will arrive via socket
    }
}
```

**Step 5: Build and verify**

Run: `./apps/ios/meeshy.sh build`
Expected: BUILD SUCCEEDED

**Step 6: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/ViewModels/FeedViewModel.swift
git commit -m "feat(ios): add translation support to FeedViewModel with socket subscriptions and language resolution"
```

---

## Task 8: iOS — FeedPostCard Translation UI

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/FeedPostCard.swift`

**Step 1: Add translation indicator to content section**

In FeedPostCard, where the post content `Text(post.content)` is displayed, replace with:

```swift
// Post content — displays translated content when available
Text(post.displayContent)
    .font(.body)
    .foregroundColor(theme.textPrimary)
    .lineLimit(isExpanded ? nil : 5)

// Translation indicator
if post.isTranslated {
    HStack(spacing: 4) {
        Image(systemName: "translate")
            .font(.caption2)
        Text("Traduit depuis \(post.originalLanguage ?? "?")")
            .font(.caption2)
    }
    .foregroundColor(theme.textMuted)
    .onTapGesture {
        showTranslationSheet = true
    }
}
```

**Step 2: Add long-press gesture for translation sheet**

Add to FeedPostCard:

```swift
@State private var showTranslationSheet = false
```

Add `.contextMenu` or `.onLongPressGesture` on the content area:

```swift
.onLongPressGesture {
    if post.translations != nil && !post.translations!.isEmpty {
        HapticFeedback.light()
        showTranslationSheet = true
    }
}
.sheet(isPresented: $showTranslationSheet) {
    PostTranslationSheet(
        post: post,
        currentLanguage: post.translatedContent != nil ? "translated" : "original",
        onSelectLanguage: { language in
            onSelectLanguage?(post.id, language)
        }
    )
}
```

**Step 3: Add callback for translation selection**

Add to FeedPostCard's callbacks:

```swift
var onSelectLanguage: ((String, String) -> Void)?
```

**Step 4: Create PostTranslationSheet**

Create `apps/ios/Meeshy/Features/Main/Views/PostTranslationSheet.swift`:

```swift
import SwiftUI
import MeeshySDK

struct PostTranslationSheet: View {
    let post: FeedPost
    let currentLanguage: String
    var onSelectLanguage: ((String) -> Void)?
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var theme: ThemeManager

    var body: some View {
        NavigationStack {
            List {
                // Original content
                Section("Original (\(post.originalLanguage ?? "?"))") {
                    Text(post.content)
                        .font(.body)
                        .foregroundColor(theme.textPrimary)
                }

                // Available translations
                if let translations = post.translations {
                    Section("Traductions disponibles") {
                        ForEach(Array(translations.keys.sorted()), id: \.self) { lang in
                            Button {
                                onSelectLanguage?(lang)
                                dismiss()
                            } label: {
                                HStack {
                                    Text(languageFlag(lang))
                                    Text(Locale.current.localizedString(forLanguageCode: lang) ?? lang)
                                        .foregroundColor(theme.textPrimary)
                                    Spacer()
                                    if let confidence = translations[lang]?.confidenceScore {
                                        Text("\(Int(confidence * 100))%")
                                            .font(.caption)
                                            .foregroundColor(theme.textMuted)
                                    }
                                }
                            }
                        }
                    }
                }
            }
            .navigationTitle("Langues")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Fermer") { dismiss() }
                }
            }
        }
        .presentationDetents([.medium])
    }

    private func languageFlag(_ code: String) -> String {
        let flags: [String: String] = ["fr": "🇫🇷", "en": "🇬🇧", "es": "🇪🇸", "ar": "🇸🇦", "pt": "🇧🇷", "de": "🇩🇪", "zh": "🇨🇳", "ja": "🇯🇵"]
        return flags[code] ?? "🌐"
    }
}
```

**Step 5: Build and verify**

Run: `./apps/ios/meeshy.sh build`
Expected: BUILD SUCCEEDED

**Step 6: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Views/FeedPostCard.swift apps/ios/Meeshy/Features/Main/Views/PostTranslationSheet.swift
git commit -m "feat(ios): add translation indicator and language sheet to FeedPostCard"
```

---

## Task 9: iOS — PostDetailView

**Files:**
- Create: `apps/ios/Meeshy/Features/Main/Views/PostDetailView.swift`
- Create: `apps/ios/Meeshy/Features/Main/ViewModels/PostDetailViewModel.swift`

**Step 1: Create PostDetailViewModel**

Create `apps/ios/Meeshy/Features/Main/ViewModels/PostDetailViewModel.swift`:

```swift
import Foundation
import Combine
import MeeshySDK

@MainActor
class PostDetailViewModel: ObservableObject {
    @Published var post: FeedPost?
    @Published var comments: [FeedComment] = []
    @Published var isLoading = false
    @Published var isLoadingComments = false
    @Published var hasMoreComments = true
    @Published var error: String?

    private var commentCursor: String?
    private let socialSocket = SocialSocketManager.shared
    private var cancellables = Set<AnyCancellable>()

    private var userLanguage: String {
        AuthManager.shared.currentUser?.systemLanguage
            ?? Locale.current.language.languageCode?.identifier
            ?? "en"
    }

    func loadPost(_ postId: String) async {
        isLoading = true
        do {
            let apiPost = try await PostService.shared.getPost(postId: postId)
            post = apiPost.toFeedPost(userLanguage: userLanguage)
        } catch {
            self.error = error.localizedDescription
        }
        isLoading = false
    }

    func loadComments(_ postId: String) async {
        guard !isLoadingComments else { return }
        isLoadingComments = true
        do {
            let response = try await PostService.shared.getComments(postId: postId, cursor: commentCursor)
            if response.success {
                let newComments = response.data.map { c in
                    var translatedContent: String?
                    if let translations = c.translations, let entry = translations[userLanguage] {
                        translatedContent = entry.text
                    }
                    return FeedComment(
                        id: c.id, author: c.author.name, authorId: c.author.id,
                        authorAvatarURL: c.author.avatar ?? c.author.avatarUrl,
                        content: c.content, timestamp: c.createdAt,
                        likes: c.likeCount ?? 0, replies: c.replyCount ?? 0,
                        originalLanguage: c.originalLanguage, translatedContent: translatedContent
                    )
                }
                let existingIds = Set(comments.map(\.id))
                let unique = newComments.filter { !existingIds.contains($0.id) }
                comments.append(contentsOf: unique)
                commentCursor = response.pagination?.nextCursor
                hasMoreComments = response.pagination?.hasMore ?? false
            }
        } catch {
            // Silent fail on comment load
        }
        isLoadingComments = false
    }

    func likePost() async {
        guard let post else { return }
        self.post?.isLiked.toggle()
        self.post?.likes += (self.post?.isLiked ?? false) ? 1 : -1
        do {
            if self.post?.isLiked ?? false {
                try await PostService.shared.like(postId: post.id)
            } else {
                try await PostService.shared.unlike(postId: post.id)
            }
        } catch {
            self.post?.isLiked.toggle()
            self.post?.likes += (self.post?.isLiked ?? false) ? 1 : -1
        }
    }

    func bookmarkPost() async {
        guard let post else { return }
        try? await PostService.shared.bookmark(postId: post.id)
    }

    func sendComment(_ content: String) async {
        guard let post else { return }
        do {
            let apiComment = try await PostService.shared.addComment(postId: post.id, content: content)
            let comment = FeedComment(
                id: apiComment.id, author: apiComment.author.name, authorId: apiComment.author.id,
                authorAvatarURL: apiComment.author.avatar ?? apiComment.author.avatarUrl,
                content: apiComment.content, timestamp: apiComment.createdAt,
                likes: 0, replies: 0
            )
            comments.insert(comment, at: 0)
            self.post?.commentCount += 1
        } catch {
            // Silent
        }
    }

    func subscribeToSocket(_ postId: String) {
        socialSocket.commentAdded
            .receive(on: DispatchQueue.main)
            .filter { $0.postId == postId }
            .sink { [weak self] data in
                guard let self else { return }
                let comment = FeedComment(
                    id: data.comment.id, author: data.comment.author.name,
                    authorId: data.comment.author.id,
                    authorAvatarURL: data.comment.author.avatar ?? data.comment.author.avatarUrl,
                    content: data.comment.content, timestamp: data.comment.createdAt,
                    likes: data.comment.likeCount ?? 0, replies: data.comment.replyCount ?? 0
                )
                if !self.comments.contains(where: { $0.id == comment.id }) {
                    self.comments.insert(comment, at: 0)
                }
                self.post?.commentCount = data.commentCount
            }
            .store(in: &cancellables)

        socialSocket.postTranslationUpdated
            .receive(on: DispatchQueue.main)
            .filter { $0.postId == postId }
            .sink { [weak self] data in
                guard let self else { return }
                let translation = PostTranslation(
                    text: data.translation.text,
                    translationModel: data.translation.translationModel,
                    confidenceScore: data.translation.confidenceScore
                )
                var translations = self.post?.translations ?? [:]
                translations[data.language] = translation
                self.post?.translations = translations
                if data.language == self.userLanguage {
                    self.post?.translatedContent = data.translation.text
                }
            }
            .store(in: &cancellables)
    }
}
```

**Step 2: Create PostDetailView**

Create `apps/ios/Meeshy/Features/Main/Views/PostDetailView.swift`:

```swift
import SwiftUI
import MeeshySDK

struct PostDetailView: View {
    let postId: String
    var initialPost: FeedPost?

    @StateObject private var viewModel = PostDetailViewModel()
    @EnvironmentObject private var theme: ThemeManager
    @State private var commentText = ""
    @FocusState private var isCommentFocused: Bool

    var body: some View {
        VStack(spacing: 0) {
            ScrollView {
                LazyVStack(spacing: 0) {
                    if let post = viewModel.post ?? initialPost {
                        // Full post content
                        postHeader(post)
                        postContent(post)
                        if post.hasMedia {
                            // TODO: Full media gallery
                            FeedPostCardMedia(media: post.media)
                                .padding(.horizontal, 16)
                        }
                        postActions(post)
                        Divider().padding(.horizontal, 16)

                        // Comments
                        commentsSection
                    } else if viewModel.isLoading {
                        ProgressView()
                            .padding(.top, 40)
                    }
                }
            }

            // Comment composer
            commentComposer
        }
        .background(theme.backgroundPrimary)
        .navigationTitle("Post")
        .navigationBarTitleDisplayMode(.inline)
        .task {
            if viewModel.post == nil {
                await viewModel.loadPost(postId)
            }
            await viewModel.loadComments(postId)
            viewModel.subscribeToSocket(postId)
        }
    }

    // MARK: - Post Header

    @ViewBuilder
    private func postHeader(_ post: FeedPost) -> some View {
        HStack(spacing: 12) {
            MeeshyAvatar(name: post.author, size: 44, avatarURL: post.authorAvatarURL)
            VStack(alignment: .leading, spacing: 2) {
                Text(post.author)
                    .font(.headline)
                    .foregroundColor(theme.textPrimary)
                Text(post.timestamp, style: .relative)
                    .font(.caption)
                    .foregroundColor(theme.textMuted)
            }
            Spacer()
        }
        .padding(16)
    }

    // MARK: - Post Content

    @ViewBuilder
    private func postContent(_ post: FeedPost) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(post.displayContent)
                .font(.body)
                .foregroundColor(theme.textPrimary)

            if post.isTranslated {
                HStack(spacing: 4) {
                    Image(systemName: "translate")
                        .font(.caption2)
                    Text("Traduit depuis \(post.originalLanguage ?? "?")")
                        .font(.caption2)
                }
                .foregroundColor(theme.textMuted)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 16)
    }

    // MARK: - Actions

    @ViewBuilder
    private func postActions(_ post: FeedPost) -> some View {
        HStack(spacing: 24) {
            Button {
                Task { await viewModel.likePost() }
            } label: {
                Label("\(post.likes)", systemImage: post.isLiked ? "heart.fill" : "heart")
                    .foregroundColor(post.isLiked ? .red : theme.textSecondary)
            }

            Label("\(post.commentCount)", systemImage: "bubble.right")
                .foregroundColor(theme.textSecondary)

            Button {
                Task { await viewModel.bookmarkPost() }
            } label: {
                Image(systemName: "bookmark")
                    .foregroundColor(theme.textSecondary)
            }

            Spacer()
        }
        .font(.subheadline)
        .padding(16)
    }

    // MARK: - Comments

    @ViewBuilder
    private var commentsSection: some View {
        ForEach(viewModel.comments) { comment in
            CommentRowView(
                comment: comment,
                accentColor: viewModel.post?.authorColor ?? "6366F1",
                onReply: { _ in /* TODO: reply */ },
                onLikeComment: { commentId in
                    Task {
                        try? await PostService.shared.likeComment(postId: postId, commentId: commentId)
                    }
                }
            )
            .padding(.horizontal, 16)
            .padding(.vertical, 8)
        }

        if viewModel.isLoadingComments {
            ProgressView()
                .padding()
        }

        if viewModel.hasMoreComments && !viewModel.isLoadingComments {
            Button("Charger plus de commentaires") {
                Task { await viewModel.loadComments(postId) }
            }
            .font(.subheadline)
            .foregroundColor(Color(hex: "6366F1"))
            .padding()
        }
    }

    // MARK: - Comment Composer

    @ViewBuilder
    private var commentComposer: some View {
        HStack(spacing: 12) {
            TextField("Ajouter un commentaire...", text: $commentText)
                .textFieldStyle(.roundedBorder)
                .focused($isCommentFocused)

            Button {
                let text = commentText.trimmingCharacters(in: .whitespacesAndNewlines)
                guard !text.isEmpty else { return }
                commentText = ""
                Task { await viewModel.sendComment(text) }
            } label: {
                Image(systemName: "paperplane.fill")
                    .foregroundColor(commentText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                                     ? theme.textMuted : Color(hex: "6366F1"))
            }
            .disabled(commentText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
        }
        .padding(12)
        .background(theme.backgroundSecondary)
    }
}
```

**Step 3: Add navigationDestination for postDetail**

In the main ContentView or wherever `NavigationStack` is configured, add:

```swift
.navigationDestination(for: Route.self) { route in
    switch route {
    // ... existing cases ...
    case .postDetail(let postId):
        PostDetailView(postId: postId)
    case .bookmarks:
        BookmarksView()
    }
}
```

**Step 4: Build and verify**

Run: `./apps/ios/meeshy.sh build`
Expected: BUILD SUCCEEDED

**Step 5: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Views/PostDetailView.swift \
      apps/ios/Meeshy/Features/Main/ViewModels/PostDetailViewModel.swift
git commit -m "feat(ios): add PostDetailView with comments, translations, and real-time socket updates"
```

---

## Task 10: iOS — BookmarksView

**Files:**
- Create: `apps/ios/Meeshy/Features/Main/Views/BookmarksView.swift`
- Create: `apps/ios/Meeshy/Features/Main/ViewModels/BookmarksViewModel.swift`

**Step 1: Create BookmarksViewModel**

```swift
import Foundation
import MeeshySDK

@MainActor
class BookmarksViewModel: ObservableObject {
    @Published var posts: [FeedPost] = []
    @Published var isLoading = false
    @Published var hasMore = true

    private var nextCursor: String?

    private var userLanguage: String {
        AuthManager.shared.currentUser?.systemLanguage
            ?? Locale.current.language.languageCode?.identifier
            ?? "en"
    }

    func loadBookmarks() async {
        guard !isLoading else { return }
        isLoading = true
        do {
            let response = try await PostService.shared.getBookmarks(cursor: nextCursor)
            if response.success {
                let newPosts = response.data.map { $0.toFeedPost(userLanguage: userLanguage) }
                let existingIds = Set(posts.map(\.id))
                let unique = newPosts.filter { !existingIds.contains($0.id) }
                posts.append(contentsOf: unique)
                nextCursor = response.pagination?.nextCursor
                hasMore = response.pagination?.hasMore ?? false
            }
        } catch {
            // Silent
        }
        isLoading = false
    }

    func removeBookmark(_ postId: String) async {
        posts.removeAll { $0.id == postId }
        try? await PostService.shared.removeBookmark(postId: postId)
    }

    func refresh() async {
        posts = []
        nextCursor = nil
        hasMore = true
        await loadBookmarks()
    }
}
```

**Step 2: Create BookmarksView**

```swift
import SwiftUI
import MeeshySDK

struct BookmarksView: View {
    @StateObject private var viewModel = BookmarksViewModel()
    @EnvironmentObject private var theme: ThemeManager
    @EnvironmentObject private var router: Router

    var body: some View {
        ScrollView {
            LazyVStack(spacing: 12) {
                if viewModel.posts.isEmpty && !viewModel.isLoading {
                    VStack(spacing: 16) {
                        Image(systemName: "bookmark")
                            .font(.system(size: 48))
                            .foregroundColor(theme.textMuted)
                        Text("Aucun favori")
                            .font(.headline)
                            .foregroundColor(theme.textSecondary)
                        Text("Les posts que vous sauvegardez apparaitront ici")
                            .font(.subheadline)
                            .foregroundColor(theme.textMuted)
                    }
                    .padding(.top, 80)
                } else {
                    ForEach(viewModel.posts) { post in
                        FeedPostCard(
                            post: post,
                            accentColor: post.authorColor,
                            onToggleComments: { _ in
                                router.push(.postDetail(post.id))
                            },
                            onLike: { postId in /* TODO: wire */ },
                            onBookmark: { postId in
                                Task { await viewModel.removeBookmark(postId) }
                            }
                        )
                    }

                    if viewModel.isLoading {
                        ProgressView().padding()
                    }
                }
            }
            .padding(.horizontal, 16)
        }
        .background(theme.backgroundPrimary)
        .navigationTitle("Favoris")
        .refreshable { await viewModel.refresh() }
        .task { await viewModel.loadBookmarks() }
    }
}
```

**Step 3: Build and verify**

Run: `./apps/ios/meeshy.sh build`

**Step 4: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Views/BookmarksView.swift \
      apps/ios/Meeshy/Features/Main/ViewModels/BookmarksViewModel.swift
git commit -m "feat(ios): add BookmarksView for saved posts"
```

---

## Task 11: iOS — Repost/Quote UI

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/FeedPostCard.swift` (repost action)
- Modify: `apps/ios/Meeshy/Features/Main/Views/FeedView.swift` (quote composer)
- Modify: `apps/ios/Meeshy/Features/Main/ViewModels/FeedViewModel.swift` (repost method already exists)

**Step 1: Add repost confirmation alert**

In FeedPostCard, the repost button should show an alert:

```swift
var onRepost: ((String) -> Void)?
var onQuote: ((String) -> Void)?

@State private var showRepostOptions = false

// In the actions bar, replace the repost button:
Button {
    showRepostOptions = true
} label: {
    Image(systemName: "arrow.2.squarepath")
        .foregroundColor(theme.textSecondary)
}
.confirmationDialog("Repartager", isPresented: $showRepostOptions) {
    Button("Repartager") { onRepost?(post.id) }
    Button("Citer") { onQuote?(post.id) }
    Button("Annuler", role: .cancel) {}
}
```

**Step 2: Add quote mode to composer in FeedView**

In FeedView, add state:

```swift
@State private var quotePost: FeedPost?
```

In the composer overlay, if `quotePost` is set, show a preview:

```swift
// Inside composerOverlay, before the TextEditor:
if let quote = quotePost {
    HStack(spacing: 8) {
        Rectangle()
            .fill(Color(hex: "6366F1"))
            .frame(width: 3)
        VStack(alignment: .leading, spacing: 2) {
            Text(quote.author).font(.caption).bold()
            Text(quote.displayContent).font(.caption).lineLimit(2)
        }
        Spacer()
        Button { quotePost = nil } label: {
            Image(systemName: "xmark.circle.fill")
                .foregroundColor(theme.textMuted)
        }
    }
    .padding(.horizontal, 16)
    .padding(.vertical, 8)
    .background(theme.backgroundTertiary.opacity(0.5))
    .cornerRadius(8)
    .padding(.horizontal, 16)
}
```

Wire the onQuote callback to set `quotePost` and open the composer.

**Step 3: Update publishPostWithAttachments to handle quote**

In `FeedView+Attachments.swift`, when publishing with a quotePost:

```swift
if let quote = quotePost {
    await viewModel.repostPost(quote.id, content: composerText, isQuote: true)
    quotePost = nil
} else {
    // existing publish logic
}
```

**Step 4: Build and verify**

Run: `./apps/ios/meeshy.sh build`

**Step 5: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Views/FeedPostCard.swift \
      apps/ios/Meeshy/Features/Main/Views/FeedView.swift \
      apps/ios/Meeshy/Features/Main/Views/FeedView+Attachments.swift
git commit -m "feat(ios): add repost/quote UI with confirmation dialog and inline quote preview"
```

---

## Task 12: iOS — Visibility Selector in Composer

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/FeedView.swift` (composer overlay)

**Step 1: Add visibility state**

In FeedView's state declarations (around line 230), add:

```swift
@State private var postVisibility: String = "PUBLIC"
```

**Step 2: Add visibility picker to composer**

In the composer overlay, replace the static "Public" label (around line 871) with:

```swift
Menu {
    Button { postVisibility = "PUBLIC" } label: {
        Label("Public", systemImage: "globe")
    }
    Button { postVisibility = "FRIENDS" } label: {
        Label("Amis", systemImage: "person.2")
    }
    Button { postVisibility = "PRIVATE" } label: {
        Label("Prive", systemImage: "lock")
    }
} label: {
    HStack(spacing: 4) {
        Image(systemName: postVisibility == "PUBLIC" ? "globe" : postVisibility == "FRIENDS" ? "person.2" : "lock")
            .font(.caption)
        Text(postVisibility == "PUBLIC" ? "Public" : postVisibility == "FRIENDS" ? "Amis" : "Prive")
            .font(.caption)
    }
    .padding(.horizontal, 8)
    .padding(.vertical, 4)
    .background(theme.backgroundTertiary.opacity(0.5))
    .cornerRadius(12)
}
```

**Step 3: Pass visibility to createPost**

In `publishPostWithAttachments()`, pass `visibility: postVisibility`:

```swift
await viewModel.createPost(content: composerText, visibility: postVisibility, mediaIds: mediaIds)
```

Reset after publish:

```swift
postVisibility = "PUBLIC"
```

**Step 4: Build and verify**

Run: `./apps/ios/meeshy.sh build`

**Step 5: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Views/FeedView.swift apps/ios/Meeshy/Features/Main/Views/FeedView+Attachments.swift
git commit -m "feat(ios): add visibility selector (Public/Friends/Private) to post composer"
```

---

## Task 13: iOS — Wire Navigation + FeedPostCard Tap to Detail

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/FeedView.swift` (tap to detail)
- Modify: `apps/ios/Meeshy/Features/Main/Views/FeedPostCard.swift` (onTap callback)

**Step 1: Add onTapPost callback to FeedPostCard**

```swift
var onTapPost: ((String) -> Void)?
```

Wrap the content area in a `Button` or add `.onTapGesture`:

```swift
.onTapGesture {
    onTapPost?(post.id)
}
```

**Step 2: Wire in FeedView**

In FeedView, where FeedPostCard is used, add:

```swift
FeedPostCard(
    post: post,
    // ... existing callbacks ...
    onTapPost: { postId in
        router.push(.postDetail(postId))
    },
    onSelectLanguage: { postId, language in
        viewModel.setTranslationOverride(postId: postId, language: language)
    }
)
```

**Step 3: Build and verify**

Run: `./apps/ios/meeshy.sh build`
Expected: BUILD SUCCEEDED

**Step 4: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Views/FeedView.swift \
      apps/ios/Meeshy/Features/Main/Views/FeedPostCard.swift
git commit -m "feat(ios): wire post tap to PostDetailView navigation and translation language selection"
```

---

## Task 14: iOS — Update FeedCommentsSheet to Show Translations

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/FeedCommentsSheet.swift`

**Step 1: Update CommentRowView to use displayContent**

In `CommentRowView` (line 311), replace `comment.content` with `comment.displayContent`:

```swift
Text(comment.displayContent)
    .font(.subheadline)
    .foregroundColor(theme.textPrimary)
```

**Step 2: Build and verify**

Run: `./apps/ios/meeshy.sh build`

**Step 3: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Views/FeedCommentsSheet.swift
git commit -m "feat(ios): display translated comment content in FeedCommentsSheet"
```

---

## Out of Scope TODOs

Place these TODOs in the relevant files during implementation:

```swift
// TODO: Post draft management (save/restore)
// TODO: PostComposerViewModel (extract state from FeedView)
// TODO: Media picker abstraction layer
// TODO: Post preview modal before publishing
// TODO: Post editing after publication
// TODO: Post pinning to profile top
// TODO: Native iOS share sheet (UIActivityViewController)
// TODO: Deep links to posts (URL scheme)
// TODO: User profile with their posts
// TODO: ML-based embedding scoring (cosine similarity)
// TODO: Feed diversification (anti-filter-bubble)
// TODO: A/B testing framework for weights
// TODO: Topic/hashtag-based affinity
// TODO: Translation quality feedback
// TODO: Custom translation model per community
// TODO: Hashtag/mention parsing in content
// TODO: Content moderation pipeline (auto-flag)
// TODO: Rate limiting per-user on post creation
```

---

## Execution Order

Tasks are designed to be executed in order (1-14), with some parallelism possible:

**Parallel Group A (SDK):** Tasks 1, 2, 3 — SDK model and service changes
**Parallel Group B (Backend):** Tasks 4, 5 — Backend services (after Task 4's event names are in shared)
**Sequential (iOS):** Tasks 6-14 — iOS views, one at a time, building on each other

**Recommended flow:**
1. Tasks 1-3 first (SDK foundation)
2. Tasks 4-5 in parallel (backend)
3. Tasks 6-14 sequentially (iOS UI, each builds on previous)
4. Final build: `./apps/ios/meeshy.sh build` to verify everything compiles
