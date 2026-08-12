import MeeshySDK

/// The content surface a social-content notification (post / story / reel / mood)
/// should open when tapped.
enum NotificationContentSurface: Equatable {
    /// Full-screen immersive reel viewer (`ReelsPresenter`).
    case reel
    /// Story notification target screen (`.storyNotificationTarget`) — the
    /// surface for every EPHEMERAL entity (story, mood, status).
    case story
    /// Universal post detail surface (`.postDetail`).
    case post
}

/// Pure resolution of WHICH content surface a social notification opens.
///
/// Mirrors the web's `resolveContentRoute`
/// (`apps/web/utils/notification-helpers.ts`): the entity discriminant carried
/// by the notification metadata is the high-confidence signal, with a fallback
/// on the notification type and, last, a story-lifecycle cache hint.
///
/// **The notification TYPE is not an entity discriminant.** The gateway emits
/// `story_thread_reply` / `friend_story_comment` / `story_new_comment` from
/// `createStoryCommentNotificationsBatch`, which fans out for ANY commented
/// content — a post, a reel, a mood or a story alike. Their names are
/// historical. Routing on the type alone is what made a comment on a REEL open
/// the story viewer on an unrelated story; only `metadata.postType` (or
/// `metadata.contentType` for the `friend_new_*` family) tells the truth.
enum NotificationContentRouter {
    /// Notification types whose entity is a story / ephemeral by construction.
    /// Used ONLY when no discriminant is present in the metadata — a legacy
    /// payload minted before the gateway populated `postType`.
    private static let ephemeralOnlyTypes: Set<MeeshyNotificationType> = [
        .storyReaction, .statusReaction,
        .storyNewComment, .friendStoryComment, .storyThreadReply,
        .friendNewStory, .friendNewMood
    ]

    /// - Parameters:
    ///   - postType: `metadata.postType` from the notification
    ///     (`"REEL"`, `"STORY"`, `"POST"`, `"STATUS"`, `"MOOD"`). May be `nil`.
    ///   - contentType: `metadata.contentType`, the discriminant the
    ///     `friend_new_*` family historically shipped instead of `postType`.
    ///     Consulted only when `postType` is absent.
    ///   - notificationType: the notification's typed kind. Fallback only.
    ///   - storyLifecycleHint: `true` when a locally-cached post for this id
    ///     carries a non-nil `expiresAt` (i.e. it is ephemeral by definition).
    static func surface(
        postType: String?,
        contentType: String? = nil,
        notificationType: MeeshyNotificationType,
        storyLifecycleHint: Bool
    ) -> NotificationContentSurface {
        let discriminant = (postType?.isEmpty == false ? postType : contentType)?.uppercased()

        switch discriminant {
        case "REEL": return .reel
        // Every ephemeral entity shares the story surface: it is the screen that
        // knows how to resolve a live tray entry AND to render the expired empty
        // state. `STATUS` / `MOOD` carry an `expiresAt` exactly like a story.
        case "STORY", "STATUS", "MOOD": return .story
        case "POST": return .post
        default: break
        }

        if ephemeralOnlyTypes.contains(notificationType) { return .story }

        return storyLifecycleHint ? .story : .post
    }

    /// Which affordance the resolved surface auto-opens.
    ///
    /// Complement of `surface(...)`: the TYPE says what the user is being told
    /// about (a comment, a reaction, a fresh publication), the metadata
    /// discriminant says WHICH entity carries it. Keeping the two apart is what
    /// lets a comment on a réel open the réel *with its comments*.
    static func intent(for notificationType: MeeshyNotificationType) -> StoryIntent {
        switch notificationType {
        case .postComment, .legacyPostComment, .commentReply, .commentReaction, .commentLike,
             .storyNewComment, .friendStoryComment, .storyThreadReply:
            return .comments
        case .storyReaction, .statusReaction, .postLike, .legacyPostLike:
            return .reactions
        default:
            return .view
        }
    }

    /// `true` when the notification is ABOUT a comment — the post detail
    /// surface then opens with its comments sheet already showing.
    static func opensComments(_ notificationType: MeeshyNotificationType) -> Bool {
        intent(for: notificationType) == .comments
    }
}
