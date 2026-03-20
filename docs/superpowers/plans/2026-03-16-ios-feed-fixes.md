# iOS Feed System — Bug Fixes Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 9 bugs preventing comments, reposts, reactions, and post feedback from working correctly on iOS.

**Architecture:** All model/service fixes go in `packages/MeeshySDK/` (the app consumes the SDK). ViewModel/View fixes go in `apps/ios/`. Gateway is read-only (already correct). TDD: write failing test → implement → verify → commit.

**Tech Stack:** Swift 5.9, SwiftUI, XCTest, MeeshySDK (SPM local package)

**Scope:** 9 bugs addressed in this plan:
| ID | Problem | Chunk |
|----|---------|-------|
| P1 | `publishError` captured but never surfaced — no user feedback on post creation | 4 |
| P4 | `CreateCommentRequest` missing `parentId` field | 2 |
| P5 | `PostService.addComment()` missing `parentId` parameter (`addReply` exists but is never called) | 2 |
| P6 | `FeedViewModel.sendComment` bypasses `PostService`, uses raw `api.request()` | 2 |
| P7 | `FeedPost` missing `isQuote` field — can't distinguish quote reposts from simple reposts | 1 |
| P8 | `APIRepostOf` missing `isQuote` field | 1 |
| P9 | `FeedViewModel.repostPost` bypasses `PostService.repost()`, uses manual JSON | 4 |
| P10 | `likeComment` sends `"heart"` (text) instead of `"❤️"` (emoji character) | 4 |
| P12 | `FeedView` missing `.onDisappear` — socket subscription accumulation / memory leak | 5 |

**Out of scope** (already working or needs separate design):
- P2: Optimistic insert already works in `createPost` (line 179: `posts.insert(feedPost, at: 0)`)
- P3: Success toast/banner needs UI design — `publishSuccess` flag (added in P1 fix) enables it
- P11: Comment reaction display in UI — needs design spec for reaction UI components

---

## File Structure

### SDK files to modify (`packages/MeeshySDK/Sources/MeeshySDK/`)
| File | Changes |
|------|---------|
| `Services/ServiceModels.swift:91-97` | Add `parentId: String?` to `CreateCommentRequest` |
| `Services/PostService.swift:5-18,54-58,110-119` | Add `parentId` to `addComment` in protocol + impl; remove `addReply` |
| `Models/PostModels.swift:40-48,156-176` | Add `isQuote: Bool?` to `APIRepostOf`; pass `isQuote` in `toFeedPost()` |
| `Models/FeedModels.swift:81-98,128-170` | Add `isQuote: Bool` to `RepostContent` and `FeedPost` |
| `Models/StoryModels.swift:771-775` | Fix `RepostRequest.isQuote` from `Bool?` to `Bool` |

### SDK test files (`packages/MeeshySDK/Tests/MeeshySDKTests/`)
| File | Purpose |
|------|---------|
| `Models/PostModelsTests.swift` | Test `APIRepostOf` decoding with `isQuote`, `toFeedPost()` conversion |

### App files to modify
| File | Changes |
|------|---------|
| `apps/ios/Meeshy/Features/Main/ViewModels/FeedViewModel.swift` | Add `publishSuccess`, fix `likeComment` emoji, refactor `repostPost` and `sendComment` |
| `apps/ios/Meeshy/Features/Main/Views/FeedView.swift:378-383` | Add `.onDisappear` cleanup |
| `apps/ios/MeeshyTests/Mocks/MockPostService.swift` | Add `parentId` tracking to `addComment` |
| `apps/ios/MeeshyTests/Unit/ViewModels/FeedViewModelTests.swift` | Tests for new behaviors |

---

## Chunk 1: SDK Model Fixes (P7, P8 — Repost display)

### Task 1: Add `isQuote` to `APIRepostOf` and conversion chain

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Models/PostModels.swift:40-48`
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Models/FeedModels.swift:81-98,128-170`
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Models/PostModels.swift:156-176`
- Test: `packages/MeeshySDK/Tests/MeeshySDKTests/Models/PostModelsTests.swift`

**Important:** `PostModelsTests` uses a `makeDecoder()` helper with `.custom` date decoding (lines 6-18). Use it for all new tests. `APIAuthor` has `displayName` (not `name`) — JSON keys must use `"displayName"` or `"username"`.

- [ ] **Step 1: Write failing test — `APIRepostOf` decodes `isQuote`**

In `PostModelsTests.swift`, add these tests using the existing `makeDecoder()` helper:

```swift
func test_APIRepostOf_decodesIsQuote() throws {
    let json = """
    {
        "id": "abc123",
        "content": "Original content",
        "author": {"id": "user1", "displayName": "Alice", "username": "alice"},
        "createdAt": "2026-03-16T10:00:00.000Z",
        "likeCount": 5,
        "commentCount": 2,
        "isQuote": true
    }
    """.data(using: .utf8)!

    let result = try makeDecoder().decode(APIRepostOf.self, from: json)
    XCTAssertEqual(result.isQuote, true)
}

func test_APIRepostOf_decodesWithoutIsQuote() throws {
    let json = """
    {
        "id": "abc123",
        "content": "Original content",
        "author": {"id": "user1", "username": "alice"},
        "createdAt": "2026-03-16T10:00:00.000Z",
        "likeCount": 5,
        "commentCount": 2
    }
    """.data(using: .utf8)!

    let result = try makeDecoder().decode(APIRepostOf.self, from: json)
    XCTAssertNil(result.isQuote)
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/smpceo/Documents/v2_meeshy/packages/MeeshySDK && swift test --filter PostModelsTests 2>&1 | tail -20`
Expected: FAIL — `APIRepostOf` has no member `isQuote`

- [ ] **Step 3: Add `isQuote` to `APIRepostOf`**

In `PostModels.swift:40-48`, add the field:

```swift
public struct APIRepostOf: Decodable, Sendable {
    public let id: String
    public let content: String?
    public let author: APIAuthor
    public let media: [APIPostMedia]?
    public let createdAt: Date
    public let likeCount: Int?
    public let commentCount: Int?
    public let isQuote: Bool?
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/smpceo/Documents/v2_meeshy/packages/MeeshySDK && swift test --filter PostModelsTests 2>&1 | tail -20`
Expected: PASS

- [ ] **Step 5: Write failing test — `FeedPost` and `RepostContent` carry `isQuote`**

```swift
func test_toFeedPost_quotedRepost_setsIsQuote() throws {
    let json = """
    {
        "id": "post1",
        "type": "POST",
        "content": "My commentary on this",
        "createdAt": "2026-03-16T10:00:00.000Z",
        "author": {"id": "user1", "username": "alice"},
        "isQuote": true,
        "repostOf": {
            "id": "original1",
            "content": "Original post",
            "author": {"id": "user2", "username": "bob"},
            "createdAt": "2026-03-15T10:00:00.000Z",
            "likeCount": 10,
            "commentCount": 3
        }
    }
    """.data(using: .utf8)!

    let apiPost = try makeDecoder().decode(APIPost.self, from: json)
    let feedPost = apiPost.toFeedPost()

    XCTAssertTrue(feedPost.isQuote)
    XCTAssertNotNil(feedPost.repost)
    XCTAssertEqual(feedPost.content, "My commentary on this")
    XCTAssertEqual(feedPost.repost?.content, "Original post")
}

func test_toFeedPost_simpleRepost_isQuoteFalse() throws {
    let json = """
    {
        "id": "post2",
        "type": "POST",
        "createdAt": "2026-03-16T10:00:00.000Z",
        "author": {"id": "user1", "username": "alice"},
        "repostOf": {
            "id": "original1",
            "content": "Original post",
            "author": {"id": "user2", "username": "bob"},
            "createdAt": "2026-03-15T10:00:00.000Z",
            "likeCount": 10,
            "commentCount": 3
        }
    }
    """.data(using: .utf8)!

    let apiPost = try makeDecoder().decode(APIPost.self, from: json)
    let feedPost = apiPost.toFeedPost()

    XCTAssertFalse(feedPost.isQuote)
    XCTAssertNotNil(feedPost.repost)
}
```

- [ ] **Step 6: Run test to verify it fails**

Expected: FAIL — `FeedPost` has no member `isQuote`

- [ ] **Step 7: Add `isQuote` to `RepostContent` and `FeedPost`, update `toFeedPost()`**

In `FeedModels.swift`, modify `RepostContent` — add `isQuote` field:

```swift
public struct RepostContent: Identifiable, Sendable {
    public let id: String
    public let author: String
    public let authorId: String
    public let authorColor: String
    public let authorAvatarURL: String?
    public let content: String
    public let timestamp: Date
    public var likes: Int
    public let isQuote: Bool

    public init(id: String = UUID().uuidString, author: String, authorId: String = "", authorAvatarURL: String? = nil,
                content: String, timestamp: Date = Date(), likes: Int = 0, isQuote: Bool = false) {
        self.id = id; self.author = author; self.authorId = authorId
        self.authorColor = DynamicColorGenerator.colorForName(authorId.isEmpty ? author : authorId)
        self.authorAvatarURL = authorAvatarURL
        self.content = content; self.timestamp = timestamp; self.likes = likes
        self.isQuote = isQuote
    }
}
```

In `FeedModels.swift`, add `isQuote` to `FeedPost` — add property after `repostAuthor` (line ~142):

```swift
public var isQuote: Bool = false
```

And add `isQuote: Bool = false` parameter to `FeedPost.init` after `repostAuthor`, assign `self.isQuote = isQuote` in the body.

In `PostModels.swift`, update `toFeedPost()` repost conversion (lines 156-162):

```swift
var repost: RepostContent?
if let r = repostOf {
    repost = RepostContent(id: r.id, author: r.author.name, authorId: r.author.id,
                           authorAvatarURL: r.author.avatar,
                           content: r.content ?? "",
                           timestamp: r.createdAt, likes: r.likeCount ?? 0,
                           isQuote: isQuote ?? false)
}
```

And update the `return FeedPost(...)` call (lines 169-176) to pass `isQuote`:

```swift
return FeedPost(id: id, author: author.name, authorId: author.id,
                authorAvatarURL: author.avatar,
                type: type, content: content ?? "",
                timestamp: createdAt, likes: likeCount ?? 0,
                comments: feedComments, commentCount: commentCount ?? feedComments.count,
                repost: repost, repostAuthor: repostOf != nil ? author.name : nil,
                isQuote: isQuote ?? false,
                media: feedMedia,
                originalLanguage: originalLanguage, translations: postTranslations, translatedContent: postTranslatedContent)
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `cd /Users/smpceo/Documents/v2_meeshy/packages/MeeshySDK && swift test --filter PostModelsTests 2>&1 | tail -20`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Models/PostModels.swift \
       packages/MeeshySDK/Sources/MeeshySDK/Models/FeedModels.swift \
       packages/MeeshySDK/Tests/MeeshySDKTests/Models/PostModelsTests.swift
git commit -m "fix(sdk): add isQuote to APIRepostOf, RepostContent, and FeedPost for quote repost display"
```

---

## Chunk 2: SDK Comment Reply Fix + App Wiring (P4, P5, P6)

### Task 2: Add `parentId` to `CreateCommentRequest`, update `PostService.addComment`, and wire `FeedViewModel.sendComment`

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Services/ServiceModels.swift:91-97`
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Services/PostService.swift:5-18,54-58,110-119`
- Modify: `apps/ios/MeeshyTests/Mocks/MockPostService.swift:58-60,121-125,192-194`
- Modify: `apps/ios/Meeshy/Features/Main/ViewModels/FeedViewModel.swift:185-203`
- Test: `apps/ios/MeeshyTests/Unit/ViewModels/FeedViewModelTests.swift`

**Context:** The existing `MockAPIClient` in the SDK tests uses a stub-based pattern: `mock.stub(endpoint, result:)` and records `mock.lastRequest?.endpoint`. The `post()` method discards the body (line 76). For testing `parentId`, we test at the app level using `MockPostService` which tracks call args.

**Context:** The existing `FeedViewModelTests` uses `setUp/tearDown` with `var sut!` / `var mockPostService!` pattern. New tests MUST follow this existing pattern for consistency.

- [ ] **Step 1: Add `parentId` to `CreateCommentRequest`**

In `ServiceModels.swift:91-97`:

```swift
public struct CreateCommentRequest: Encodable {
    public let content: String
    public let parentId: String?

    public init(content: String, parentId: String? = nil) {
        self.content = content
        self.parentId = parentId
    }
}
```

- [ ] **Step 2: Update `PostServiceProviding` protocol and `PostService.addComment`**

In `PostService.swift`, update protocol (line 12):

```swift
func addComment(postId: String, content: String, parentId: String?) async throws -> APIPostComment
```

Update implementation (lines 54-58):

```swift
public func addComment(postId: String, content: String, parentId: String? = nil) async throws -> APIPostComment {
    let body = CreateCommentRequest(content: content, parentId: parentId)
    let response: APIResponse<APIPostComment> = try await api.post(endpoint: "/posts/\(postId)/comments", body: body)
    return response.data
}
```

Remove the redundant `addReply` method (lines 110-119).

- [ ] **Step 3: Update `MockPostService` to track `parentId`**

In `apps/ios/MeeshyTests/Mocks/MockPostService.swift`:

Add tracking property (after line 60):
```swift
var lastAddCommentParentId: String?
```

Update `addComment` method (line 121) to accept and track `parentId`:
```swift
func addComment(postId: String, content: String, parentId: String?) async throws -> APIPostComment {
    addCommentCallCount += 1
    lastAddCommentPostId = postId
    lastAddCommentContent = content
    lastAddCommentParentId = parentId
    return try addCommentResult.get()
}
```

Add reset (after line 194):
```swift
lastAddCommentParentId = nil
```

- [ ] **Step 4: Write failing test — `sendComment` uses `PostService` with `parentId`**

In `FeedViewModelTests.swift`, add:

```swift
func test_sendComment_withParentId_callsPostServiceAddComment() async {
    // Arrange: load a post so sendComment can find it
    mockAPI.stub("/posts/feed", result: Self.makePaginatedResponse(
        posts: [Self.makeAPIPost(id: "p1")]
    ))
    await sut.loadFeed()

    // Act
    await sut.sendComment(postId: "p1", content: "reply text", parentId: "c1")

    // Assert
    XCTAssertEqual(mockPostService.addCommentCallCount, 1)
    XCTAssertEqual(mockPostService.lastAddCommentPostId, "p1")
    XCTAssertEqual(mockPostService.lastAddCommentContent, "reply text")
    XCTAssertEqual(mockPostService.lastAddCommentParentId, "c1")
}

func test_sendComment_withoutParentId_callsPostServiceAddComment() async {
    mockAPI.stub("/posts/feed", result: Self.makePaginatedResponse(
        posts: [Self.makeAPIPost(id: "p1")]
    ))
    await sut.loadFeed()

    await sut.sendComment(postId: "p1", content: "top-level comment")

    XCTAssertEqual(mockPostService.addCommentCallCount, 1)
    XCTAssertNil(mockPostService.lastAddCommentParentId)
}
```

- [ ] **Step 5: Run test to verify it fails**

Run: `cd /Users/smpceo/Documents/v2_meeshy && ./apps/ios/meeshy.sh test 2>&1 | tail -30`
Expected: FAIL — `sendComment` still uses raw `api.request()`, not `postService.addComment()`

- [ ] **Step 6: Refactor `FeedViewModel.sendComment` to use `PostService`**

In `FeedViewModel.swift`, replace `sendComment` (lines 185-203):

```swift
func sendComment(postId: String, content: String, parentId: String? = nil) async {
    do {
        _ = try await postService.addComment(postId: postId, content: content, parentId: parentId)
        if let index = posts.firstIndex(where: { $0.id == postId }) {
            posts[index].commentCount += 1
        }
    } catch {
        // Silent failure — comment count will update via socket event
    }
}
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `cd /Users/smpceo/Documents/v2_meeshy && ./apps/ios/meeshy.sh test 2>&1 | tail -30`
Expected: PASS

- [ ] **Step 8: Run full SDK test suite**

Run: `cd /Users/smpceo/Documents/v2_meeshy/packages/MeeshySDK && swift test 2>&1 | tail -20`
Expected: PASS (verify no other code calls `addReply` — if it does, update those call sites)

- [ ] **Step 9: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Services/ServiceModels.swift \
       packages/MeeshySDK/Sources/MeeshySDK/Services/PostService.swift \
       apps/ios/MeeshyTests/Mocks/MockPostService.swift \
       apps/ios/Meeshy/Features/Main/ViewModels/FeedViewModel.swift \
       apps/ios/MeeshyTests/Unit/ViewModels/FeedViewModelTests.swift
git commit -m "fix(sdk+ios): add parentId to addComment, wire FeedViewModel.sendComment through PostService"
```

---

## Chunk 3: SDK Repost Body Fix

### Task 3: Fix `RepostRequest.isQuote` type from `Bool?` to `Bool`

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Models/StoryModels.swift:771-775`
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Services/PostService.swift:66-69`
- Test: `packages/MeeshySDK/Tests/MeeshySDKTests/Models/PostModelsTests.swift`

- [ ] **Step 1: Write failing test — `RepostRequest` always encodes `isQuote` key**

In `PostModelsTests.swift`:

```swift
func test_RepostRequest_alwaysEncodesIsQuoteKey() throws {
    // With current Bool?, default nil omits the key entirely
    let request = RepostRequest()
    let data = try JSONEncoder().encode(request)
    let json = try JSONSerialization.jsonObject(with: data) as! [String: Any]

    // isQuote must always be present in the JSON body
    XCTAssertNotNil(json["isQuote"], "isQuote key must always be present in encoded JSON")
    XCTAssertEqual(json["isQuote"] as? Bool, false)
}

func test_RepostRequest_encodesIsQuoteTrueWithContent() throws {
    let request = RepostRequest(content: "My quote", isQuote: true)
    let data = try JSONEncoder().encode(request)
    let json = try JSONSerialization.jsonObject(with: data) as! [String: Any]

    XCTAssertEqual(json["isQuote"] as? Bool, true)
    XCTAssertEqual(json["content"] as? String, "My quote")
}
```

- [ ] **Step 2: Run test to verify first test fails**

Run: `cd /Users/smpceo/Documents/v2_meeshy/packages/MeeshySDK && swift test --filter PostModelsTests 2>&1 | tail -20`
Expected: FAIL — `RepostRequest()` with default `isQuote: nil` omits the key, so `json["isQuote"]` is nil

- [ ] **Step 3: Change `RepostRequest.isQuote` from `Bool?` to `Bool`**

In `StoryModels.swift:771-775`:

```swift
public struct RepostRequest: Encodable {
    public let content: String?
    public let isQuote: Bool
    public init(content: String? = nil, isQuote: Bool = false) { self.content = content; self.isQuote = isQuote }
}
```

Update `PostService.repost` (line 67):

```swift
public func repost(postId: String, quote: String? = nil) async throws {
    let body = RepostRequest(content: quote, isQuote: quote != nil)
    let _: APIResponse<[String: String]> = try await api.post(endpoint: "/posts/\(postId)/repost", body: body)
}
```

- [ ] **Step 4: Run tests**

Run: `cd /Users/smpceo/Documents/v2_meeshy/packages/MeeshySDK && swift test 2>&1 | tail -20`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Models/StoryModels.swift \
       packages/MeeshySDK/Sources/MeeshySDK/Services/PostService.swift \
       packages/MeeshySDK/Tests/MeeshySDKTests/Models/PostModelsTests.swift
git commit -m "fix(sdk): change RepostRequest.isQuote from Bool? to Bool for reliable encoding"
```

---

## Chunk 4: App ViewModel Fixes (P1, P9, P10)

### Task 4: Add post creation feedback

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/ViewModels/FeedViewModel.swift:18,165-183`
- Test: `apps/ios/MeeshyTests/Unit/ViewModels/FeedViewModelTests.swift`

**Context:** The existing `FeedViewModelTests` uses `setUp/tearDown` with instance vars. Follow this pattern.

- [ ] **Step 1: Write failing test**

In `FeedViewModelTests.swift`:

```swift
func test_createPost_success_setsPublishSuccess() async {
    mockPostService.createResult = .success(Self.makeAPIPost(id: "new-post"))

    await sut.createPost(content: "Hello world")

    XCTAssertTrue(sut.publishSuccess)
    XCTAssertNil(sut.publishError)
    XCTAssertEqual(sut.posts.count, 1)
}

func test_createPost_failure_setsPublishError() async {
    mockPostService.createResult = .failure(NSError(domain: "test", code: 500))

    await sut.createPost(content: "Hello world")

    XCTAssertFalse(sut.publishSuccess)
    XCTAssertNotNil(sut.publishError)
    XCTAssertTrue(sut.posts.isEmpty)
}
```

- [ ] **Step 2: Run test to verify it fails**

Expected: FAIL — `FeedViewModel` has no member `publishSuccess`

- [ ] **Step 3: Add `publishSuccess` and set it**

In `FeedViewModel.swift`, add after line 18 (`@Published var publishError: String?`):

```swift
@Published var publishSuccess: Bool = false
```

Update `createPost` method (lines 165-183) — add `publishSuccess = false` at start, `publishSuccess = true` after insert:

```swift
func createPost(content: String? = nil, type: String = "POST", visibility: String = "PUBLIC", mediaIds: [String]? = nil, audioUrl: String? = nil, audioDuration: Int? = nil, mobileTranscription: MobileTranscriptionPayload? = nil) async {
    publishError = nil
    publishSuccess = false
    do {
        let apiPost = try await postService.create(
            content: content, type: type, visibility: visibility, moodEmoji: nil,
            mediaIds: mediaIds, audioUrl: audioUrl, audioDuration: audioDuration,
            mobileTranscription: mobileTranscription
        )
        let feedPost = apiPost.toFeedPost(userLanguage: userLanguage)
        posts.insert(feedPost, at: 0)
        publishSuccess = true
    } catch {
        publishError = error.localizedDescription
    }
}
```

- [ ] **Step 4: Run tests**

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/ViewModels/FeedViewModel.swift \
       apps/ios/MeeshyTests/Unit/ViewModels/FeedViewModelTests.swift
git commit -m "fix(ios): add publishSuccess flag for post creation feedback"
```

### Task 5: Fix `likeComment` emoji — send `"❤️"` instead of `"heart"`

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/ViewModels/FeedViewModel.swift:205`

**Context:** `likeComment` uses raw `api.request()` with JSONSerialization. The `MockAPIClientForApp` doesn't capture the request body. We test the change by verifying the method signature and behavior through the gateway (gateway defaults to `❤️` anyway). The fix is a one-line default parameter change.

- [ ] **Step 1: Change default emoji**

In `FeedViewModel.swift:205`:

```swift
func likeComment(postId: String, commentId: String, emoji: String = "❤️") async {
```

- [ ] **Step 2: Build to verify no compilation errors**

Run: `cd /Users/smpceo/Documents/v2_meeshy && ./apps/ios/meeshy.sh build 2>&1 | tail -10`
Expected: BUILD SUCCEEDED

- [ ] **Step 3: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/ViewModels/FeedViewModel.swift
git commit -m "fix(ios): send heart emoji character instead of text string for comment likes"
```

### Task 6: Replace manual repost with `PostService.repost()`

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/ViewModels/FeedViewModel.swift:219-233`
- Test: `apps/ios/MeeshyTests/Unit/ViewModels/FeedViewModelTests.swift`

**Context:** `MockPostService` already has `repostCallCount`, `lastRepostPostId`, `lastRepostQuote`. The existing tests use `setUp/tearDown` with `mockPostService`.

- [ ] **Step 1: Write failing test**

```swift
func test_repostPost_callsPostService() async {
    await sut.repostPost("post1", content: "My quote", isQuote: true)

    XCTAssertEqual(mockPostService.repostCallCount, 1)
    XCTAssertEqual(mockPostService.lastRepostPostId, "post1")
    XCTAssertEqual(mockPostService.lastRepostQuote, "My quote")
}

func test_repostPost_simpleRepost_passesNilQuote() async {
    await sut.repostPost("post1")

    XCTAssertEqual(mockPostService.repostCallCount, 1)
    XCTAssertNil(mockPostService.lastRepostQuote)
}
```

- [ ] **Step 2: Run test to verify it fails**

Expected: FAIL — current `repostPost` bypasses `PostService`, uses raw `api.request()`

- [ ] **Step 3: Refactor `repostPost` to use `PostService`**

```swift
func repostPost(_ postId: String, content: String? = nil, isQuote: Bool = false) async {
    do {
        try await postService.repost(postId: postId, quote: isQuote ? content : nil)
    } catch {
        // Silent failure — repost will appear via socket event
    }
}
```

- [ ] **Step 4: Run tests**

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/ViewModels/FeedViewModel.swift \
       apps/ios/MeeshyTests/Unit/ViewModels/FeedViewModelTests.swift
git commit -m "fix(ios): use PostService.repost() instead of manual API call"
```

---

## Chunk 5: View Fixes (P12 — Memory Leak)

### Task 7: Add `.onDisappear` cleanup to `FeedView`

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/FeedView.swift:378-383`

- [ ] **Step 1: Add `.onDisappear` after `.task`**

In `FeedView.swift`, after the `.task { ... }` block (line 383), add:

```swift
.onDisappear {
    viewModel.unsubscribeFromSocketEvents()
}
```

The full block becomes:

```swift
.task {
    if viewModel.posts.isEmpty {
        await viewModel.loadFeed()
    }
    viewModel.subscribeToSocketEvents()
}
.onDisappear {
    viewModel.unsubscribeFromSocketEvents()
}
```

`FeedViewModel.unsubscribeFromSocketEvents()` (line 402-405) already exists and removes all cancellables + calls `socialSocket.unsubscribeFeed()`.

- [ ] **Step 2: Build to verify no compilation errors**

Run: `cd /Users/smpceo/Documents/v2_meeshy && ./apps/ios/meeshy.sh build 2>&1 | tail -10`
Expected: BUILD SUCCEEDED

- [ ] **Step 3: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Views/FeedView.swift
git commit -m "fix(ios): add onDisappear cleanup to FeedView to prevent socket subscription leaks"
```

---

## Chunk 6: Final Verification

### Task 8: Full build and test run

- [ ] **Step 1: Run full SDK test suite**

Run: `cd /Users/smpceo/Documents/v2_meeshy/packages/MeeshySDK && swift test 2>&1 | tail -30`
Expected: All tests PASS

- [ ] **Step 2: Run iOS app tests**

Run: `cd /Users/smpceo/Documents/v2_meeshy && ./apps/ios/meeshy.sh test 2>&1 | tail -30`
Expected: All tests PASS

- [ ] **Step 3: Build iOS app**

Run: `cd /Users/smpceo/Documents/v2_meeshy && ./apps/ios/meeshy.sh build 2>&1 | tail -10`
Expected: BUILD SUCCEEDED

- [ ] **Step 4: Manual smoke test checklist**

After deploying to simulator (`./apps/ios/meeshy.sh run`):

1. Create a new post → should appear in feed + `publishSuccess` flag set
2. Reply to a comment → reply should send (parentId passed through PostService)
3. Like a comment → `❤️` emoji sent to gateway
4. Repost a post → repost goes through PostService
5. Quote repost → `isQuote: true` in body, displayed with quote styling
6. Navigate away from feed and back → no duplicate socket events
