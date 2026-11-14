import SwiftUI

/// La tenue d'un bouton rond de verre. L'ambre d'une pause automatique n'est pas
/// une tenue : il passe par `glyphTint`.
public nonisolated enum MeeshyGlassButtonKind: String, Sendable, Equatable, CaseIterable {
    case normal
    case active
    case destructive
    case soft
}

/// Les quatre diamètres de la planche. La cible tactile occupe au moins
/// `MeeshyControlSize.tapTarget`, quel que soit le diamètre dessiné.
public nonisolated enum MeeshyGlassButtonSize: String, Sendable, Equatable, CaseIterable {
    case s36
    case s40
    case s44
    case s48

    /// Le jeton `MeeshyControlSize.xLarge` (48) n'existe pas encore : il entre avec
    /// ses miroirs Android (`MeeshyScales`) et web (`size-12`), que garde
    /// `MeeshyScalesParityTest`.
    public static let extraLargeDiameter = 48.0

    public var diameter: Double {
        switch self {
        case .s36: return Double(MeeshyControlSize.regular)
        case .s40: return Double(MeeshyControlSize.large)
        case .s44: return Double(MeeshyControlSize.tapTarget)
        case .s48: return Self.extraLargeDiameter
        }
    }

    /// Le côté de la cible tactile : au moins `MeeshyControlSize.tapTarget`.
    public var targetSide: Double {
        max(diameter, Double(MeeshyControlSize.tapTarget))
    }

    /// Ce dont la cible déborde le disque, de chaque côté : l'encombrement reste le diamètre.
    public var hitSlack: CGFloat {
        CGFloat((targetSide - diameter) / 2)
    }

    /// Le glyphe, figé dans son disque (46 % du diamètre à un point près), par
    /// les jetons d'icône : le Dynamic Type ne le touche pas.
    public var glyphSize: Double {
        switch self {
        case .s36, .s40: return Double(MeeshyIconSize.lg)
        case .s44: return Double(MeeshyIconSize.xl)
        case .s48: return Double(MeeshyIconSize.xxl)
        }
    }
}

/// Le retour haptique d'une activation. `none` quand l'hôte joue le sien.
public nonisolated enum MeeshyGlassButtonHaptic: String, Sendable, Equatable, CaseIterable {
    case light
    case none
}

/// L'état que le bouton DIT à l'hôte et au lecteur d'écran. Vrai ⇒ la tenue
/// `active` quand l'hôte n'en force pas une autre.
public nonisolated enum MeeshyGlassButtonActivation: Sendable, Equatable {
    case none
    case toggle(Bool)
    case selected(Bool)
    case expanded(Bool)

    public var isOn: Bool {
        switch self {
        case .none: return false
        case .toggle(let on), .selected(let on), .expanded(let on): return on
        }
    }

    public var impliedKind: MeeshyGlassButtonKind {
        isOn ? .active : .normal
    }
}

/// Le fond plein que K02 peint lui-même. Le verre, lui, vient de K01.
public nonisolated enum MeeshyGlassButtonFill: String, Sendable, Equatable, CaseIterable {
    case clear
    case white
    case red
    case veil
    case themeInk
}

/// Ce que K02 demande à K01 : aucune matière, un verre interactif au ton de
/// l'hôte, ou ce verre teinté de rouge (le destructif sous Liquid Glass).
public nonisolated enum MeeshyGlassButtonGlassRequest: String, Sendable, Equatable, CaseIterable {
    case none
    case neutral
    case red
}

/// L'encre du glyphe : celle de la tenue, celle du thème, ou celle que l'hôte impose.
public nonisolated enum MeeshyGlassButtonInk: Sendable, Equatable {
    case onMedia
    case onSolid
    case themeInk
    case themeInverse
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
    /// L'opacité du fond plein, appui et survol compris.
    public let fillOpacity: Double
    /// Le voile d'appui blanc, là où K01 ne pose pas de matière (fonds pleins,
    /// bouton emboîté). Il part au toucher, sans animation.
    public let pressVeilOpacity: Double
    public let glass: MeeshyGlassButtonGlassRequest
    public let ink: MeeshyGlassButtonInk
    public let shadow: MeeshyGlassButtonShadow?
    public let opacity: Double
    public let isActionEnabled: Bool

    /// Désactivé : ni réponse au toucher, ni haptique, ni action.
    public var respondsToTouch: Bool { isActionEnabled }
    public var playsHaptic: Bool { isActionEnabled }

    public static let disabledOpacity = 0.4
    public static let restFillOpacity = 0.94
    public static let pressedActiveFillOpacity = 0.78
    public static let hoveredActiveFillOpacity = 0.86
    public static let softRestOpacity = 0.12
    public static let softPressedOpacity = 0.22
    public static let softHoveredOpacity = 0.17
    public static let pressVeilPressedOpacity = 0.22
    public static let pressVeilHoveredOpacity = 0.11
    public static let longPressDuration = 0.5
    public static let longPressMaxMovement = 10.0
    public static let toneFadeDuration = MeeshyGlassRecipe.toneFadeDuration

    /// Le flou de l'ombre de l'actif sur la planche (`0 4px 14px`). Le rayon
    /// d'une ombre SwiftUI en est la moitié, comme pour le verre de K01 (28 → 14).
    public static let activeShadowBlur = 14.0
    private static let activeShadow = MeeshyGlassButtonShadow(opacity: 0.22, radius: activeShadowBlur / 2, y: 4)

    /// `tone` est le ton EFFECTIF (celui de l'hôte quand le bouton n'en pose pas).
    /// `isNested` : le bouton est posé dans un verre dessiné du kit ; sans effet
    /// sous le Liquid Glass.
    public static func resolve(
        kind: MeeshyGlassButtonKind,
        size: MeeshyGlassButtonSize,
        tone: MeeshyGlassTone = .deep,
        material: MeeshyGlassMaterial = .drawn,
        isNested: Bool = false,
        isPressed: Bool = false,
        isHovered: Bool = false,
        isEnabled: Bool = true,
        glyphTint: Color? = nil
    ) -> MeeshyGlassButtonRecipe {
        let liquid = material == .liquid
        let pressed = isPressed && isEnabled
        let hovered = isHovered && isEnabled && !pressed
        let glass = glassRequest(kind: kind, liquid: liquid)
        let drawsOwnResponse = !liquid && (glass == .none || isNested)
        return MeeshyGlassButtonRecipe(
            kind: kind,
            size: size,
            diameter: size.diameter,
            glyphSize: size.glyphSize,
            targetSide: size.targetSide,
            fill: solidFill(kind: kind, tone: tone, liquid: liquid),
            fillOpacity: fillOpacity(kind: kind, liquid: liquid, pressed: pressed, hovered: hovered),
            pressVeilOpacity: pressVeilOpacity(
                kind: kind, drawsOwnResponse: drawsOwnResponse, pressed: pressed, hovered: hovered
            ),
            glass: glass,
            ink: ink(kind: kind, tone: tone, glyphTint: glyphTint),
            shadow: kind == .active ? activeShadow : nil,
            opacity: isEnabled ? 1 : disabledOpacity,
            isActionEnabled: isEnabled
        )
    }

    private static func solidFill(kind: MeeshyGlassButtonKind, tone: MeeshyGlassTone, liquid: Bool) -> MeeshyGlassButtonFill {
        switch kind {
        case .normal: return .clear
        case .active: return tone == .theme ? .themeInk : .white
        case .destructive: return liquid ? .clear : .red
        case .soft: return liquid ? .clear : .veil
        }
    }

    private static func glassRequest(kind: MeeshyGlassButtonKind, liquid: Bool) -> MeeshyGlassButtonGlassRequest {
        switch kind {
        case .normal: return .neutral
        case .active: return liquid ? .neutral : .none
        case .destructive: return liquid ? .red : .none
        case .soft: return liquid ? .neutral : .none
        }
    }

    private static func fillOpacity(kind: MeeshyGlassButtonKind, liquid: Bool, pressed: Bool, hovered: Bool) -> Double {
        switch kind {
        case .normal: return 0
        case .destructive: return liquid ? 0 : restFillOpacity
        case .active:
            guard !liquid else { return restFillOpacity }
            return pressed ? pressedActiveFillOpacity : hovered ? hoveredActiveFillOpacity : restFillOpacity
        case .soft:
            guard !liquid else { return 0 }
            return pressed ? softPressedOpacity : hovered ? softHoveredOpacity : softRestOpacity
        }
    }

    private static func pressVeilOpacity(
        kind: MeeshyGlassButtonKind, drawsOwnResponse: Bool, pressed: Bool, hovered: Bool
    ) -> Double {
        guard drawsOwnResponse, kind != .active, kind != .soft else { return 0 }
        return pressed ? pressVeilPressedOpacity : hovered ? pressVeilHoveredOpacity : 0
    }

    private static func ink(kind: MeeshyGlassButtonKind, tone: MeeshyGlassTone, glyphTint: Color?) -> MeeshyGlassButtonInk {
        switch kind {
        case .active: return tone == .theme ? .themeInverse : .onSolid
        case .destructive: return .onMedia
        case .normal, .soft:
            if let glyphTint { return .custom(glyphTint) }
            return tone == .theme ? .themeInk : .onMedia
        }
    }
}

// MARK: - Ce que le lecteur d'écran entend

/// L'état que le bouton expose au lecteur d'écran : une bascule dit « Activé »
/// ou « Désactivé » ; une option sélectionnée se dit « sélectionné » (le trait
/// système parle la langue du lecteur) ; un bouton déplié change de nom chez
/// l'hôte, sans état de plus.
public nonisolated struct MeeshyGlassButtonAccessibilityState: Equatable, Sendable {
    public let isToggle: Bool
    public let isSelected: Bool
    public let toggleIsOn: Bool?

    public static func resolve(activation: MeeshyGlassButtonActivation) -> MeeshyGlassButtonAccessibilityState {
        switch activation {
        case .none, .expanded:
            return MeeshyGlassButtonAccessibilityState(isToggle: false, isSelected: false, toggleIsOn: nil)
        case .toggle(let on):
            return MeeshyGlassButtonAccessibilityState(isToggle: true, isSelected: false, toggleIsOn: on)
        case .selected(let on):
            return MeeshyGlassButtonAccessibilityState(isToggle: false, isSelected: on, toggleIsOn: nil)
        }
    }

    /// Le nom de l'action d'appui long : celui que l'hôte donne, sinon le nom du
    /// bouton. Un appui long existe toujours aussi en action nommée.
    public static func longPressActionName(longPressLabel: String?, label: String) -> String {
        guard let longPressLabel, !longPressLabel.isEmpty else { return label }
        return longPressLabel
    }

    /// La valeur dite : le mot de la bascule, puis ce que le contrôle porte déjà
    /// (« Activé, AirPods »).
    public static func composeValue(toggleWord: String?, value: String?) -> String {
        [toggleWord, value]
            .compactMap { $0 }
            .filter { !$0.isEmpty }
            .joined(separator: ", ")
    }
}

// MARK: - Jetons

public nonisolated extension MeeshyGlassButtonRecipe {
    func fillColor(isDark: Bool) -> Color {
        switch fill {
        case .clear: return .clear
        case .white, .veil: return MeeshyColors.onMedia
        case .red: return MeeshyColors.errorStrong
        case .themeInk: return MeeshyColors.textPrimary(isDark: isDark)
        }
    }

    /// Le glyphe garde sa taille quel que soit le Dynamic Type : il est figé
    /// dans son disque, la cible et le Large Content Viewer portent le reste.
    var glyphFont: Font {
        Font.system(size: CGFloat(glyphSize), weight: .semibold)
    }

    func inkColor(isDark: Bool) -> Color {
        switch ink {
        case .onMedia: return MeeshyColors.onMedia
        case .onSolid: return MeeshyColors.indigo950
        case .themeInk: return MeeshyColors.textPrimary(isDark: isDark)
        case .themeInverse: return MeeshyColors.backgroundPrimary(isDark: isDark)
        case .custom(let color): return color
        }
    }

    /// L'encre contre son fond plein à pleine opacité, quand le fond est plein.
    /// `nil` pour le normal et le doux : leur contraste est celui du ton de K01.
    func solidContrast(isDark: Bool) -> Double? {
        guard fill == .white || fill == .red || fill == .themeInk else { return nil }
        return CanvasChromeScheme.contrastRatio(
            Double(inkColor(isDark: isDark).luminance), Double(fillColor(isDark: isDark).luminance)
        )
    }
}
