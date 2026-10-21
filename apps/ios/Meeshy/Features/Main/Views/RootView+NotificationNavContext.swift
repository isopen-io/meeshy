import SwiftUI
import MeeshySDK
import MeeshyUI

// Sorti de `RootView.swift` (#10483) : le contexte d'une notification touchée,
// tel que l'iPhone le route. Un type par fichier, et la racine repasse sous son
// budget avant de gagner le marquage de la source d'ouverture.

extension RootView {
    struct NotificationNavContext {
        let type: MeeshyNotificationType
        let conversationId: String?
        let messageId: String?
        let postId: String?
        /// Commentaire ciblé (like/réponse/commentaire) — l'app ouvre l'entité
        /// puis défile/surligne ce commentaire. `nil` = pas de cible commentaire.
        let commentId: String?
        /// Commentaire parent quand `commentId` est une réponse — l'app déplie le
        /// fil du parent avant de défiler jusqu'à la réponse.
        let parentCommentId: String?
        // Phase G — `metadata.postType` distinguishes a story-flavoured
        // post (`"STORY"`) from a regular feed post for `.postComment` /
        // `.commentReply`. May be `nil` when the gateway omits it; the
        // mapping in `navigateFromNotification` falls back to the local
        // story cache as a secondary signal.
        let postType: String?
        /// `metadata.contentType` — the discriminant the `friend_new_*` family
        /// historically shipped INSTEAD of `postType`. Read as a fallback so a
        /// friend's new réel doesn't degrade to the flat post detail on
        /// payloads minted before the gateway mirrored the value.
        let contentType: String?
        let senderId: String?
        let senderUsername: String?
        // Phase G — snapshot fed to `StoryNotificationTargetScreen` so the
        // expired empty state can render even when the underlying story is
        // gone. Always present (uses `Date.now` + empty actor fallback when
        // source data is partial, matching `StoryExpiredContent`'s
        // resilient rendering contract).
        let storyContext: StoryNotificationContext
        // Guideline 5 (MIIT) — China-region incoming-call push (.incomingCallAlert).
        // Only ever populated from `init(from: NotificationPayload)`: a live,
        // just-tapped push. `APINotification`/`SocketNotificationEvent` are
        // history/socket entries where the call, if any, is already resolved.
        let callId: String?
        let callerUserId: String?
        let callerName: String?
        let isVideoCall: Bool
        let iceServersJSON: String?
        /// Le palier à CÉLÉBRER (#5809). Il voyage ICI parce qu'il se dérive de
        /// la métadonnée, que ce contexte est le seul à voir : sans lui, la
        /// vue de révélation n'aurait rien à montrer et le tap retomberait sur
        /// le tableau de bord — le défaut d'origine, une couche plus bas.
        let reveal: EngagementReveal?

        init(from notification: APINotification) {
            type = notification.notificationType
            conversationId = notification.context?.conversationId
            messageId = notification.context?.messageId
            postId = notification.context?.postId ?? notification.metadata?.postId
            commentId = notification.context?.commentId ?? notification.metadata?.commentId
            parentCommentId = notification.context?.parentCommentId ?? notification.metadata?.parentCommentId
            postType = notification.metadata?.postType
            contentType = notification.metadata?.contentType
            senderId = notification.senderId
            senderUsername = notification.senderName
            storyContext = StoryNotificationContext.from(notification)
            reveal = EngagementReveal.from(type: notification.notificationType, metadata: notification.metadata)
            callId = nil
            callerUserId = nil
            callerName = nil
            isVideoCall = false
            iceServersJSON = nil
        }

        init(from event: SocketNotificationEvent) {
            type = event.notificationType
            conversationId = event.conversationId
            messageId = event.messageId
            postId = event.postId
            commentId = event.commentId
            parentCommentId = event.parentCommentId
            postType = event.postType
            contentType = event.metadata?.contentType
            senderId = event.senderId
            senderUsername = event.senderUsername
            storyContext = NotificationNavContext.makeStoryContext(from: event)
            reveal = EngagementReveal.from(type: event.notificationType, metadata: event.metadata)
            callId = nil
            callerUserId = nil
            callerName = nil
            isVideoCall = false
            iceServersJSON = nil
        }

        init(from payload: NotificationPayload) {
            type = MeeshyNotificationType(rawValue: payload.type ?? "") ?? .system
            conversationId = payload.conversationId
            messageId = payload.messageId
            postId = payload.postId
            commentId = payload.commentId
            parentCommentId = payload.parentCommentId
            postType = payload.postType
            contentType = payload.contentType
            senderId = payload.senderId
            senderUsername = payload.senderUsername
            storyContext = NotificationNavContext.makeStoryContext(from: payload)
            // La charge APNs ne porte pas de `NotificationMetadata` typée : on
            // ne fabrique PAS un palier plausible, on n'en célèbre aucun et le
            // tap retombe sur le tableau de bord. Un badge inventé serait pire
            // que pas de badge — cf. le repli MENTEUR d'`EngagementReveal`.
            reveal = nil
            callId = payload.callId
            callerUserId = payload.callerUserId
            callerName = payload.callerName
            isVideoCall = payload.isVideoCall
            iceServersJSON = payload.iceServersJSON
        }

        // MARK: - Intent derived from the notification type
        //
        // The TYPE says what the user is being told about (a comment, a
        // reaction, a fresh publication); the metadata discriminant says WHICH
        // entity carries it. Keeping the two apart is what lets a comment on a
        // réel open the réel with its comments, instead of the story viewer.

        /// Which affordance the story surface auto-opens once resolved.
        var storyIntent: StoryIntent { NotificationContentRouter.intent(for: type) }

        /// `true` when the notification is ABOUT a comment — the post detail
        /// surface then opens with its comments sheet already showing.
        var opensComments: Bool { NotificationContentRouter.opensComments(type) }

        // MARK: - Story context fabrication
        //
        // The gateway-canonical mapping (`StoryNotificationContext.from`)
        // expects an `APINotification` because that's the typed-metadata
        // path. The two transient sources (`SocketNotificationEvent`,
        // `NotificationPayload`) carry the same fields under different
        // shapes — replicate the fallback chain inline so every entry point
        // can drive `StoryNotificationTargetScreen` without a fresh fetch.

        private static func makeStoryContext(from event: SocketNotificationEvent) -> StoryNotificationContext {
            let trigger: StoryNotificationContext.Trigger
            switch event.notificationType {
            case .storyReaction, .statusReaction:
                trigger = .reaction(emoji: event.metadata?.emoji ?? "❤️")
            default:
                trigger = .comment(preview: event.metadata?.commentPreview ?? "")
            }
            return StoryNotificationContext(
                actorAvatar: event.actor?.avatar,
                actorDisplayName: event.actor?.displayName ?? event.actor?.username ?? "",
                trigger: trigger,
                occurredAt: Date()
            )
        }

        private static func makeStoryContext(from payload: NotificationPayload) -> StoryNotificationContext {
            // Push payloads don't carry trigger metadata reliably (APN
            // userInfo is restricted to a small subset). Use a neutral
            // fallback — the screen renders the actor + a generic icon
            // when `preview` is empty. Reaction emoji is unknown here; we
            // fall back to the heart, mirroring `StoryNotificationContext.from`.
            let trigger: StoryNotificationContext.Trigger = {
                switch payload.type ?? "" {
                case MeeshyNotificationType.storyReaction.rawValue,
                     MeeshyNotificationType.statusReaction.rawValue:
                    return .reaction(emoji: "❤️")
                default:
                    return .comment(preview: "")
                }
            }()
            return StoryNotificationContext(
                actorAvatar: payload.senderAvatar,
                actorDisplayName: payload.senderDisplayName ?? payload.senderUsername ?? "",
                trigger: trigger,
                occurredAt: Date()
            )
        }
    }
}
