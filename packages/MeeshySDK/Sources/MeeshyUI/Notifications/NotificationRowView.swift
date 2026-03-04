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
            Circle()
                .fill(accentColor.opacity(0.12))
                .frame(width: 44, height: 44)
                .overlay(
                    Image(systemName: notifType.systemIcon)
                        .font(.system(size: 18, weight: .semibold))
                        .foregroundColor(accentColor)
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
