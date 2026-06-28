import MeeshySDK

/// The content surface a social-content notification (post / story / reel / mood)
/// should open when tapped.
enum NotificationContentSurface: Equatable {
    /// Full-screen immersive reel viewer (`ReelsPresenter`).
    case reel
    /// Story notification target screen (`.storyNotificationTarget`).
    case story
    /// Universal post detail surface (`.postDetail`).
    case post
}

/// Pure resolution of WHICH content surface a social notification opens.
///
/// Mirrors the web's `resolveContentRoute`
/// (`apps/web/utils/notification-helpers.ts`): the `metadata.postType`
/// discriminant is the high-confidence signal, with a fallback on the
/// notification type and, last, a story-lifecycle cache hint.
///
/// Before this seam existed, a reel notification (`postType == "REEL"`) had no
/// dedicated branch: it fell through to the story/post heuristic and opened the
/// story viewer on the wrong post instead of the reel in full screen.
enum NotificationContentRouter {
    /// Notification types that are story-only regardless of `postType` (the
    /// gateway sometimes omits `postType` for these).
    private static let storyOnlyTypes: Set<MeeshyNotificationType> = [
        .storyReaction, .storyNewComment, .friendStoryComment, .storyThreadReply, .friendNewStory
    ]

    /// - Parameters:
    ///   - postType: `metadata.postType` from the notification
    ///     (`"REEL"`, `"STORY"`, `"POST"`, `"STATUS"`, …). May be `nil`.
    ///   - notificationType: the notification's typed kind.
    ///   - storyLifecycleHint: `true` when a locally-cached post for this id
    ///     carries a non-nil `expiresAt` (i.e. it is, by definition, a story).
    static func surface(
        postType: String?,
        notificationType: MeeshyNotificationType,
        storyLifecycleHint: Bool
    ) -> NotificationContentSurface {
        switch postType?.uppercased() {
        case "REEL": return .reel
        case "STORY": return .story
        case "POST", "STATUS": return .post
        default: break
        }

        if storyOnlyTypes.contains(notificationType) { return .story }

        return storyLifecycleHint ? .story : .post
    }
}
