import SwiftUI

/// La tenue d'un bouton rond de verre. `warning` (l'ambre de la pause
/// automatique) n'est pas une tenue : il passe par `ink`.
public nonisolated enum MeeshyGlassButtonKind: String, Sendable, Equatable, CaseIterable {
    case normal
    case active
    case destructive
    case soft
}

/// Les quatre diamètres de la planche. La cible tactile occupe au moins
/// `MeeshyControlSize.tapTarget`, quel que soit le diamètre dessiné.
public nonisolated enum MeeshyGlassButtonSize: String, Sendable, Equatable, CaseIterable {
    case small
    case compact
    case regular
    case large

    public var diameter: Double {
        switch self {
        case .small: return 36
        case .compact: return 40
        case .regular: return 44
        case .large: return 48
        }
    }
}

/// Le retour haptique d'une activation. `none` quand l'hôte joue le sien.
public nonisolated enum MeeshyGlassButtonHaptic: String, Sendable, Equatable, CaseIterable {
    case none
    case light
    case medium
}

/// Ce que K02 peint lui-même : les fonds pleins. Le verre, lui, vient de K01.
public nonisolated enum MeeshyGlassButtonFill: String, Sendable, Equatable, CaseIterable {
    case clear
    case white
    case red
    case veil
}

/// L'encre du glyphe : celle de la tenue, ou celle que l'hôte impose.
public nonisolated enum MeeshyGlassButtonInk: Sendable, Equatable {
    case onMedia
    case onSolid
    case custom(Color)
}

public nonisolated struct MeeshyGlassButtonShadow: Sendable, Equatable {
    public let opacity: Double
    public let radius: Double
    public let y: Double
}

/// La recette d'un bouton rond en VALEURS : un `View` ne s'inspecte pas, sa
/// recette si. Toute valeur chiffrée du bouton vit ici, nulle part ailleurs.
public nonisolated struct MeeshyGlassButtonRecipe: Equatable, Sendable {
    public let kind: MeeshyGlassButtonKind
    public let size: MeeshyGlassButtonSize
    public let diameter: Double
    public let glyphSize: Double
    public let targetSide: Double
    public let fill: MeeshyGlassButtonFill
    public let fillOpacity: Double
    public let pressedFillOpacity: Double
    /// Sous le Liquid Glass du système, le voile doux n'existe pas : le verre
    /// du système fait le fond.
    public let fillsUnderLiquid: Bool
    public let ink: MeeshyGlassButtonInk
    public let shadow: MeeshyGlassButtonShadow?
    public let opacity: Double
    public let isActionEnabled: Bool
    public let showsBusyIndicator: Bool

    /// Désactivé ou occupé : ni réponse au toucher, ni haptique, ni action.
    public var respondsToTouch: Bool { isActionEnabled }
    public var playsHaptic: Bool { isActionEnabled }

    public static let glyphRatio = 0.46
    public static let disabledOpacity = 0.4
    public static let longPressDuration = 0.5
    public static let longPressMaxMovement = 10.0
    public static let toneFadeDuration = MeeshyGlassRecipe.toneFadeDuration

    public static func resolve(
        kind: MeeshyGlassButtonKind,
        size: MeeshyGlassButtonSize,
        ink: Color? = nil,
        isEnabled: Bool = true,
        isBusy: Bool = false
    ) -> MeeshyGlassButtonRecipe {
        let appearance = appearance(of: kind)
        return MeeshyGlassButtonRecipe(
            kind: kind,
            size: size,
            diameter: size.diameter,
            glyphSize: (size.diameter * glyphRatio).rounded(),
            targetSide: max(size.diameter, Double(MeeshyControlSize.tapTarget)),
            fill: appearance.fill,
            fillOpacity: appearance.fillOpacity,
            pressedFillOpacity: appearance.pressedFillOpacity,
            fillsUnderLiquid: kind != .soft,
            ink: kind == .active ? .onSolid : ink.map(MeeshyGlassButtonInk.custom) ?? .onMedia,
            shadow: kind == .active ? Self.activeShadow : nil,
            opacity: isEnabled ? 1 : disabledOpacity,
            isActionEnabled: isEnabled && !isBusy,
            showsBusyIndicator: isBusy
        )
    }

    private static let activeShadow = MeeshyGlassButtonShadow(opacity: 0.22, radius: 14, y: 4)

    private static func appearance(of kind: MeeshyGlassButtonKind) -> (fill: MeeshyGlassButtonFill, fillOpacity: Double, pressedFillOpacity: Double) {
        switch kind {
        case .normal: return (.clear, 0, 0)
        case .active: return (.white, 0.94, 0.94)
        case .destructive: return (.red, 0.94, 0.94)
        case .soft: return (.veil, 0.12, 0.22)
        }
    }

    public func fillOpacity(isPressed: Bool) -> Double {
        isPressed ? pressedFillOpacity : fillOpacity
    }
}

// MARK: - Ce que le lecteur d'écran entend

/// L'état que le bouton expose au lecteur d'écran. `isOn` fait une bascule ;
/// sans lui, une tenue active s'annonce « sélectionné » (le trait système
/// parle la langue du lecteur, aucune chaîne n'est à traduire ici).
public nonisolated struct MeeshyGlassButtonAccessibilityState: Equatable, Sendable {
    public let isToggle: Bool
    public let isSelected: Bool

    public static func resolve(kind: MeeshyGlassButtonKind, isOn: Bool?) -> MeeshyGlassButtonAccessibilityState {
        guard let isOn else {
            return MeeshyGlassButtonAccessibilityState(isToggle: false, isSelected: kind == .active)
        }
        return MeeshyGlassButtonAccessibilityState(isToggle: true, isSelected: isOn)
    }
}

// MARK: - Jetons

public nonisolated extension MeeshyGlassButtonRecipe {
    var fillColor: Color {
        switch fill {
        case .clear: return .clear
        case .white, .veil: return MeeshyColors.onMedia
        case .red: return MeeshyColors.errorStrong
        }
    }

    var inkColor: Color {
        switch ink {
        case .onMedia: return MeeshyColors.onMedia
        case .onSolid: return MeeshyColors.indigo950
        case .custom(let color): return color
        }
    }

    /// L'encre contre son fond plein à pleine opacité, quand le fond est plein.
    /// `nil` pour le normal et le doux : leur contraste est celui du ton de K01.
    var solidContrast: Double? {
        guard fill == .white || fill == .red else { return nil }
        return CanvasChromeScheme.contrastRatio(Double(inkColor.luminance), Double(fillColor.luminance))
    }
}
