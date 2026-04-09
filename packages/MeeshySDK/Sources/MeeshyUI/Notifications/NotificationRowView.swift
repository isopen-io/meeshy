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

    private var notifType: MeeshyNotificationType { notification.notificationType }
    private var accentColor: Color { Color(hex: notifType.accentHex) }

    public var body: some View {
        Button { onTap?() } label: {
            HStack(alignment: .top, spacing: 12) {
                iconView
                contentView
                Spacer(minLength: 4)
                timestampView
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
            .background(notification.isRead ? Color.clear : accentColor.opacity(0.05))
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
                .tint(Color(hex: "4338CA"))
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel(accessibilityDescription)
    }

    // MARK: - Icon

    private var iconView: some View {
        ZStack(alignment: .topTrailing) {
            MeeshyAvatar(
                name: notification.senderName ?? notifType.rawValue,
                context: .notification,
                accentColor: notifType.accentHex,
                avatarURL: notification.senderAvatar
            )

            if !notification.isRead {
                Circle()
                    .fill(accentColor)
                    .frame(width: 9, height: 9)
                    .offset(x: 2, y: -2)
            }
        }
    }

    // MARK: - Content

    private var contentView: some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(notification.formattedTitle)
                .font(.system(size: 14, weight: notification.isRead ? .medium : .semibold))
                .foregroundColor(theme.textPrimary)
                .lineLimit(2)

            if let body = notification.formattedBody, !body.isEmpty {
                Text(body)
                    .font(.system(size: 13))
                    .foregroundColor(theme.textSecondary)
                    .lineLimit(2)
            }

            if let conversationTitle = notification.context?.conversationTitle,
               notification.context?.conversationType != "direct" {
                Label(conversationTitle, systemImage: "bubble.left.and.bubble.right")
                    .font(.system(size: 11))
                    .foregroundColor(theme.textMuted)
                    .lineLimit(1)
                    .padding(.top, 1)
            }
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
            return "\(notification.senderName ?? "Quelqu'un") a rejoint le groupe"
        case .communityLeft, .memberLeft, .legacyGroupLeft:
            return "A quitte le groupe"
        case .missedCall, .callDeclined, .legacyCallMissed:
            return "Appel manque"
        case .incomingCall, .callEnded, .legacyCallIncoming:
            return "Appel entrant"
        case .postLike, .legacyPostLike, .storyReaction, .statusReaction, .commentLike:
            if let content = notification.content, !content.isEmpty {
                return content
            }
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
            let device = notification.metadata?.deviceName ?? notification.metadata?.deviceOS ?? "appareil inconnu"
            let location = notification.metadata?.location
                ?? [notification.metadata?.city, notification.metadata?.countryName].compactMap { $0 }.joined(separator: ", ")
            if !location.isEmpty {
                return "Connexion depuis \(device) — \(location)"
            }
            return "Connexion depuis \(device)"
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
        if let date = iso.date(from: notification.createdAt) {
            return formatRelative(date)
        }
        iso.formatOptions = [.withInternetDateTime]
        if let date = iso.date(from: notification.createdAt) {
            return formatRelative(date)
        }
        return ""
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
        let readState = notification.isRead ? "" : "Non lu. "
        let body = notification.formattedBody.map { ". \($0)" } ?? ""
        return "\(readState)\(notification.formattedTitle)\(body). \(relativeTime)"
    }
}
