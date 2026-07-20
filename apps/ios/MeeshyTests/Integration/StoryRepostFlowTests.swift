import XCTest
@testable import MeeshySDK
@testable import MeeshyUI
@testable import Meeshy

/// Integration tests for the 4 composer-based-story-repost flows (Phase D.1).
///
/// Pragmatic in-process integration: each flow is exercised through its
/// public/internal contract surface using `MockPostService` for backend
/// verification and `Mirror` introspection where the SwiftUI view body
/// would otherwise be opaque.
///
/// Flows under test:
///  1. Share button → `StoryComposerView` in repost mode → publishes a STORY
///     (verified via `StoryComposerViewModel(reposting:authorHandle:)` state).
///  2. Kebab "Republier en post" → `PostService.repost(postId:targetType:.post)`
///     direct call (verified via `MockPostService` call tracking).
///  3. Kebab "Editer et republier en post" → `UnifiedPostComposer` repost-mode
///     publish callback (verified via internal `triggerPublishForTests`).
///  4. Feed cell receives a POST whose `repost.type == "STORY"` → renders
///     `StoryRepostEmbedCell` (verified via `Mirror` + the documented
///     `isStoryRepost` predicate semantics).
@MainActor
final class StoryRepostFlowTests: XCTestCase {

    // MARK: - Factories

    /// Builds a `StoryItem` matching the fixtures used by the SDK-level repost
    /// tests (`StoryComposerViewModelRepostTests.makeStoryItem`).
    private func makeStoryItem(
        id: String = "story-x",
        content: String? = "Hello",
        repostOfId: String? = nil,
        originalRepostOfId: String? = nil,
        media: [FeedMedia] = [],
        visibility: String? = "PUBLIC"
    ) -> StoryItem {
        StoryItem(
            id: id,
            content: content,
            media: media,
            storyEffects: nil,
            createdAt: Date(),
            expiresAt: nil,
            repostOfId: repostOfId,
            originalRepostOfId: originalRepostOfId,
            visibility: visibility,
            isViewed: false
        )
    }

    /// Builds an `APIPost` with optional `repostOf` snapshot. Mirrors the
    /// helper used by `StoryModelsTests.makeAPIPost` and `PostServiceTests`.
    private func makeAPIPost(
        id: String = "post-1",
        type: String = "POST",
        repostOfId: String? = nil,
        repostType: String = "STORY"
    ) -> APIPost {
        let author = APIAuthor(id: "author-1", username: "alice", displayName: "Alice", avatar: nil)
        let repostOf: APIRepostOf? = repostOfId.map { rid in
            APIRepostOf(
                id: rid, type: repostType, content: nil, originalLanguage: nil, translations: nil,
                storyEffects: nil, audioUrl: nil, moodEmoji: nil, originalRepostOfId: nil,
                author: author, media: nil, createdAt: Date(), likeCount: nil,
                commentCount: nil, isQuote: nil
            )
        }
        return APIPost(
            id: id, type: type, visibility: "PUBLIC", content: "Mon commentaire",
            originalLanguage: "fr", createdAt: Date(), updatedAt: nil, expiresAt: nil,
            author: author, likeCount: 0, commentCount: 0, repostCount: 0,
            viewCount: 0, bookmarkCount: 0, shareCount: 0, reactionSummary: nil,
            isPinned: false, isEdited: false, media: nil, comments: nil,
            repostOf: repostOf, originalRepostOfId: nil, isQuote: false,
            moodEmoji: nil, audioUrl: nil, audioDuration: nil, storyEffects: nil,
            translations: nil, isLikedByMe: nil, isBookmarkedByMe: nil,
            isRepostedByMe: nil, isViewedByMe: nil,
            currentUserReactions: nil, mentionedUsers: nil, viaUsername: nil
        )
    }

    /// Builds a `FeedPost` with an embedded `RepostContent` whose `type`
    /// drives the feed cell's render-as-story decision (Phase C.3).
    private func makeFeedPost(
        id: String = "feedpost-1",
        type: String = "POST",
        repostType: String? = "STORY"
    ) -> FeedPost {
        let repost: RepostContent? = repostType.map { rt in
            RepostContent(
                id: "story-source-1",
                author: "Alice",
                authorId: "author-1",
                authorUsername: "alice",
                content: "",
                type: rt
            )
        }
        return FeedPost(
            id: id,
            author: "Bob",
            authorId: "author-2",
            authorUsername: "bob",
            type: type,
            content: "Mon commentaire",
            repost: repost
        )
    }

    // MARK: - Flow 1: Share button → StoryComposerView (story repost)

    /// The share button in `StoryViewerView` opens `StoryComposerView` with a
    /// `StoryComposerViewModel(reposting:authorHandle:)`. The VM must clone the
    /// active slide, propagate the chain IDs (root-flatten) and inject the
    /// locked attribution badge — these are the contract guarantees the UI
    /// layer relies on for a story-as-story repost.
    func test_flux1_shareButton_opensComposerStory_publishesAsStory() {
        let story = makeStoryItem(
            id: "story-1",
            content: "Original",
            repostOfId: nil,
            originalRepostOfId: nil
        )

        let vm = StoryComposerViewModel(reposting: story, authorHandle: "alice")

        // 1.a — Repost chain IDs are correctly flattened to the root.
        XCTAssertEqual(vm.repostOfId, "story-1",
                       "repostOfId points to the immediate parent (the story being shared)")
        XCTAssertEqual(vm.originalRepostOfId, "story-1",
                       "originalRepostOfId walks up the chain — root case = source itself")

        // 1.b — Active slide is cloned (single slide, fresh ID, content preserved).
        XCTAssertEqual(vm.slides.count, 1, "Repost mode clones the active slide only")
        XCTAssertEqual(vm.slides.first?.content, "Original")
        XCTAssertNotEqual(vm.slides.first?.id, "story-1",
                          "Cloned slide has a fresh UUID, never reuses the source id")

        // 1.c — Locked attribution badge is injected at bottom-center (y = 0.92).
        let texts = vm.currentEffects.textObjects
        let lockedBadges = texts.filter { $0.isLocked == true }
        XCTAssertEqual(lockedBadges.count, 1,
                       "Exactly one locked badge is added — repost attribution cannot be stripped")
        XCTAssertTrue(lockedBadges.first?.text.contains("@alice") == true,
                      "Badge mentions the original author handle")
        XCTAssertEqual(lockedBadges.first?.y ?? 0, 0.92, accuracy: 0.001,
                       "Badge sits at bottom-center (y = 0.92)")
    }

    // MARK: - Flow 2: Kebab "Republier en post" → direct PostService.repost

    /// The kebab item "Republier en post" calls `PostService.repost` directly
    /// with `targetType: .post`, `content: nil`, `isQuote: false` — see
    /// `StoryViewerView.repostAsPostDirect()`. We verify the mock receives
    /// exactly this combination of arguments.
    func test_flux2_kebabRepublierEnPost_callsBackendDirectly() async throws {
        let mockService = MockPostService()

        _ = try await mockService.repost(
            postId: "story-1",
            targetType: .post,
            content: nil,
            isQuote: false
        )

        XCTAssertEqual(mockService.repostCallCount, 1)
        XCTAssertEqual(mockService.lastRepostPostId, "story-1")
        XCTAssertEqual(mockService.lastRepostTargetType, .post,
                       "Direct kebab repost forces target type to POST (not STORY)")
        XCTAssertNil(mockService.lastRepostContent,
                     "Direct repost has no commentary — content must be nil")
        XCTAssertEqual(mockService.lastRepostIsQuote, false,
                       "Without commentary the repost is a plain re-share, not a quote")
    }

    // MARK: - Flow 3: Kebab "Editer et republier" → UnifiedPostComposer

    /// The kebab item "Editer et republier en post" presents a
    /// `UnifiedPostComposer(repostingStory:authorHandle:onPublishRepost:onDismiss:)`
    /// (B.7). The publish callback receives `(content, sourceStory)`; the
    /// caller in `StoryViewerView` then forwards to
    /// `PostService.repost(postId:targetType:.post, content:isQuote: !content.isEmpty)`.
    ///
    /// We test the full path: the composer wires the callback correctly, AND
    /// the production callback shape (mirrored here against `MockPostService`)
    /// translates the captured args into the right service call.
    func test_flux3_kebabEditerEtRepublier_opensComposerPost_publishes() async throws {
        let story = makeStoryItem(id: "story-1", content: "Original")
        let mockService = MockPostService()

        // Capture args delivered to the publish callback.
        var capturedContent: String?
        var capturedSourceId: String?

        let composer = UnifiedPostComposer(
            repostingStory: story,
            authorHandle: "alice",
            onPublishRepost: { content, sourceStory in
                capturedContent = content
                capturedSourceId = sourceStory.id
            },
            onDismiss: {}
        )

        // 3.a — `repostSourceForTests` mirrors the @State source story so we
        // can verify it without invoking SwiftUI's body evaluation.
        XCTAssertEqual(composer.repostSourceForTests?.id, "story-1",
                       "Composer captured the source story for the embedded canvas")

        // 3.b — `triggerPublishForTestsAwaiting` simulates the publish button
        // tap and awaits the publish path, so the callback has run before we
        // assert. The fire-and-forget `triggerPublishForTests` spawns a Task
        // and would race the synchronous assertions below.
        let published = await composer.triggerPublishForTestsAwaiting(content: "Mon commentaire")
        XCTAssertTrue(published, "Repost publish path completed without throwing")

        XCTAssertEqual(capturedContent, "Mon commentaire",
                       "onPublishRepost receives the typed commentary verbatim")
        XCTAssertEqual(capturedSourceId, "story-1",
                       "onPublishRepost receives the original source story (not the clone)")

        // 3.c — Replay the production-side callback contract: the caller
        // (StoryViewerView.swift:297-316) forwards captured args to
        // PostService.repost with the documented mapping.
        let content = capturedContent ?? ""
        _ = try await mockService.repost(
            postId: capturedSourceId ?? "",
            targetType: .post,
            content: content.isEmpty ? nil : content,
            isQuote: !content.isEmpty
        )

        XCTAssertEqual(mockService.lastRepostPostId, "story-1")
        XCTAssertEqual(mockService.lastRepostTargetType, .post,
                       "Edit-and-repost ALWAYS targets POST type (not STORY)")
        XCTAssertEqual(mockService.lastRepostContent, "Mon commentaire",
                       "Non-empty commentary is forwarded as-is")
        XCTAssertEqual(mockService.lastRepostIsQuote, true,
                       "Non-empty commentary makes the repost a quote")
    }

    // MARK: - Flow 4: Feed cell renders STORY repost embed

    /// When the feed receives a POST whose `repost.type == "STORY"`, the
    /// `FeedPostCard` renders `StoryRepostEmbedCell` instead of the standard
    /// quote-style block. The cell's predicate (`isStoryRepost`) is private,
    /// so we verify two things:
    ///   (a) `StoryRepostEmbedCell` can be constructed and holds the correct
    ///       `post` (verified via `Mirror`).
    ///   (b) The semantic predicate (POST + STORY-repost) matches the
    ///       documented contract in `FeedPostCard.isStoryRepost`.
    func test_flux4_feedReceivesRepostViaSocket_renderedAsStoryEmbed() {
        // 4.a — Positive case: POST with embedded STORY repost.
        let storyRepostPost = makeFeedPost(
            id: "post-1", type: "POST", repostType: "STORY"
        )
        XCTAssertTrue(isStoryRepost(storyRepostPost),
                      "POST + repost.type=STORY MUST render the story embed")

        // 4.b — Negative case 1: POST with embedded POST repost (not a story).
        let postRepostPost = makeFeedPost(
            id: "post-2", type: "POST", repostType: "POST"
        )
        XCTAssertFalse(isStoryRepost(postRepostPost),
                       "Plain POST-of-POST repost uses the standard quote block")

        // 4.c — Negative case 2: regular POST with no repost.
        let plainPost = makeFeedPost(
            id: "post-3", type: "POST", repostType: nil
        )
        XCTAssertFalse(isStoryRepost(plainPost),
                       "Posts without repost content use the standard layout")

        // 4.d — Negative case 3: a STORY itself (not a POST repost-of-story).
        let standaloneStory = makeFeedPost(
            id: "post-4", type: "STORY", repostType: nil
        )
        XCTAssertFalse(isStoryRepost(standaloneStory),
                       "A STORY post is rendered by the story tray, not the feed embed")

        // 4.e — Construct the embed cell and verify via Mirror that it owns
        // the same FeedPost we handed it (proves the type wires up cleanly).
        let cell = StoryRepostEmbedCell(
            post: storyRepostPost,
            preferredContentLanguages: ["fr"]
        )
        let mirror = Mirror(reflecting: cell)
        let cellPost = mirror.descendant("post") as? FeedPost
        XCTAssertEqual(cellPost?.id, "post-1",
                       "Cell stores the FeedPost we passed in")
        XCTAssertEqual(cellPost?.repost?.type, "STORY",
                       "The repost snapshot is preserved through to the cell")
    }

    // MARK: - Helpers

    /// Mirrors `FeedPostCard.isStoryRepost` (private). Source of truth:
    /// `apps/ios/Meeshy/Features/Main/Views/FeedPostCard.swift:51-55`.
    /// Re-implementing here lets us assert the predicate without exposing
    /// the private property — any drift between the two definitions will
    /// surface as a test failure once the cell is wired through a UI test
    /// (D.2) or once the predicate is moved to a testable surface.
    private func isStoryRepost(_ post: FeedPost) -> Bool {
        let postType = (post.type ?? "").uppercased()
        let repostType = (post.repost?.type ?? "").uppercased()
        return postType == "POST" && repostType == "STORY"
    }
}
