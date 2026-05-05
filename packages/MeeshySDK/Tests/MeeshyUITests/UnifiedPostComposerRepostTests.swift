import XCTest
import SwiftUI
@testable import MeeshyUI
@testable import MeeshySDK

/// Tests for `UnifiedPostComposer.init(repostingStory:authorHandle:onPublishRepost:onDismiss:)`.
///
/// `UnifiedPostComposer` is a SwiftUI `View` (a value-type `struct`), so we cannot mutate it
/// from the outside. Two introspection mechanisms are used here:
///
/// 1. **`Mirror(reflecting:).descendant("lockedType")`** to access the private `let lockedType: PostType?`
///    declared on the composer. `Mirror` exposes non-property-wrapper stored properties under their
///    declared name, so the descendant lookup returns the value directly.
///
/// 2. **Internal test accessors** (`repostSourceForTests`, `triggerPublishForTests(content:)`)
///    exposed by the production type so tests can read the source story and invoke the publish
///    path without spinning up a full hosting controller. These accessors are `internal`
///    so they are only visible inside the package (not re-exported as public API).
@MainActor
final class UnifiedPostComposerRepostTests: XCTestCase {

    // MARK: - test_init_reposting_setsLockedTypeToPost

    func test_init_reposting_setsLockedTypeToPost() {
        let story = Self.makeStoryItem()
        let composer = UnifiedPostComposer(
            repostingStory: story,
            authorHandle: "alice",
            onPublishRepost: { _, _ in },
            onDismiss: {}
        )

        let mirror = Mirror(reflecting: composer)
        let lockedType = mirror.descendant("lockedType") as? PostType

        XCTAssertEqual(lockedType, .post,
                       "Repost-mode init must lock the composer type to .post")
    }

    // MARK: - test_init_reposting_storesSourceStory

    func test_init_reposting_storesSourceStory() {
        let story = Self.makeStoryItem(id: "src-1")
        let composer = UnifiedPostComposer(
            repostingStory: story,
            authorHandle: "alice",
            onPublishRepost: { _, _ in },
            onDismiss: {}
        )

        XCTAssertEqual(composer.repostSourceForTests?.id, "src-1",
                       "Repost-mode init must store the source story for later retrieval")
    }

    // MARK: - test_publish_invokesOnPublishRepostWithContentAndStory

    func test_publish_invokesOnPublishRepostWithContentAndStory() {
        var publishedContent: String?
        var publishedStory: StoryItem?
        let story = Self.makeStoryItem(id: "src-1")

        let composer = UnifiedPostComposer(
            repostingStory: story,
            authorHandle: "alice",
            onPublishRepost: { content, sourceStory in
                publishedContent = content
                publishedStory = sourceStory
            },
            onDismiss: {}
        )

        composer.triggerPublishForTests(content: "Mon commentaire")

        XCTAssertEqual(publishedContent, "Mon commentaire",
                       "Publish action must forward the typed content to onPublishRepost")
        XCTAssertEqual(publishedStory?.id, "src-1",
                       "Publish action must forward the source story to onPublishRepost")
    }

    // MARK: - Fixtures

    private static func makeStoryItem(id: String = "story-1") -> StoryItem {
        return StoryItem(
            id: id,
            content: "Original story content",
            media: [],
            storyEffects: nil,
            createdAt: Date(),
            expiresAt: Date().addingTimeInterval(3600),
            repostOfId: nil,
            repostAuthorName: nil,
            isViewed: false,
            translations: nil,
            backgroundAudio: nil,
            reactionCount: 0,
            commentCount: 0
        )
    }
}
