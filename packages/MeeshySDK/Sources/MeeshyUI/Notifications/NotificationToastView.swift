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

    // MARK: - Présentation
    //
    // Headline, corps, vignette et réaction viennent d'UNE seule source :
    // `NotificationToastManager.resolvedBannerPresentation(for:)`, qui compose
    // la phrase d'action LOCALISÉE PAR LE SERVEUR et y injecte le nom LOCAL du
    // groupe (renommage + emoji favori) que seul l'appareil connaît. La vue ne
    // décide de rien — elle place.

    private var presentation: NotificationBannerPresentation {
        NotificationToastManager.shared.resolvedBannerPresentation(for: event)
    }

    private var avatarColorHex: String {
        // Deterministic from the sender id (stable across re-renders + matches
        // the bubble's sender color) so the avatar fallback gradient looks the
        // same as the bubble's sender chip.
        DynamicColorGenerator.colorForName(event.toastAvatarColorSeed)
    }

    private static let thumbnailSide: CGFloat = 26

    // MARK: - Body

    public var body: some View {
        let banner = presentation
        return Button { onTap?() } label: {
            HStack(spacing: 10) {
                // Author avatar — uses the SDK's canonical MeeshyAvatar so
                // we honour the uploaded photo when present (via
                // CachedAvatarImage with disk caching) and fall back to
                // the deterministic initials circle when not.
                MeeshyAvatar(
                    name: event.toastAvatarName,
                    context: .notification,
                    accentColor: avatarColorHex,
                    avatarURL: event.toastAvatarURL
                )

                VStack(alignment: .leading, spacing: 3) {
                    Text(banner.headline)
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundColor(theme.textPrimary)
                        .lineLimit(1)

                    if banner.body != nil || banner.thumbnailURL != nil || banner.reactionBadge != nil {
                        HStack(spacing: 6) {
                            contentPreview(banner)
                            if let body = banner.body {
                                Text(body)
                                    .font(.system(size: 12))
                                    .foregroundColor(theme.textSecondary)
                                    .lineLimit(1)
                            }
                        }
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
        // La bannière est UN élément pour VoiceOver : trois fragments lus
        // séparément (« Alice a commenté votre réel », « super photo », l'image)
        // font trois arrêts là où l'information est une.
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(voiceOverLabel(banner))
        .accessibilityAddTraits(.isButton)
    }

    /// La vignette du contenu visé, ou son icône typée quand il n'y a pas
    /// d'image — c'est la même case, jamais deux dispositions différentes.
    @ViewBuilder
    private func contentPreview(_ banner: NotificationBannerPresentation) -> some View {
        ZStack(alignment: .bottomTrailing) {
            Group {
                if let thumbnail = banner.thumbnailURL {
                    CachedAsyncImage(
                        url: thumbnail,
                        targetSize: CGSize(width: Self.thumbnailSide, height: Self.thumbnailSide),
                        // Une bannière vit sept secondes : un spinner puis un
                        // bouton « réessayer » dans 26 points de côté ne
                        // seraient jamais ni lisibles ni actionnables.
                        showsStatusOverlays: false,
                        // 26 points de côté, une fois, pour dire QUEL contenu —
                        // c'est le sens même de la vignette. La retenir derrière
                        // la politique d'économie de données rendrait la case
                        // vide dans le cas nominal.
                        autoLoad: true
                    ) {
                        symbolTile(banner.contentSymbol)
                    }
                    .frame(width: Self.thumbnailSide, height: Self.thumbnailSide)
                    .clipShape(RoundedRectangle(cornerRadius: 6))
                } else {
                    symbolTile(banner.contentSymbol)
                }
            }

            if let badge = banner.reactionBadge {
                Text(badge)
                    .font(.system(size: 11))
                    .padding(2)
                    .background(
                        Circle().fill(Self.backgroundColor(isDark: isDark))
                    )
                    .offset(x: 5, y: 4)
            }
        }
        .frame(width: Self.thumbnailSide, height: Self.thumbnailSide)
    }

    private func symbolTile(_ symbol: String) -> some View {
        RoundedRectangle(cornerRadius: 6)
            .fill(accentColor.opacity(isDark ? 0.22 : 0.12))
            .overlay(
                Image(systemName: symbol)
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundColor(accentColor)
            )
            .frame(width: Self.thumbnailSide, height: Self.thumbnailSide)
    }

    /// Ce qu'un lecteur d'écran entend : la phrase, puis la charge. La vignette
    /// n'est pas décrite — elle ILLUSTRE le corps, elle ne l'augmente pas.
    private func voiceOverLabel(_ banner: NotificationBannerPresentation) -> String {
        [banner.headline, banner.reactionBadge, banner.body]
            .compactMap { $0 }
            .joined(separator: ", ")
    }
}
