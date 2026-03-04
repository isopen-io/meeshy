import SwiftUI
import MeeshySDK

public struct NotificationRowView: View {
    public let notification: APINotification
    public var onTap: (() -> Void)?
    public var onMarkRead: (() -> Void)?
    public var onDelete: (() -> Void)?

    @ObservedObject private var theme = ThemeManager.shared

    public init(
        notification: APINotification,
        onTap: (() -> Void)? = nil,
        onMarkRead: (() -> Void)? = nil,
        onDelete: (() -> Void)? = nil
    ) {
        self.notification = notification
        self.onTap = onTap
        self.onMarkRead = onMarkRead
        self.onDelete = onDelete
    }

    private var notifType: MeeshyNotificationType {
        notification.notificationType
    }

    public var body: some View {
        Button {
            onTap?()
        } label: {
            HStack(alignment: .top, spacing: 12) {
                iconView
                contentView
                Spacer(minLength: 4)
                timestampView
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
            .background(notification.isRead ? Color.clear : Color(hex: notifType.color).opacity(0.05))
        }
        .buttonStyle(.plain)
        .swipeActions(edge: .trailing, allowsFullSwipe: true) {
            if let onDelete {
                Button(role: .destructive) { onDelete() } label: {
                    Label("Supprimer", systemImage: "trash")
                }
            }
        }
        .swipeActions(edge: .leading, allowsFullSwipe: true) {
            if !notification.isRead, let onMarkRead {
                Button { onMarkRead() } label: {
                    Label("Lu", systemImage: "envelope.open")
                }
                .tint(Color(hex: "4ECDC4"))
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel(accessibilityDescription)
    }

    // MARK: - Icon

    private var iconView: some View {
        ZStack {
            Circle()
                .fill(Color(hex: notifType.color).opacity(0.15))
                .frame(width: 40, height: 40)

            Image(systemName: notifType.icon)
                .font(.system(size: 16, weight: .semibold))
                .foregroundColor(Color(hex: notifType.color))

            if !notification.isRead {
                Circle()
                    .fill(Color(hex: notifType.color))
                    .frame(width: 8, height: 8)
                    .offset(x: 14, y: -14)
            }
        }
    }

    // MARK: - Content

    private var contentView: some View {
        VStack(alignment: .leading, spacing: 3) {
            if let senderName = notification.senderName {
                Text(senderName)
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundColor(theme.textPrimary)
                    .lineLimit(1)
            }

            Text(messageText)
                .font(.system(size: 13, weight: notification.isRead ? .regular : .medium))
                .foregroundColor(notification.isRead ? theme.textMuted : theme.textPrimary)
                .lineLimit(2)
        }
    }

    // MARK: - Timestamp

    private var timestampView: some View {
        Text(relativeTime)
            .font(.system(size: 11, weight: .medium))
            .foregroundColor(theme.textMuted)
    }

    // MARK: - Computed

    private var messageText: String {
        if let message = notification.message, !message.isEmpty {
            return message
        }
        return contextualMessage
    }

    private var contextualMessage: String {
        switch notifType {
        case .newMessage, .legacyNewMessage, .messageReply:
            return notification.data?.preview ?? "Nouveau message"
        case .messageReaction, .reaction, .legacyMessageReaction:
            return "A reagi a votre message"
        case .userMentioned, .mention, .legacyMention:
            return "Vous a mentionne"
        case .friendRequest, .contactRequest, .legacyFriendRequest:
            return "Demande d'ami"
        case .friendAccepted, .contactAccepted, .legacyFriendAccepted:
            return "A accepte votre demande"
        case .communityInvite, .legacyGroupInvite:
            return "Invitation de groupe"
        case .communityJoined, .memberJoined, .legacyGroupJoined:
            return "A rejoint le groupe"
        case .communityLeft, .memberLeft, .legacyGroupLeft:
            return "A quitte le groupe"
        case .missedCall, .callDeclined, .legacyCallMissed:
            return "Appel manque"
        case .incomingCall, .callEnded, .legacyCallIncoming:
            return "Appel entrant"
        case .postLike, .legacyPostLike, .storyReaction, .statusReaction, .commentLike:
            return "A aime votre publication"
        case .postComment, .commentReply, .legacyPostComment:
            return "A commente votre publication"
        case .legacyStoryReply:
            return "A repondu a votre story"
        case .legacyAffiliateSignup:
            return "Inscription via votre lien"
        case .achievementUnlocked, .legacyAchievementUnlocked, .streakMilestone, .badgeEarned:
            return "Nouveau badge debloque !"
        case .securityAlert, .legacySystemAlert:
            return "Alerte systeme"
        case .loginNewDevice:
            return "Connexion nouvel appareil"
        case .passwordChanged:
            return "Mot de passe modifie"
        case .twoFactorEnabled:
            return "Verification en 2 etapes activee"
        case .twoFactorDisabled:
            return "Verification en 2 etapes desactivee"
        case .legacyStatusUpdate:
            return "Mise a jour de statut"
        case .translationCompleted, .translationReady, .legacyTranslationReady, .transcriptionCompleted:
            return "Traduction disponible"
        case .system, .maintenance, .updateAvailable:
            return "Notification systeme"
        case .voiceCloneReady:
            return "Clone vocal pret"
        case .postRepost:
            return "A repartage votre publication"
        case .addedToConversation, .newConversation:
            return "Ajoute a une conversation"
        case .removedFromConversation, .memberRemoved:
            return "Retire de la conversation"
        case .memberPromoted:
            return "Promu dans le groupe"
        case .memberDemoted:
            return "Retrogade dans le groupe"
        case .memberRoleChanged:
            return "Role modifie"
        case .messageEdited:
            return "Message modifie"
        case .messageDeleted:
            return "Message supprime"
        case .messagePinned:
            return "Message epingle"
        case .messageForwarded:
            return "Message transfere"
        case .reply:
            return notification.data?.preview ?? "A repondu a votre message"
        }
    }

    private var relativeTime: String {
        let iso = ISO8601DateFormatter()
        iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        guard let date = iso.date(from: notification.createdAt) else {
            iso.formatOptions = [.withInternetDateTime]
            guard let fallback = iso.date(from: notification.createdAt) else { return "" }
            return formatRelative(fallback)
        }
        return formatRelative(date)
    }

    private func formatRelative(_ date: Date) -> String {
        let interval = Date().timeIntervalSince(date)
        if interval < 60 { return "maintenant" }
        if interval < 3600 { return "\(Int(interval / 60))min" }
        if interval < 86400 { return "\(Int(interval / 3600))h" }
        if interval < 604800 { return "\(Int(interval / 86400))j" }
        return "\(Int(interval / 604800))sem"
    }

    private var accessibilityDescription: String {
        let readState = notification.isRead ? "" : "Non lu."
        let sender = notification.senderName ?? ""
        return "\(readState) \(sender) \(messageText) \(relativeTime)"
    }
}
