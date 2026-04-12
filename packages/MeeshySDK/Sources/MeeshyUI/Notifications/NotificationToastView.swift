import SwiftUI
import Combine
import MeeshySDK

public struct NotificationToastView: View {
    public let event: SocketNotificationEvent
    public var onTap: (() -> Void)?

    @ObservedObject private var theme = ThemeManager.shared

    private var notifType: MeeshyNotificationType { event.notificationType }
    private var accentColor: Color { Color(hex: notifType.accentHex) }

    public init(event: SocketNotificationEvent, onTap: (() -> Void)? = nil) {
        self.event = event
        self.onTap = onTap
    }

    // MARK: - Author display

    private var authorName: String {
        event.senderDisplayName ?? event.senderUsername ?? event.title ?? "Meeshy"
    }

    private var authorInitials: String {
        let name = authorName
        let parts = name.split(separator: " ")
        if parts.count >= 2 {
            return "\(parts[0].prefix(1))\(parts[1].prefix(1))".uppercased()
        }
        return String(name.prefix(2)).uppercased()
    }

    private var authorColor: Color {
        let hex = DynamicColorGenerator.colorForName(event.senderId ?? authorName)
        return Color(hex: hex)
    }

    // MARK: - Body text

    private var bodyText: String? {
        if let label = event.attachmentLabel {
            if let preview = event.messagePreview, !preview.isEmpty {
                return "\(label) \u{2022} \(preview)"
            }
            return label
        }
        if let preview = event.messagePreview, !preview.isEmpty { return preview }
        if !event.content.isEmpty { return event.content }
        return nil
    }

    // MARK: - Conversation context (non-DM only)

    private var conversationLabel: String? {
        guard !event.isDirect, let title = event.conversationTitle, !title.isEmpty else { return nil }
        return "dans \(title)"
    }

    // MARK: - Body

    public var body: some View {
        Button { onTap?() } label: {
            HStack(spacing: 10) {
                // Author avatar (initials circle)
                Circle()
                    .fill(authorColor)
                    .frame(width: 36, height: 36)
                    .overlay(
                        Text(authorInitials)
                            .font(.system(size: 13, weight: .bold))
                            .foregroundColor(.white)
                    )

                VStack(alignment: .leading, spacing: 2) {
                    HStack(spacing: 6) {
                        Text(authorName)
                            .font(.system(size: 13, weight: .semibold))
                            .foregroundColor(theme.textPrimary)
                            .lineLimit(1)

                        if let convLabel = conversationLabel {
                            Text(convLabel)
                                .font(.system(size: 11))
                                .foregroundColor(theme.textMuted)
                                .lineLimit(1)
                        }
                    }

                    if let body = bodyText {
                        Text(body)
                            .font(.system(size: 12))
                            .foregroundColor(theme.textSecondary)
                            .lineLimit(1)
                    }
                }

                Spacer(minLength: 4)

                Image(systemName: "chevron.right")
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundColor(theme.textMuted)
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
            .background(
                RoundedRectangle(cornerRadius: 16)
                    .fill(.ultraThinMaterial)
                    .overlay(
                        RoundedRectangle(cornerRadius: 16)
                            .stroke(accentColor.opacity(0.3), lineWidth: 1)
                    )
                    .shadow(color: .black.opacity(0.18), radius: 16, y: 6)
            )
        }
        .buttonStyle(.plain)
        .padding(.horizontal, 16)
    }
}
