import SwiftUI
import Combine
import MeeshySDK

public struct NotificationToastView: View {
    public let event: SocketNotificationEvent
    public var onTap: (() -> Void)?

    // Transient leaf toast — do not observe the ThemeManager singleton.
    // `colorScheme` keeps theme-flip reactivity; `theme` is accessed
    // non-observingly for its derived text colors.
    @Environment(\.colorScheme) private var colorScheme
    private var theme: ThemeManager { ThemeManager.shared }

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

    private var authorAccentHex: String {
        // Deterministic from senderId (stable across re-renders + matches
        // the bubble's sender color) so the avatar fallback gradient
        // looks the same as the bubble's sender chip.
        DynamicColorGenerator.colorForName(event.senderId ?? authorName)
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
                // Author avatar — uses the SDK's canonical MeeshyAvatar so
                // we honour the uploaded photo when present (via
                // CachedAvatarImage with disk caching) and fall back to
                // the deterministic initials circle when not. The
                // previous implementation hard-coded the initials path
                // and ignored `event.senderAvatar` entirely.
                MeeshyAvatar(
                    name: authorName,
                    context: .notification,
                    accentColor: authorAccentHex,
                    avatarURL: event.senderAvatar
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
