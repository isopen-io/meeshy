import SwiftUI

/// **La rangée d'émojis du plein écran — une forme pour toutes les surfaces** (#8878).
///
/// `EmojiReactionPicker` à son échelle par défaut (jamais surchargée, garde
/// `ReactionBarScaleParityTests`), défilante — corollaire de l'échelle —, sans
/// habillage : le média EST son fond (#6083). Les paramètres de scrub (tuile survolée,
/// cadres publiés) passent tels quels pour la surface qui les pilote (story).
public struct FullscreenReactionStrip: View {

    private let quickEmojis: [String]
    private let onReact: (String) -> Void
    private let onDismiss: (() -> Void)?
    private let onExpandFullPicker: (() -> Void)?
    private let highlightedIndex: Int?
    private let scrubFrameSpace: String?
    private let onTileFrames: (([Int: CGRect]) -> Void)?

    public init(quickEmojis: [String] = MeeshyQuickReactions.standard,
                onReact: @escaping (String) -> Void,
                onDismiss: (() -> Void)? = nil,
                onExpandFullPicker: (() -> Void)? = nil,
                highlightedIndex: Int? = nil,
                scrubFrameSpace: String? = nil,
                onTileFrames: (([Int: CGRect]) -> Void)? = nil) {
        self.quickEmojis = quickEmojis
        self.onReact = onReact
        self.onDismiss = onDismiss
        self.onExpandFullPicker = onExpandFullPicker
        self.highlightedIndex = highlightedIndex
        self.scrubFrameSpace = scrubFrameSpace
        self.onTileFrames = onTileFrames
    }

    public var body: some View {
        EmojiReactionPicker(
            quickEmojis: quickEmojis,
            style: .dark,
            scrollable: true,
            chrome: .none,
            onReact: onReact,
            onDismiss: onDismiss,
            onExpandFullPicker: onExpandFullPicker,
            highlightedIndex: highlightedIndex,
            scrubFrameSpace: scrubFrameSpace,
            onTileFrames: onTileFrames
        )
    }
}

public extension FullscreenActionButton {

    /// **« Réagir »** — l'émoji et son « + » (directive porteur #6084 : « un bouton
    /// réagir (emoji +) »). Le tap OUVRE la rangée ; il ne pose jamais d'émoji à
    /// l'aveugle. Ouverte, l'action se teinte `indigo400`.
    ///
    /// La story garde son CŒUR (directive porteur 2026-10-01 : « le cœur et non
    /// réaction, car on ne voit pas ») : elle passe `systemImage: likeActive`, sans
    /// badge, sans teinte — le contour (`outlineTint`) dit l'état, autour d'un glyphe
    /// qui reste lisible. Les autres surfaces gardent l'émoji et son « + ».
    static func react(label: String,
                      hint: String? = nil,
                      style: FullscreenActionStyle = .floating,
                      caption: String? = nil,
                      accessibilityValue: String? = nil,
                      systemImage: String = FullscreenChromeSymbol.react,
                      badgeSystemImage: String? = FullscreenChromeSymbol.reactBadge,
                      isOpen: Bool,
                      activeTint: Color? = MeeshyColors.indigo400,
                      outlineTint: Color? = nil,
                      handlesTapViaGesture: Bool = false,
                      action: @escaping () -> Void) -> FullscreenActionButton {
        FullscreenActionButton(systemImage: systemImage,
                               label: label,
                               hint: hint,
                               style: style,
                               caption: caption,
                               accessibilityValue: accessibilityValue,
                               badgeSystemImage: badgeSystemImage,
                               isActive: isOpen,
                               activeTint: activeTint,
                               outlineTint: outlineTint,
                               handlesTapViaGesture: handlesTapViaGesture,
                               action: action)
    }

    /// **« Répondre »** — ouvre la barre de saisie qui CITE le média, au bas de l'écran,
    /// sans quitter le visualiseur.
    static func reply(label: String,
                      hint: String? = nil,
                      style: FullscreenActionStyle = .floating,
                      caption: String? = nil,
                      accessibilityValue: String? = nil,
                      isOpen: Bool = false,
                      action: @escaping () -> Void) -> FullscreenActionButton {
        FullscreenActionButton(systemImage: FullscreenChromeSymbol.reply,
                               label: label,
                               hint: hint,
                               style: style,
                               caption: caption,
                               accessibilityValue: accessibilityValue,
                               isActive: isOpen,
                               activeTint: MeeshyColors.indigo400,
                               action: action)
    }
}
