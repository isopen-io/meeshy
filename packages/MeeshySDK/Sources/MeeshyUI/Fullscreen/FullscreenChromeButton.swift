import SwiftUI

/// **La teinte d'un bouton posé sur un média.**
public nonisolated enum FullscreenChromeTone: Equatable, Sendable {
    /// Glyphe `mediaChromeForeground`, verre teinté `mediaChromeFill` : lisible sur
    /// n'importe quelle image, sans mesure. Le défaut.
    case onMedia
    /// Glyphe `glassControlForeground()`, verre nu : suit le `colorScheme` de
    /// l'environnement. Pour l'hôte qui pose ce schéma d'après la luminance du média
    /// (#6693) — sans lui, le glyphe serait indigo sur une image sombre en thème clair.
    case adaptive
}

/// **Le disque du chrome plein écran — ce qu'on VOIT** (#8878).
///
/// Un glyphe figé dans un disque de verre de `FullscreenChromeMetrics.discDiameter`,
/// entouré d'une cible pleine de `FullscreenChromeMetrics.tapTarget`. Sert de libellé
/// à un `Button` (`FullscreenChromeButton`) comme à un `Menu` (`FullscreenMoreMenu`).
public struct FullscreenChromeDisc: View {

    private let systemImage: String
    private let badgeSystemImage: String?
    private let tone: FullscreenChromeTone
    private let activeTint: Color?

    public init(systemImage: String,
                badgeSystemImage: String? = nil,
                tone: FullscreenChromeTone = .onMedia,
                activeTint: Color? = nil) {
        self.systemImage = systemImage
        self.badgeSystemImage = badgeSystemImage
        self.tone = tone
        self.activeTint = activeTint
    }

    public var body: some View {
        glyph
            .overlay(alignment: .topTrailing) { badge }
            .frame(width: FullscreenChromeMetrics.discDiameter,
                   height: FullscreenChromeMetrics.discDiameter)
            .adaptiveGlass(in: Circle(),
                           tint: tone == .onMedia ? MeeshyColors.mediaChromeFill : nil,
                           interactive: true)
            .frame(width: FullscreenChromeMetrics.tapTarget,
                   height: FullscreenChromeMetrics.tapTarget)
            .contentShape(Rectangle())
    }

    private var glyph: some View {
        Image(systemName: systemImage)
            .font(.system(size: FullscreenChromeMetrics.discGlyphSize, weight: .semibold))
            .modifier(FullscreenChromeInk(tone: tone, activeTint: activeTint))
    }

    @ViewBuilder
    private var badge: some View {
        if let badgeSystemImage {
            Image(systemName: badgeSystemImage)
                .font(.system(size: MeeshyIconSize.xxs, weight: .black))
                .modifier(FullscreenChromeInk(tone: tone, activeTint: activeTint))
                .offset(x: MeeshySpacing.xsPlus, y: -MeeshySpacing.xs)
                .accessibilityHidden(true)
        }
    }
}

/// L'encre d'un glyphe du chrome : la teinte d'un état ACTIF d'abord, la tonalité sinon.
struct FullscreenChromeInk: ViewModifier {
    let tone: FullscreenChromeTone
    let activeTint: Color?

    @ViewBuilder
    func body(content: Content) -> some View {
        if let activeTint {
            content.foregroundStyle(activeTint)
        } else if tone == .onMedia {
            content.foregroundStyle(MeeshyColors.mediaChromeForeground)
        } else {
            content.glassControlForeground()
        }
    }
}

/// **Un bouton du chrome plein écran** : le disque, son geste, son libellé VoiceOver.
public struct FullscreenChromeButton: View {

    private let systemImage: String
    private let label: String
    private let hint: String?
    private let badgeSystemImage: String?
    private let tone: FullscreenChromeTone
    private let isActive: Bool
    private let activeTint: Color?
    private let action: () -> Void

    public init(systemImage: String,
                label: String,
                hint: String? = nil,
                badgeSystemImage: String? = nil,
                tone: FullscreenChromeTone = .onMedia,
                isActive: Bool = false,
                activeTint: Color? = nil,
                action: @escaping () -> Void) {
        self.systemImage = systemImage
        self.label = label
        self.hint = hint
        self.badgeSystemImage = badgeSystemImage
        self.tone = tone
        self.isActive = isActive
        self.activeTint = activeTint
        self.action = action
    }

    public var body: some View {
        Button {
            HapticFeedback.light()
            action()
        } label: {
            FullscreenChromeDisc(systemImage: systemImage,
                                 badgeSystemImage: badgeSystemImage,
                                 tone: tone,
                                 activeTint: isActive ? activeTint : nil)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
        .accessibilityHint(hint ?? "")
        .accessibilityAddTraits(isActive ? [.isSelected] : [])
    }
}

/// **La porte de sortie** — `xmark`, au bord de DÉBUT de lecture de la barre haute
/// (à gauche, à droite en arabe), la même dans chaque visualiseur.
public struct FullscreenCloseButton: View {

    private let tone: FullscreenChromeTone
    private let hint: String?
    private let action: () -> Void

    public init(tone: FullscreenChromeTone = .onMedia,
                hint: String? = nil,
                action: @escaping () -> Void) {
        self.tone = tone
        self.hint = hint
        self.action = action
    }

    public var body: some View {
        FullscreenChromeButton(
            systemImage: FullscreenChromeSymbol.close,
            label: String(localized: "common.close", defaultValue: "Fermer", bundle: .module),
            hint: hint,
            tone: tone,
            action: action
        )
    }
}

/// **Le menu « Plus d'options »** — `ellipsis`, au bord de FIN de la barre haute.
/// Le contenu (copier, partager, enregistrer, signaler…) reste à l'hôte.
public struct FullscreenMoreMenu<Content: View>: View {

    private let tone: FullscreenChromeTone
    private let isBusy: Bool
    private let content: Content

    public init(tone: FullscreenChromeTone = .onMedia,
                isBusy: Bool = false,
                @ViewBuilder content: () -> Content) {
        self.tone = tone
        self.isBusy = isBusy
        self.content = content()
    }

    public var body: some View {
        Menu {
            content
        } label: {
            if isBusy {
                ProgressView()
                    .tint(MeeshyColors.mediaChromeForeground)
                    .frame(width: FullscreenChromeMetrics.tapTarget,
                           height: FullscreenChromeMetrics.tapTarget)
            } else {
                FullscreenChromeDisc(systemImage: FullscreenChromeSymbol.more, tone: tone)
            }
        }
        .accessibilityLabel(String(localized: "media.video.more_options",
                                   defaultValue: "Plus d'options", bundle: .module))
    }
}
