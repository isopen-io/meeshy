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

    // MARK: Title

    /// Primary (bold) line of the toast.
    ///
    /// Prisme Linguistique (i18n serveur) : comme le push iOS, le *titre* est
    /// l'expéditeur (acteur) et la phrase d'action localisée vit dans le *corps*
    /// (`content` déjà localisé par le gateway dans la langue du destinataire).
    /// On ne reconstruit donc plus de phrase FR ici. Les événements sans acteur
    /// retombent sur le `title` backend.
    /// Voir docs/superpowers/specs/2026-06-16-notification-system-i18n-design.md
    var toastTitle: String {
        let actor = actorDisplayName
        if actor != "Quelqu'un" { return actor }
        if let title, !title.isEmpty { return title }
        return actor
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

    /// Tertiary (preview) line.
    ///
    /// Conversation messages → attachment label + message preview / content.
    /// Tous les autres événements → le `content` localisé par le gateway
    /// (« a réagi ❤️ à votre message », « a commenté votre story » …), affiché
    /// sous l'expéditeur exactement comme le corps du push iOS. Plus aucune
    /// reconstruction FR côté client (Prisme-first, i18n serveur).
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

        // Everything else: the gateway already localized the action phrase into
        // `content`. Display it verbatim.
        default:
            return nonEmpty(content)
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
