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
        case .newMessage:
            return notification.data?.preview ?? "Nouveau message"
        case .messageReaction:
            return "A reagi a votre message"
        case .mention:
            return "Vous a mentionne"
        case .friendRequest:
            return "Demande d'ami"
        case .friendAccepted:
            return "A accepte votre demande"
        case .groupInvite:
            return "Invitation de groupe"
        case .groupJoined:
            return "A rejoint le groupe"
        case .groupLeft:
            return "A quitte le groupe"
        case .callMissed:
            return "Appel manque"
        case .callIncoming:
            return "Appel entrant"
        case .postLike:
            return "A aime votre publication"
        case .postComment:
            return "A commente votre publication"
        case .storyReply:
            return "A repondu a votre story"
        case .affiliateSignup:
            return "Inscription via votre lien"
        case .achievementUnlocked:
            return "Nouveau badge debloque !"
        case .systemAlert:
            return "Alerte systeme"
        case .statusUpdate:
            return "Mise a jour de statut"
        case .translationReady:
            return "Traduction disponible"
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
