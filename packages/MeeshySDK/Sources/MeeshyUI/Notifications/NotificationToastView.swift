import SwiftUI
import Combine
import MeeshySDK

/// La bannière in-app — la notification qui descend du haut de l'écran.
///
/// #8723 (porteur, 2026-09-29) : « un design plus sexy avec du RELIEF ». La
/// carte n'est plus un rectangle noir plat cerclé d'un liseré : c'est une
/// plaque de verre (`adaptiveGlass` — Liquid Glass sur iOS 26, matériau
/// translucide avant) posée sur un voile opaque qui garde le texte lisible
/// quoi qu'il y ait dessous, bordée d'un reflet en haut, et détachée de
/// l'écran par deux ombres — une large et douce (la hauteur), une courte
/// teintée de l'accent (le contact). L'avatar porte la pastille du TYPE, la
/// ligne de titre porte l'heure, et l'aperçu ne paraît qu'UNE fois.
public struct NotificationToastView: View {
    public let event: SocketNotificationEvent
    public var onTap: (() -> Void)?
    public var onDismiss: (() -> Void)?

    // Transient leaf toast — do not observe the ThemeManager singleton.
    // `colorScheme` keeps theme-flip reactivity; `theme` is accessed
    // non-observingly for its derived text colors.
    @Environment(\.colorScheme) private var colorScheme
    private var theme: ThemeManager { ThemeManager.shared }

    private var notifType: MeeshyNotificationType { event.notificationType }
    private var accentColor: Color { Color(hex: notifType.accentHex) }

    /// `ThemeManager.mode` et non `colorScheme` : le mode fait autorité sur
    /// TOUTES les couleurs du thème, y compris le `theme.textPrimary` posé sur
    /// ce fond. Un thème forcé par l'utilisateur (clair verrouillé sous un iOS
    /// en sombre) diverge de `colorScheme` — lire deux sources différentes pour
    /// le fond et pour le texte y donnerait du blanc sur blanc. `colorScheme`
    /// reste déclaré au-dessus : sa seule tâche est de faire re-rendre la vue
    /// au basculement de thème.
    private var isDark: Bool { theme.mode.isDark }

    /// La teinte du thème sous le verre. Une notification est un message du
    /// système à l'utilisateur : elle doit se lire d'un coup d'œil quel que
    /// soit ce qu'elle masque (photo, vidéo, fil) — le voile garde le
    /// contraste, le verre au-dessus donne la matière.
    public static func backgroundColor(isDark: Bool) -> Color {
        MeeshyColors.backgroundPrimary(isDark: isDark)
    }

    /// Opacité du voile sous le verre : assez dense pour que le texte du thème
    /// garde son contraste sur n'importe quel fond, assez légère pour que la
    /// matière du verre se voie. Fonction pure — XCTest ne peut pas
    /// introspecter un `ShapeStyle`, seule la DÉCISION est vérifiable.
    public static func scrimOpacity(isDark: Bool) -> Double {
        isDark ? 0.78 : 0.82
    }

    /// Le liseré : un REFLET en haut (la lumière tombe sur l'arête), l'accent
    /// du type en bas — c'est ce qui donne l'épaisseur.
    public static func borderColor(accent: Color, isDark: Bool) -> Color {
        accent.opacity(isDark ? 0.45 : 0.30)
    }

    /// - Parameter presentation: ce que la bannière affiche, déjà résolu par
    ///   `NotificationToastManager` au moment de la pose (#7167). Absent, il
    ///   est résolu ici — une fois, à la construction, jamais à chaque corps.
    public init(
        event: SocketNotificationEvent,
        presentation: NotificationBannerPresentation? = nil,
        onTap: (() -> Void)? = nil,
        onDismiss: (() -> Void)? = nil
    ) {
        self.event = event
        self.presentation = presentation ?? NotificationToastManager.shared.resolvedBannerPresentation(for: event)
        self.onTap = onTap
        self.onDismiss = onDismiss
    }

    // MARK: - Présentation
    //
    // Headline, corps, vignette et réaction viennent d'UNE seule source :
    // `NotificationToastManager.resolvedBannerPresentation(for:)`. La vue ne
    // décide de rien — elle place.

    /// STOCKÉE, jamais calculée (#7167).
    private let presentation: NotificationBannerPresentation

    /// L'heure d'arrivée, figée à la pose : la bannière vit quelques secondes,
    /// une horloge qui tourne n'y dirait rien de plus.
    private let receivedAt = Date()

    private var avatarColorHex: String {
        DynamicColorGenerator.colorForName(event.toastAvatarColorSeed)
    }

    private static let thumbnailSide: CGFloat = 30
    private static let cornerRadius: CGFloat = 22

    private var cardShape: RoundedRectangle {
        RoundedRectangle(cornerRadius: Self.cornerRadius, style: .continuous)
    }

    // MARK: - Body

    public var body: some View {
        let banner = presentation
        return Button { onTap?() } label: {
            HStack(alignment: .center, spacing: MeeshySpacing.md) {
                avatarWithTypeBadge

                VStack(alignment: .leading, spacing: MeeshySpacing.xxs) {
                    HStack(alignment: .firstTextBaseline, spacing: MeeshySpacing.xsPlus) {
                        Text(banner.headline)
                            .font(MeeshyFont.relative(MeeshyFont.labelSize, weight: .semibold))
                            .foregroundColor(theme.textPrimary)
                            .lineLimit(1)
                        Spacer(minLength: 4)
                        Text(receivedAt, style: .time)
                            .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .medium))
                            .foregroundColor(theme.textMuted)
                    }

                    if banner.body != nil || banner.showsContentTile || banner.reactionBadge != nil {
                        HStack(alignment: .center, spacing: MeeshySpacing.sm) {
                            if banner.showsContentTile {
                                contentPreview(banner)
                            } else if let badge = banner.reactionBadge {
                                Text(badge).font(.system(size: MeeshyFont.bodySize))
                            }
                            if let body = banner.body {
                                Text(body)
                                    .font(MeeshyFont.relative(MeeshyFont.subheadSize))
                                    .foregroundColor(theme.textSecondary)
                                    .lineLimit(2)
                                    .fixedSize(horizontal: false, vertical: true)
                            }
                        }
                    }
                }
            }
            .padding(.horizontal, MeeshySpacing.mdPlus)
            .padding(.top, MeeshySpacing.md)
            .padding(.bottom, MeeshySpacing.lg)
            .overlay(alignment: .bottom) { grabber }
            .background(cardShape.fill(Self.backgroundColor(isDark: isDark).opacity(Self.scrimOpacity(isDark: isDark))))
            .adaptiveGlass(in: cardShape, tint: accentColor.opacity(isDark ? 0.16 : 0.10))
            .overlay(cardShape.strokeBorder(rimGradient, lineWidth: 1))
            .shadow(color: .black.opacity(isDark ? 0.50 : 0.18), radius: 24, y: 14)
            .shadow(color: accentColor.opacity(isDark ? 0.30 : 0.20), radius: 6, y: 2)
            .contentShape(cardShape)
        }
        .buttonStyle(.plain)
        .padding(.horizontal, MeeshySpacing.sm)
        // La bannière est UN élément pour VoiceOver : trois fragments lus
        // séparément font trois arrêts là où l'information est une.
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(voiceOverLabel(banner))
        .accessibilityAddTraits(.isButton)
        .accessibilityHint(onDismiss == nil ? "" : String(localized: "notifications.banner.dismissHint", defaultValue: "Balayez vers le haut pour fermer", bundle: .module))
        .accessibilityAction(.escape) { onDismiss?() }
    }

    /// Le reflet du haut vers l'accent du bas — l'arête de la plaque.
    private var rimGradient: LinearGradient {
        LinearGradient(
            colors: [
                Color.white.opacity(isDark ? 0.28 : 0.85),
                Self.borderColor(accent: accentColor, isDark: isDark)
            ],
            startPoint: .top,
            endPoint: .bottom
        )
    }

    /// La poignée : dit sans mot que la carte se balaie.
    private var grabber: some View {
        Capsule()
            .fill(theme.textMuted.opacity(MeeshyOpacity.strong))
            .frame(width: 36, height: 4)
            .padding(.bottom, MeeshySpacing.xs)
            .accessibilityHidden(true)
    }

    /// L'avatar de l'acteur et, en pastille, l'icône du TYPE dans sa couleur :
    /// on sait QUI et QUOI avant d'avoir lu.
    private var avatarWithTypeBadge: some View {
        ZStack(alignment: .bottomTrailing) {
            MeeshyAvatar(
                name: event.toastAvatarName,
                context: .notification,
                accentColor: avatarColorHex,
                avatarURL: event.toastAvatarURL
            )
            .shadow(color: .black.opacity(isDark ? 0.35 : 0.12), radius: 4, y: 2)

            Circle()
                .fill(
                    LinearGradient(
                        colors: [accentColor, accentColor.opacity(0.78)],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )
                .overlay(
                    Image(systemName: notifType.systemIcon)
                        .font(.system(size: MeeshyIconSize.xxs, weight: .bold))
                        .foregroundColor(.white)
                )
                .frame(width: 20, height: 20)
                .overlay(Circle().stroke(Self.backgroundColor(isDark: isDark), lineWidth: MeeshyBorder.strong))
                .offset(x: 3, y: 3)
        }
        .accessibilityHidden(true)
    }

    /// La vignette du contenu visé, ou l'icône du contenu SOCIAL visé quand sa
    /// miniature manque — la même case, jamais deux dispositions. Elle n'est
    /// posée que si `showsContentTile` (#8897) : pour un message, la pastille
    /// de l'avatar dit déjà le type et le corps servi nomme le média.
    @ViewBuilder
    private func contentPreview(_ banner: NotificationBannerPresentation) -> some View {
        ZStack(alignment: .bottomTrailing) {
            Group {
                if let thumbnail = banner.thumbnailURL {
                    CachedAsyncImage(
                        url: thumbnail,
                        targetSize: CGSize(width: Self.thumbnailSide, height: Self.thumbnailSide),
                        // Une bannière vit sept secondes : un spinner puis un
                        // bouton « réessayer » dans une case de 30 points ne
                        // seraient jamais ni lisibles ni actionnables.
                        showsStatusOverlays: false,
                        // La case dit QUEL contenu — la retenir derrière la
                        // politique d'économie de données la rendrait vide
                        // dans le cas nominal.
                        autoLoad: true
                    ) {
                        symbolTile(banner.contentSymbol)
                    }
                    .frame(width: Self.thumbnailSide, height: Self.thumbnailSide)
                    .clipShape(RoundedRectangle(cornerRadius: MeeshyRadius.xs, style: .continuous))
                } else {
                    symbolTile(banner.contentSymbol)
                }
            }

            if let badge = banner.reactionBadge {
                Text(badge)
                    .font(.system(size: MeeshyFont.footnoteSize))
                    .padding(MeeshySpacing.xxs)
                    .background(Circle().fill(Self.backgroundColor(isDark: isDark)))
                    .offset(x: 5, y: 4)
            }
        }
        .frame(width: Self.thumbnailSide, height: Self.thumbnailSide)
    }

    /// La case teintée, avec l'icône du contenu social quand il y en a une —
    /// vide pendant qu'une vraie vignette charge ou si elle échoue.
    private func symbolTile(_ symbol: String?) -> some View {
        RoundedRectangle(cornerRadius: MeeshyRadius.xs, style: .continuous)
            .fill(accentColor.opacity(isDark ? 0.24 : 0.13))
            .overlay {
                if let symbol {
                    Image(systemName: symbol)
                        .font(.system(size: MeeshyIconSize.xs, weight: .semibold))
                        .foregroundColor(accentColor)
                }
            }
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

// MARK: - Le geste de la bannière (#8723)

/// Ce que décide un geste relâché sur la bannière. Vers le HAUT (ou lancé
/// vers le haut) ferme ; vers le BAS ouvre l'aperçu ; en deçà, rien. Pur :
/// c'est la seule partie du geste qu'un témoin peut tenir.
public enum NotificationBannerSwipe: Equatable, Sendable {
    case dismiss
    case preview
    case none

    public static func outcome(translation: CGFloat, predictedEnd: CGFloat) -> NotificationBannerSwipe {
        if translation < -30 || predictedEnd < -80 { return .dismiss }
        if translation > 36 { return .preview }
        return .none
    }
}
