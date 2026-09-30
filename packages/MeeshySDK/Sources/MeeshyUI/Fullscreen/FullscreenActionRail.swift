import SwiftUI

/// **Deux habillages pour une même action, et une raison pour chacun** (#8878).
public nonisolated enum FullscreenActionStyle: Equatable, Sendable {
    /// Le disque de verre du chrome : colonne COURTE (≤ 3 actions, sans compteur)
    /// posée à côté d'un média cadré — galerie de pièces jointes.
    case disc(FullscreenChromeTone)
    /// Le glyphe NU sous son halo, libellé ou compteur dessous : rail SOCIAL (story,
    /// réel) posé sur un média plein cadre, où une pile de disques pèserait sur l'image.
    case floating

    /// Ce que la cellule écrit sous le glyphe. Un disque n'écrit rien : son libellé
    /// est pour VoiceOver.
    public func showsCaption(_ caption: String?) -> Bool {
        guard case .floating = self, let caption else { return false }
        return !caption.isEmpty
    }
}

/// **Une action du rail plein écran** — Réagir, Répondre, Commentaires, Republier…
///
/// `caption` est le libellé visible (story) ou le compteur déjà formaté (réel,
/// `CompactCountLabel.text(_:)`) ; `label` reste le verbe lu par VoiceOver, et
/// `accessibilityValue` y ajoute le compteur.
public struct FullscreenActionButton: View {

    private let systemImage: String
    private let label: String
    private let hint: String?
    private let style: FullscreenActionStyle
    private let caption: String?
    private let valueDescription: String?
    private let badgeSystemImage: String?
    private let isActive: Bool
    private let activeTint: Color?
    private let handlesTapViaGesture: Bool
    private let action: () -> Void

    /// `handlesTapViaGesture` : pour la cellule qui porte AUSSI un geste séquencé de
    /// l'hôte (appui long → glisser) — un `Button` consommerait le toucher et la
    /// séquence ne s'armerait jamais. Le tap bref reste servi, VoiceOver aussi.
    public init(systemImage: String,
                label: String,
                hint: String? = nil,
                style: FullscreenActionStyle = .floating,
                caption: String? = nil,
                accessibilityValue: String? = nil,
                badgeSystemImage: String? = nil,
                isActive: Bool = false,
                activeTint: Color? = nil,
                handlesTapViaGesture: Bool = false,
                action: @escaping () -> Void) {
        self.systemImage = systemImage
        self.label = label
        self.hint = hint
        self.style = style
        self.caption = caption
        self.valueDescription = accessibilityValue
        self.badgeSystemImage = badgeSystemImage
        self.isActive = isActive
        self.activeTint = activeTint
        self.handlesTapViaGesture = handlesTapViaGesture
        self.action = action
    }

    public var body: some View {
        Group {
            if handlesTapViaGesture {
                cell
                    .onTapGesture { action() }
                    .accessibilityAddTraits(.isButton)
                    .accessibilityAction { action() }
            } else {
                Button(action: action) { cell }
                    .buttonStyle(.plain)
            }
        }
        .accessibilityLabel(label)
        .accessibilityHint(hint ?? "")
        .accessibilityValue(valueDescription ?? "")
        .accessibilityAddTraits(isActive ? [.isSelected] : [])
    }

    @ViewBuilder
    private var cell: some View {
        switch style {
        case .disc(let tone):
            FullscreenChromeDisc(systemImage: systemImage,
                                 badgeSystemImage: badgeSystemImage,
                                 tone: tone,
                                 activeTint: isActive ? activeTint : nil)
        case .floating:
            floatingCell
        }
    }

    private var floatingCell: some View {
        VStack(spacing: MeeshySpacing.xxs) {
            Image(systemName: systemImage)
                .font(.system(size: FullscreenChromeMetrics.floatingGlyphSize, weight: .semibold))
                .modifier(FullscreenChromeInk(tone: .adaptive, activeTint: isActive ? activeTint : nil))
                .overlay(alignment: .topTrailing) { floatingBadge }
                .adaptiveSymbolBounce(value: isActive)
                .modifier(FullscreenChromeHalo())
            if style.showsCaption(caption), let caption {
                Text(caption)
                    .font(MeeshyFont.relative(MeeshyFont.captionSize, weight: .semibold))
                    .glassControlForeground()
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
                    .modifier(FullscreenChromeHalo())
            }
        }
        .frame(width: FullscreenChromeMetrics.floatingCellWidth)
        .frame(minHeight: FullscreenChromeMetrics.tapTarget)
        .contentShape(Rectangle())
    }

    @ViewBuilder
    private var floatingBadge: some View {
        if let badgeSystemImage {
            Image(systemName: badgeSystemImage)
                .font(.system(size: MeeshyIconSize.xxs, weight: .black))
                .modifier(FullscreenChromeInk(tone: .adaptive, activeTint: isActive ? activeTint : nil))
                .offset(x: MeeshySpacing.xsPlus, y: -MeeshySpacing.xs)
                .accessibilityHidden(true)
        }
    }
}

/// Le plancher de lisibilité d'un glyphe nu : l'ombre de la légende, dans la polarité
/// opposée à sa teinte (`legibleOverCanvas(on:)`).
struct FullscreenChromeHalo: ViewModifier {
    @Environment(\.colorScheme) private var scheme

    func body(content: Content) -> some View {
        content.legibleOverCanvas(on: scheme)
    }
}

/// **Le rail d'actions** — au bord de FIN, ancré en bas, l'ordre fixé par la charte
/// § 6 : Réagir (ou J'aime), Répondre (ou Commentaires), puis ce que la surface ajoute.
public struct FullscreenActionRail<Content: View>: View {

    private let content: Content

    public init(@ViewBuilder content: () -> Content) {
        self.content = content()
    }

    public var body: some View {
        VStack(spacing: FullscreenChromeMetrics.railSpacing) {
            content
        }
        .accessibilityElement(children: .contain)
    }
}
