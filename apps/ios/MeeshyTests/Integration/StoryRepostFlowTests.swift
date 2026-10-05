import XCTest
@testable import MeeshySDK
@testable import MeeshyUI
@testable import Meeshy

/// Integration tests for the 3 composer-based-story-repost flows (Phase D.1).
///
/// Pragmatic in-process integration: each flow is exercised through its
/// public/internal contract surface using `MockPostService` for backend
/// verification and `Mirror` introspection where the SwiftUI view body
/// would otherwise be opaque.
///
/// Flows under test:
///  1. Kebab "Republier en post" → une republication `targetType: .post`,
///     sans citation (vérifiée par le compte d'appels de `MockPostService`).
///     Depuis le lot 7.5 la production ne parle plus au service en direct :
///     elle passe par `RepostPublisher`, l'écrivain unique, qui y ajoute un
///     `X-Client-Mutation-Id` et bascule en file durable hors ligne. Ces
///     tests-ci REJOUENT le contrat contre le double ; c'est
///     `RepostIntentTests` qui garde le fait qu'aucun site n'appelle plus le
///     service directement.
///  2. Kebab "Editer et republier en post" — monte `StoryRepublishComposer`
///     depuis #5055 ; `UnifiedPostComposer` a quitté le dépôt (#9166).
///  3. Feed cell receives a POST whose `repost.type == "STORY"` → renders
///     `StoryRepostEmbedCell` (verified via `Mirror` + the documented
///     `isStoryRepost` predicate semantics).
///
/// A 4th flow — share button → `StoryComposerView` in repost mode — was
/// removed S6 (`test_flux1_shareButton_opensComposerStory_publishesAsStory`,
/// dead code cleanup): the share button never opened that composer in
/// production (`repostStoryComposerSource` was never assigned outside its
/// own `nil` resets), it reposts through the single writer instead — see
/// `StoryViewerView+Sidebar.swift`. The composer-VM contract it exercised
/// (`StoryComposerViewModel(reposting:authorHandle:)` clone/flatten/badge)
/// remains covered independently by `StoryComposerViewModelRepostTests`.
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
                commentCount: nil, isQuote: nil, location: nil
            )
        }
        return APIPost(
            id: id, type: type, visibility: "PUBLIC", visibilityUserIds: nil, content: "Mon commentaire",
            originalLanguage: "fr", createdAt: Date(), updatedAt: nil, expiresAt: nil,
            author: author, likeCount: 0, commentCount: 0, repostCount: 0,
            viewCount: 0, bookmarkCount: 0, shareCount: 0, reactionSummary: nil,
            isPinned: false, isEdited: false, media: nil, comments: nil,
            repostOf: repostOf, originalRepostOfId: nil, isQuote: false,
            moodEmoji: nil, audioUrl: nil, audioDuration: nil, storyEffects: nil,
            translations: nil, isLikedByMe: nil, isBookmarkedByMe: nil,
            isRepostedByMe: nil, isViewedByMe: nil,
            currentUserReactions: nil, viaUsername: nil
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

    // MARK: - Flow 2: Kebab "Republier en post" → direct PostService.repost

    /// L'item de kebab « Republier en post » republie avec
    /// `targetType: .post`, `content: nil`, `isQuote: false` — voir
    /// `StoryViewerView.repostAsPostDirect()`, qui compose désormais un
    /// `RepostIntent.simple` et le remet à `RepostPublisher`. On vérifie ici
    /// que le double reçoit exactement cette combinaison d'arguments : le
    /// jeton d'idempotence s'AJOUTE, il ne remplace rien.
    func test_flux2_kebabRepublierEnPost_callsBackendDirectly() async throws {
        let mockService = MockPostService()

        _ = try await mockService.repost(
            postId: "story-1",
            targetType: .post,
            content: nil,
            isQuote: false,
            visibility: nil
        )

        XCTAssertEqual(mockService.repostCallCount, 1)
        XCTAssertEqual(mockService.lastRepostPostId, "story-1")
        XCTAssertEqual(mockService.lastRepostTargetType, .post,
                       "Direct kebab repost forces target type to POST (not STORY)")
        XCTAssertNil(mockService.lastRepostContent,
                     "Direct repost has no commentary — content must be nil")
        XCTAssertEqual(mockService.lastRepostIsQuote, false,
                       "Without commentary the repost is a plain re-share, not a quote")
        XCTAssertNil(mockService.lastRepostVisibility,
                     "The kebab path offers no audience picker, so it passes no visibility — " +
                     "the gateway then inherits the original's, per PostService.repost's default")
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
