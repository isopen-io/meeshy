import XCTest
import MeeshySDK
@testable import Meeshy

// MARK: - NotificationContentRouterTests
//
// Locks the routing decision that distinguishes a reel notification from a
// story / post one. The regression being guarded: a reel-flavoured social
// notification (`metadata.postType == "REEL"`) used to fall through to the
// story heuristic and open the story viewer on the WRONG post instead of the
// reel in full screen.

@MainActor
final class NotificationContentRouterTests: XCTestCase {

    // MARK: - REEL postType wins for every social notification type

    func test_surface_reelPostType_resolvesToReel_forCommentNotification() {
        let surface = NotificationContentRouter.surface(
            postType: "REEL",
            notificationType: .postComment,
            storyLifecycleHint: false
        )
        XCTAssertEqual(surface, .reel)
    }

    func test_surface_reelPostType_resolvesToReel_forCommentReaction() {
        XCTAssertEqual(
            NotificationContentRouter.surface(postType: "REEL", notificationType: .commentReaction, storyLifecycleHint: false),
            .reel
        )
    }

    func test_surface_reelPostType_resolvesToReel_forLike() {
        XCTAssertEqual(
            NotificationContentRouter.surface(postType: "REEL", notificationType: .postLike, storyLifecycleHint: false),
            .reel
        )
    }

    func test_surface_reelPostType_resolvesToReel_forFriendNewPost() {
        XCTAssertEqual(
            NotificationContentRouter.surface(postType: "REEL", notificationType: .friendNewPost, storyLifecycleHint: false),
            .reel
        )
    }

    func test_surface_reelPostType_isCaseInsensitive() {
        XCTAssertEqual(
            NotificationContentRouter.surface(postType: "reel", notificationType: .postComment, storyLifecycleHint: false),
            .reel
        )
    }

    /// A reel must NEVER be misread as a story even when a stale cached entry
    /// happens to carry an expiry hint — the explicit postType is authoritative.
    func test_surface_reelPostType_winsOverStoryLifecycleHint() {
        XCTAssertEqual(
            NotificationContentRouter.surface(postType: "REEL", notificationType: .postComment, storyLifecycleHint: true),
            .reel
        )
    }

    // MARK: - STORY / POST classification preserved

    func test_surface_storyPostType_resolvesToStory() {
        XCTAssertEqual(
            NotificationContentRouter.surface(postType: "STORY", notificationType: .postComment, storyLifecycleHint: false),
            .story
        )
    }

    func test_surface_postPostType_resolvesToPost() {
        XCTAssertEqual(
            NotificationContentRouter.surface(postType: "POST", notificationType: .postComment, storyLifecycleHint: false),
            .post
        )
    }

    func test_surface_statusPostType_resolvesToPost() {
        XCTAssertEqual(
            NotificationContentRouter.surface(postType: "STATUS", notificationType: .postComment, storyLifecycleHint: false),
            .post
        )
    }

    // MARK: - Fallbacks when postType is absent

    func test_surface_nilPostType_storyOnlyType_resolvesToStory() {
        XCTAssertEqual(
            NotificationContentRouter.surface(postType: nil, notificationType: .storyNewComment, storyLifecycleHint: false),
            .story
        )
    }

    func test_surface_nilPostType_genericType_withStoryHint_resolvesToStory() {
        XCTAssertEqual(
            NotificationContentRouter.surface(postType: nil, notificationType: .postComment, storyLifecycleHint: true),
            .story
        )
    }

    func test_surface_nilPostType_genericType_noHint_resolvesToPost() {
        XCTAssertEqual(
            NotificationContentRouter.surface(postType: nil, notificationType: .postComment, storyLifecycleHint: false),
            .post
        )
    }
}
