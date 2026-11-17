import Foundation

/// Les sept fonds de la carte : relevée (le défaut), creusée (dans une feuille),
/// verre (sur un média), lavis d'accent, danger, pointillé (ce qui est fermé ou
/// vide) et aplat (une carte d'action qui doit se voir en premier).
public nonisolated enum MeeshyGroupCardSurface: String, Sendable, Equatable, CaseIterable {
    case raised
    case ground
    case glass
    case accent
    case danger
    case dashed
    case solid
}

/// Les cinq gabarits : des rangées (`group`), du contenu libre (`content`), une
/// demande (`prompt`), un aperçu riche (`preview`) et la carte qui se touche en
/// entier (`action`).
public nonisolated enum MeeshyGroupCardLayout: String, Sendable, Equatable, CaseIterable {
    case group
    case content
    case prompt
    case preview
    case action
}

/// **La recette de K43 en VALEURS** : rayon, bord, lavis, filets, marges et états.
/// Aucun rayon ni couleur ne vit hors d'elle ; le verre ne vient que de K01.
/// `danger` teinte fond, bord ET filets : le rouge annonce une conséquence, il ne
/// décore pas.
public nonisolated struct MeeshyGroupCardRecipe: Sendable, Equatable {

    public static let pageRadius: Double = 26
    public static let mediaRadius: Double = 30
    public static let actionRadius: Double = 24
    public static let bubbleCornerRadius: Double = 8
    public static let dividerInset: Double = 18
    public static let headerHeight: Double = 44
    public static let rowMinHeight: Double = 60
    public static let neighbourGap: Double = 10
    public static let actionMinHeight: Double = 148
    public static let lockedOpacity: Double = 0.42
    public static let pressedScale: Double = 0.97
    public static let pressedLighten: Double = 0.12
    public static let haloWidth: Double = 4
    public static let haloOpacity: Double = 0.18

    public let surface: MeeshyGroupCardSurface
    public let layout: MeeshyGroupCardLayout
    public let cornerRadius: Double
    public let bubbleCornerRadius: Double
    public let borderWidth: Double
    public let borderOpacity: Double
    public let washOpacity: Double
    public let dividerOpacity: Double
    public let dividerInset: Double
    public let hasFill: Bool
    public let isBorderDashed: Bool
    public let usesDarkInk: Bool
    public let usesGlass: Bool
    public let headerHeight: Double
    public let rowMinHeight: Double
    public let verticalPadding: Double
    public let minHeight: Double
    public let scale: Double
    public let lighten: Double
    public let contentOpacity: Double
    public let isActive: Bool
    public let haloWidth: Double
    public let haloOpacity: Double

    public static func resolve(
        surface: MeeshyGroupCardSurface = .raised,
        layout: MeeshyGroupCardLayout = .content,
        isPressable: Bool = false,
        isPressed: Bool = false,
        isLocked: Bool = false,
        isFeatured: Bool = false,
        isBubble: Bool = false
    ) -> MeeshyGroupCardRecipe {
        let radius = cornerRadius(surface: surface, layout: layout)
        let lifted = isPressable && isPressed && !isLocked
        return MeeshyGroupCardRecipe(
            surface: surface,
            layout: layout,
            cornerRadius: radius,
            bubbleCornerRadius: isBubble ? bubbleCornerRadius : radius,
            borderWidth: borderWidth(surface),
            borderOpacity: borderOpacity(surface),
            washOpacity: washOpacity(surface),
            dividerOpacity: surface == .danger ? 0.24 : 1,
            dividerInset: dividerInset,
            hasFill: surface != .dashed,
            isBorderDashed: surface == .dashed,
            usesDarkInk: surface == .solid,
            usesGlass: surface == .glass,
            headerHeight: headerHeight,
            rowMinHeight: rowMinHeight,
            verticalPadding: layout == .group ? 6 : 0,
            minHeight: layout == .action ? actionMinHeight : 0,
            scale: lifted ? pressedScale : 1,
            lighten: lifted ? pressedLighten : 0,
            contentOpacity: isLocked ? lockedOpacity : 1,
            isActive: !isLocked,
            haloWidth: isFeatured ? haloWidth : 0,
            haloOpacity: isFeatured ? haloOpacity : 0
        )
    }

    /// N enfants rendent N − 1 filets ; zéro ou un enfant n'en rend aucun.
    public static func dividerCount(children: Int) -> Int {
        max(children - 1, 0)
    }

    /// L'en-tête n'existe que s'il porte un sur-titre ou un accessoire : sinon,
    /// aucune marge.
    public static func showsHeader(hasOverline: Bool, hasAccessory: Bool) -> Bool {
        hasOverline || hasAccessory
    }

    private static func cornerRadius(surface: MeeshyGroupCardSurface, layout: MeeshyGroupCardLayout) -> Double {
        if surface == .glass { return mediaRadius }
        return layout == .action ? actionRadius : pageRadius
    }

    private static func borderWidth(_ surface: MeeshyGroupCardSurface) -> Double {
        switch surface {
        case .dashed: return 1.5
        case .solid: return 0
        default: return 1
        }
    }

    private static func borderOpacity(_ surface: MeeshyGroupCardSurface) -> Double {
        switch surface {
        case .accent: return 0.30
        case .danger: return 0.34
        default: return 1
        }
    }

    private static func washOpacity(_ surface: MeeshyGroupCardSurface) -> Double {
        switch surface {
        case .accent: return 0.22
        case .danger: return 0.08
        default: return 0
        }
    }
}
