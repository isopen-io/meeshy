import Foundation

// MARK: - In-app toast presentation

/// Presentation helpers that turn a raw `SocketNotificationEvent` (backend
/// real-time alert) into the three text slots + avatar rendered by the in-app
/// toast (`NotificationToastView`).
///
/// Design goals (cf. produit — "notifications in-app aussi précises que iOS,
/// avec moins de détails") :
///   * **Conversation messages** render exactly like the iOS push
///     communication-notification: the *sender* is the title and the *group*
///     is the subtitle. Direct messages have no subtitle.
///   * **Social / interaction events** (réactions, commentaires, réponses de
///     commentaire, reposts, stories, statuts…) render a *precise* action
///     phrase as the title, so the user knows exactly what happened without
///     opening the app — mirroring the precision of the system push body.
///   * The avatar is the *sender* avatar, falling back to the *group* avatar
///     when the sender has none (group messages), then to deterministic
///     initials.
///
/// All properties are pure and `O(1)` — they are read from a transient leaf
/// view (`NotificationToastView`) on every render.
public extension SocketNotificationEvent {

    /// Display name of the actor (sender / triggerer), with safe fallbacks.
    var actorDisplayName: String {
        if let name = senderDisplayName, !name.isEmpty { return name }
        if let handle = senderUsername, !handle.isEmpty { return handle }
        if let title, !title.isEmpty { return title }
        return "Quelqu'un"
    }

    /// `true` when the notification is a plain conversation message whose toast
    /// should read *sender = title, group = subtitle* (the precise action is
    /// "a envoyé un message", so it is left implicit).
    private var isConversationMessage: Bool {
        switch notificationType {
        case .newMessage, .legacyNewMessage,
             .messageReply, .reply, .legacyStoryReply,
             .userMentioned, .mention, .legacyMention:
            return true
        default:
            return false
        }
    }

    /// Emoji carried by a reaction notification, if any.
    private var reactionEmoji: String? {
        if let emoji = metadata?.emoji, !emoji.isEmpty { return emoji }
        return nil
    }

    /// Human label for the post family a social event targets.
    private var postKindLabel: String {
        if notificationType == .storyReaction || postType == "STORY" { return "story" }
        if notificationType == .statusReaction || postType == "STATUS" { return "statut" }
        if notificationType == .commentLike { return "commentaire" }
        return "publication"
    }

    // MARK: Title

    /// Primary (bold) line of the toast.
    ///
    /// Conversation messages → the actor name. Everything else → a precise
    /// action phrase so the toast is as informative as the iOS push.
    var toastTitle: String {
        let actor = actorDisplayName

        switch notificationType {
        // ── Conversation messages: actor is the title, group is the subtitle.
        case .newMessage, .legacyNewMessage,
             .messageReply, .reply, .legacyStoryReply,
             .userMentioned, .mention, .legacyMention:
            return actor

        // ── Reactions
        case .messageReaction, .reaction, .legacyMessageReaction:
            if let emoji = reactionEmoji { return "\(actor) a réagi \(emoji) à votre message" }
            return "\(actor) a réagi à votre message"
        case .commentReaction:
            if let emoji = reactionEmoji { return "\(actor) a réagi \(emoji) à votre commentaire" }
            return "\(actor) a réagi à votre commentaire"
        case .postLike, .legacyPostLike, .storyReaction, .statusReaction, .commentLike:
            if let emoji = reactionEmoji { return "\(actor) a réagi \(emoji) à votre \(postKindLabel)" }
            return "\(actor) a aimé votre \(postKindLabel)"

        // ── Comments & replies (the precision the produit asks for)
        case .postComment, .legacyPostComment:
            return "\(actor) a commenté votre publication"
        case .commentReply:
            return "\(actor) a répondu à votre commentaire"
        case .storyNewComment:
            return "\(actor) a commenté votre story"
        case .friendStoryComment:
            return "\(actor) a commenté une story"
        case .storyThreadReply:
            return "\(actor) a répondu dans un fil de commentaires"
        case .postRepost:
            return "\(actor) a repartagé votre publication"

        // ── Friends' new content
        case .friendNewStory:
            return "\(actor) a publié une nouvelle story"
        case .friendNewPost:
            return "\(actor) a publié une nouvelle publication"
        case .friendNewMood:
            return "\(actor) a partagé une humeur"

        // ── Relationship
        case .friendRequest, .contactRequest, .legacyFriendRequest:
            return "\(actor) veut se connecter"
        case .friendAccepted, .contactAccepted, .legacyFriendAccepted:
            return "\(actor) a accepté votre invitation"

        // ── Calls
        case .missedCall, .callDeclined, .legacyCallMissed:
            return "Appel manqué de \(actor)"
        case .incomingCall, .callEnded, .legacyCallIncoming:
            return "Appel de \(actor)"

        // ── Conversation membership
        case .newConversationDirect:
            return "Nouvelle conversation avec \(actor)"
        case .newConversationGroup, .communityInvite, .legacyGroupInvite,
             .addedToConversation, .newConversation:
            return "Invitation de \(actor)"

        // ── Fallback: a non-empty backend title, else the actor name.
        default:
            if let title, !title.isEmpty { return title }
            return actor
        }
    }

    // MARK: Subtitle

    /// Secondary muted line. For group conversation messages this is the group
    /// (conversation) name — the iOS push subtitle. Direct messages and social
    /// events have no subtitle (their meaning is already in title + body).
    var toastSubtitle: String? {
        guard isConversationMessage, !isDirect else { return nil }
        guard let title = conversationTitle, !title.isEmpty else { return nil }
        return title
    }

    // MARK: Body

    /// Tertiary (preview) line. Message text / attachment label for messages,
    /// comment text for comment events. `nil` when the title already conveys
    /// everything (e.g. "X a aimé votre story").
    var toastBody: String? {
        switch notificationType {
        // Conversation messages: attachment label + message preview / content.
        case .newMessage, .legacyNewMessage,
             .messageReply, .reply, .legacyStoryReply,
             .userMentioned, .mention, .legacyMention:
            if let label = attachmentLabel {
                if let preview = nonEmptyContentPreview {
                    return "\(label) \u{2022} \(preview)"
                }
                return label
            }
            return nonEmptyContentPreview

        // Reactions: surface the reacted-to content when available.
        case .messageReaction, .reaction, .legacyMessageReaction:
            return nonEmpty(messagePreview)

        // Comment-family events: the comment / reply text.
        case .postComment, .legacyPostComment, .commentReply,
             .storyNewComment, .friendStoryComment, .storyThreadReply,
             .commentReaction:
            return nonEmpty(messagePreview)

        default:
            return nil
        }
    }

    // MARK: Avatar

    /// Avatar URL for the toast: the sender's photo, falling back to the group
    /// (conversation) avatar when the sender has none. Social events keep the
    /// sender avatar (they carry no group avatar).
    var toastAvatarURL: String? {
        if let sender = senderAvatar, !sender.isEmpty { return sender }
        if !isDirect, let group = conversationAvatar, !group.isEmpty { return group }
        return nil
    }

    /// Name used for the deterministic initials fallback. When the toast falls
    /// back to the group avatar slot, the initials represent the group.
    var toastAvatarName: String {
        let senderHasAvatar = (senderAvatar?.isEmpty == false)
        if !senderHasAvatar, !isDirect, conversationAvatar?.isEmpty == false,
           let title = conversationTitle, !title.isEmpty {
            return title
        }
        return actorDisplayName
    }

    /// Deterministic color seed for the avatar fallback gradient (stable across
    /// re-renders + matches the bubble's sender chip color).
    var toastAvatarColorSeed: String {
        senderId ?? toastAvatarName
    }

    // MARK: - Private helpers

    /// Message preview/content, ignoring empty strings.
    private var nonEmptyContentPreview: String? {
        if let preview = nonEmpty(messagePreview) { return preview }
        return nonEmpty(content)
    }

    private func nonEmpty(_ value: String?) -> String? {
        guard let value, !value.isEmpty else { return nil }
        return value
    }
}
