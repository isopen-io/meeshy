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

    /// STATUS is ephemeral content (it carries an `expiresAt`), so it belongs on
    /// the story surface — same as the web's `/mood` route, same as what
    /// `.statusReaction` / `.friendNewMood` already do, and same as what the
    /// `storyLifecycleHint` resolves to as soon as the post sits in the local
    /// cache. Mapping it to `.post` made the destination depend on cache warmth.
    func test_surface_statusPostType_resolvesToStory() {
        XCTAssertEqual(
            NotificationContentRouter.surface(postType: "STATUS", notificationType: .postComment, storyLifecycleHint: false),
            .story
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

    // MARK: - Comment fan-out types are NOT entity discriminants
    //
    // `story_thread_reply` / `friend_story_comment` / `story_new_comment` are
    // emitted by `createStoryCommentNotificationsBatch` for ANY commented
    // content — post, reel, mood or story alike. Their name is historical; the
    // only trustworthy discriminant is `metadata.postType`. Before this, iOS
    // routed them straight to the story viewer, which opened an unrelated story
    // when the commented content was a reel (the exact reported bug).

    func test_surface_storyThreadReply_onReel_resolvesToReel() {
        XCTAssertEqual(
            NotificationContentRouter.surface(postType: "REEL", notificationType: .storyThreadReply, storyLifecycleHint: false),
            .reel
        )
    }

    func test_surface_friendStoryComment_onReel_resolvesToReel() {
        XCTAssertEqual(
            NotificationContentRouter.surface(postType: "REEL", notificationType: .friendStoryComment, storyLifecycleHint: false),
            .reel
        )
    }

    func test_surface_storyNewComment_onReel_resolvesToReel() {
        XCTAssertEqual(
            NotificationContentRouter.surface(postType: "REEL", notificationType: .storyNewComment, storyLifecycleHint: false),
            .reel
        )
    }

    func test_surface_storyThreadReply_onPlainPost_resolvesToPost() {
        XCTAssertEqual(
            NotificationContentRouter.surface(postType: "POST", notificationType: .storyThreadReply, storyLifecycleHint: false),
            .post
        )
    }

    func test_surface_friendStoryComment_onStory_staysStory() {
        XCTAssertEqual(
            NotificationContentRouter.surface(postType: "STORY", notificationType: .friendStoryComment, storyLifecycleHint: false),
            .story
        )
    }

    /// No `postType` at all: the fan-out types keep their historical story
    /// default so legacy payloads don't regress.
    func test_surface_storyThreadReply_withoutPostType_defaultsToStory() {
        XCTAssertEqual(
            NotificationContentRouter.surface(postType: nil, notificationType: .storyThreadReply, storyLifecycleHint: false),
            .story
        )
    }

    // MARK: - `contentType` as secondary discriminant (friend_new_*)
    //
    // `createFriendContentNotificationsBatch` historically wrote only
    // `metadata.contentType`. Reading it keeps a friend's new reel out of the
    // plain post-detail surface even on payloads minted before the gateway
    // started mirroring the value into `postType`.

    func test_surface_contentTypeReel_resolvesToReel_whenPostTypeMissing() {
        XCTAssertEqual(
            NotificationContentRouter.surface(
                postType: nil,
                contentType: "REEL",
                notificationType: .friendNewPost,
                storyLifecycleHint: false
            ),
            .reel
        )
    }

    func test_surface_contentTypeStory_resolvesToStory_whenPostTypeMissing() {
        XCTAssertEqual(
            NotificationContentRouter.surface(
                postType: nil,
                contentType: "STORY",
                notificationType: .friendNewStory,
                storyLifecycleHint: false
            ),
            .story
        )
    }

    /// `postType` stays authoritative when both are present.
    func test_surface_postTypeWinsOverContentType() {
        XCTAssertEqual(
            NotificationContentRouter.surface(
                postType: "REEL",
                contentType: "POST",
                notificationType: .friendNewPost,
                storyLifecycleHint: false
            ),
            .reel
        )
    }

    func test_surface_friendNewMood_withoutDiscriminant_resolvesToStory() {
        XCTAssertEqual(
            NotificationContentRouter.surface(postType: nil, notificationType: .friendNewMood, storyLifecycleHint: false),
            .story
        )
    }

    func test_surface_friendNewStory_withoutDiscriminant_resolvesToStory() {
        XCTAssertEqual(
            NotificationContentRouter.surface(postType: nil, notificationType: .friendNewStory, storyLifecycleHint: false),
            .story
        )
    }

    // MARK: - Reactions

    func test_surface_storyReaction_onReel_resolvesToReel() {
        XCTAssertEqual(
            NotificationContentRouter.surface(postType: "REEL", notificationType: .storyReaction, storyLifecycleHint: false),
            .reel
        )
    }

    func test_surface_commentLike_onStory_resolvesToStory() {
        XCTAssertEqual(
            NotificationContentRouter.surface(postType: "STORY", notificationType: .commentLike, storyLifecycleHint: false),
            .story
        )
    }

    func test_surface_moodPostType_resolvesToStory() {
        // MOOD lives in the story tray (ephemeral surface), not the feed.
        XCTAssertEqual(
            NotificationContentRouter.surface(postType: "MOOD", notificationType: .postComment, storyLifecycleHint: false),
            .story
        )
    }
}
