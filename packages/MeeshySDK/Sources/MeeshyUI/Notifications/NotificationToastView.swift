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
    //
    // Title / subtitle / body / avatar are resolved by the SDK's
    // `SocketNotificationEvent` toast helpers so the precision (sender =
    // title, group = subtitle for messages ; precise action phrase for
    // reactions / comments / replies / reposts) stays a single source of
    // truth shared with the notification list & push layer.

    private var avatarColorHex: String {
        // Deterministic from the sender id (stable across re-renders + matches
        // the bubble's sender color) so the avatar fallback gradient looks the
        // same as the bubble's sender chip.
        DynamicColorGenerator.colorForName(event.toastAvatarColorSeed)
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
                    name: event.toastAvatarName,
                    context: .notification,
                    accentColor: avatarColorHex,
                    avatarURL: event.toastAvatarURL
                )

                VStack(alignment: .leading, spacing: 2) {
                    Text(event.toastTitle)
                        .font(MeeshyFont.relative(13, weight: .semibold))
                        .foregroundColor(theme.textPrimary)
                        .lineLimit(1)

                    if let subtitle = NotificationToastManager.shared.resolvedToastSubtitle(for: event) {
                        Text(subtitle)
                            .font(MeeshyFont.relative(11, weight: .medium))
                            .foregroundColor(theme.textMuted)
                            .lineLimit(1)
                    }

                    if let body = event.toastBody {
                        Text(body)
                            .font(MeeshyFont.relative(12))
                            .foregroundColor(theme.textSecondary)
                            .lineLimit(1)
                    }
                }

                Spacer(minLength: 4)

                Image(systemName: "chevron.right")
                    .font(MeeshyFont.relative(10, weight: .semibold))
                    .foregroundColor(theme.textMuted)
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
            .background(
                RoundedRectangle(cornerRadius: MeeshyRadius.lg)
                    .fill(.ultraThinMaterial)
                    .overlay(
                        RoundedRectangle(cornerRadius: MeeshyRadius.lg)
                            .stroke(accentColor.opacity(0.3), lineWidth: 1)
                    )
                    .shadow(color: .black.opacity(0.18), radius: 16, y: 6)
            )
        }
        .buttonStyle(.plain)
        .padding(.horizontal, 16)
    }
}
