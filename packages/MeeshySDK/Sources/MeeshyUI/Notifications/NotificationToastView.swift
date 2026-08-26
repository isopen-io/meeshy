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

    /// `ThemeManager.mode` et non `colorScheme` : le mode fait autorité sur
    /// TOUTES les couleurs du thème, y compris le `theme.textPrimary` posé sur
    /// ce fond quelques lignes plus bas. Un thème forcé par l'utilisateur
    /// (clair verrouillé sous un iOS en sombre) diverge de `colorScheme` — lire
    /// deux sources différentes pour le fond et pour le texte y donnerait du
    /// blanc sur blanc. `colorScheme` reste déclaré au-dessus : sa seule tâche
    /// est de faire re-rendre la vue au basculement de thème.
    private var isDark: Bool { theme.mode.isDark }

    /// Fond OPAQUE aux couleurs de l'application — blanc en clair, `#09090B` en
    /// sombre — et non plus `.ultraThinMaterial`.
    ///
    /// Le matériau translucide laissait remonter ce qui passait dessous : sur
    /// un fil de conversation, une photo, un lecteur vidéo, le texte du toast
    /// perdait son contraste et la bannière semblait appartenir à l'écran
    /// qu'elle recouvre au lieu de s'en détacher. Une notification est un
    /// message du système à l'utilisateur : elle doit se lire d'un coup d'œil,
    /// quel que soit ce qu'elle masque.
    ///
    /// Fonction pure `static` : XCTest ne peut pas introspecter le `ShapeStyle`
    /// passé à un modificateur SwiftUI — seule la DÉCISION est vérifiable.
    /// Même pattern que `ConversationScrollControlsView.isCompactShape`.
    public static func backgroundColor(isDark: Bool) -> Color {
        MeeshyColors.backgroundPrimary(isDark: isDark)
    }

    /// Bordure : l'accent du type de notification, franc sur fond opaque.
    public static func borderColor(accent: Color, isDark: Bool) -> Color {
        accent.opacity(isDark ? 0.45 : 0.30)
    }

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
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundColor(theme.textPrimary)
                        .lineLimit(1)

                    if let subtitle = NotificationToastManager.shared.resolvedToastSubtitle(for: event) {
                        Text(subtitle)
                            .font(.system(size: 11, weight: .medium))
                            .foregroundColor(theme.textMuted)
                            .lineLimit(1)
                    }

                    if let body = event.toastBody {
                        Text(body)
                            .font(.system(size: 12))
                            .foregroundColor(theme.textSecondary)
                            .lineLimit(1)
                    }
                }

                Spacer(minLength: 4)

                Image(systemName: "chevron.forward")
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundColor(theme.textMuted)
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
            .background(
                RoundedRectangle(cornerRadius: 16)
                    .fill(Self.backgroundColor(isDark: isDark))
                    .overlay(
                        RoundedRectangle(cornerRadius: 16)
                            .stroke(Self.borderColor(accent: accentColor, isDark: isDark), lineWidth: 1)
                    )
                    // Ombre portée plus dense en clair : un rectangle blanc sur
                    // un fond clair ne se détache que par elle.
                    .shadow(color: .black.opacity(isDark ? 0.45 : 0.18), radius: 18, y: 8)
            )
        }
        .buttonStyle(.plain)
        .padding(.horizontal, 16)
    }
}
