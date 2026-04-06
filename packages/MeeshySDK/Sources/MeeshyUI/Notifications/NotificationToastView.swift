import SwiftUI
import MeeshySDK

/// Toast in-app affiché quand une notification arrive via Socket.IO
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

    public var body: some View {
        Button { onTap?() } label: {
            HStack(spacing: 12) {
                // Icon with accent background
                Circle()
                    .fill(accentColor.opacity(0.15))
                    .frame(width: 40, height: 40)
                    .overlay(
                        Image(systemName: notifType.systemIcon)
                            .font(.system(size: 16, weight: .semibold))
                            .foregroundColor(accentColor)
                    )

                // Content
                VStack(alignment: .leading, spacing: 2) {
                    Text(event.title ?? "Meeshy")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundColor(theme.textPrimary)
                        .lineLimit(1)

                    let body = event.messagePreview ?? (event.content.isEmpty ? nil : event.content)
                    if let body {
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
