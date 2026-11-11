import SwiftUI

/// La variante d'une ligne : `destructive` (rouge, en dernier), `accent` (teinte de
/// mention ou accent de la conversation). La ligne ne choisit jamais son ton.
public nonisolated enum MeeshyToggleRowKind: String, Sendable, Equatable, CaseIterable {
    case normal
    case destructive
    case accent
}

/// L'accessoire de fin : ce que la ligne DIT de son état. `none` ne rend rien.
public nonisolated enum MeeshyToggleRowAccessory: Sendable, Equatable {
    case none
    case toggle(isOn: Bool)
    case check(isSelected: Bool)
    case checkbox(isChecked: Bool)
    case chevron
    case value(String)
}

/// Le retour haptique d'une action. `none` quand l'hôte joue le sien.
public nonisolated enum MeeshyToggleRowHaptic: String, Sendable, Equatable, CaseIterable {
    case light
    case none
}

/// Ce que l'accessibilité lit de l'accessoire, sans chaîne localisée.
public nonisolated enum MeeshyToggleRowValue: Sendable, Equatable {
    case none
    case toggle(isOn: Bool)
    case selected(Bool)
    case text(String)
}

/// La recette en valeurs d'une ligne : encres, voiles, filet et lecture de
/// l'accessibilité. Pure : elle ne lit ni environnement ni singleton, tout lui
/// est passé. Aucune couleur n'est écrite ici : elle vient des jetons.
public nonisolated struct MeeshyToggleRowRecipe: Sendable, Equatable {
    public static let rowMinimumHeight: CGFloat = 46
    public static let checkboxSide: CGFloat = 24
    public static let disabledOpacity: Double = 0.62
    public static let pressedVeilOpacity: Double = MeeshyOpacity.light
    public static let hoveredVeilOpacity: Double = MeeshyOpacity.subtle
    public static let fadeDuration: Double = 0.2

    public let minimumHeight: CGFloat
    public let contentOpacity: Double
    public let titleColor: Color
    public let subtitleColor: Color
    public let accessoryColor: Color
    public let trackOnColor: Color
    public let dividerColor: Color
    public let veilOpacity: Double
    public let veilColor: Color
    public let accessibilityValue: MeeshyToggleRowValue

    public static func resolve(
        accessory: MeeshyToggleRowAccessory,
        kind: MeeshyToggleRowKind,
        tone: MeeshyGlassTone?,
        isDark: Bool,
        isEnabled: Bool,
        isPressed: Bool,
        isHovered: Bool,
        tint: Color?
    ) -> MeeshyToggleRowRecipe {
        let isThemeInk = tone == .theme
        let baseInk = isThemeInk ? MeeshyColors.textPrimary(isDark: isDark) : MeeshyColors.onMedia
        let mutedInk = isThemeInk ? MeeshyColors.textSecondary(isDark: isDark) : MeeshyColors.onMediaMuted
        let titleColor = titleInk(kind: kind, base: baseInk, isThemeInk: isThemeInk, isDark: isDark, tint: tint)
        let trackOn = tint ?? MeeshyColors.brandPrimary
        let veilOpacity = veilOpacity(isEnabled: isEnabled, isPressed: isPressed, isHovered: isHovered)
        return MeeshyToggleRowRecipe(
            minimumHeight: rowMinimumHeight,
            contentOpacity: isEnabled ? 1 : disabledOpacity,
            titleColor: titleColor,
            subtitleColor: mutedInk,
            accessoryColor: isChosen(accessory) ? trackOn : mutedInk,
            trackOnColor: trackOn,
            dividerColor: baseInk.opacity(MeeshyOpacity.subtle),
            veilOpacity: veilOpacity,
            veilColor: titleColor.opacity(veilOpacity),
            accessibilityValue: valueFor(accessory: accessory)
        )
    }

    /// « Titre, sous-titre » : un sous-titre vide ou blanc n'existe pas pour le lecteur
    /// d'écran, et ne laisse aucune virgule orpheline.
    public static func accessibilityLabel(title: String, subtitle: String?) -> String {
        guard let subtitle = visibleSubtitle(subtitle) else { return title }
        return "\(title), \(subtitle)"
    }

    /// Le sous-titre tel qu'il se rend : absent s'il est vide ou blanc.
    public static func visibleSubtitle(_ subtitle: String?) -> String? {
        guard let trimmed = subtitle?.trimmingCharacters(in: .whitespacesAndNewlines), !trimmed.isEmpty else {
            return nil
        }
        return trimmed
    }

    /// Une coche ou une case cochée prend l'encre de la piste ; le reste est muet.
    public static func isChosen(_ accessory: MeeshyToggleRowAccessory) -> Bool {
        switch accessory {
        case .check(let isSelected): return isSelected
        case .checkbox(let isChecked): return isChecked
        case .toggle(let isOn): return isOn
        case .none, .chevron, .value: return false
        }
    }

    public static func valueFor(accessory: MeeshyToggleRowAccessory) -> MeeshyToggleRowValue {
        switch accessory {
        case .none, .chevron: return .none
        case .toggle(let isOn): return .toggle(isOn: isOn)
        case .check(let isSelected): return .selected(isSelected)
        case .checkbox(let isChecked): return .selected(isChecked)
        case .value(let text): return .text(text)
        }
    }

    private static func titleInk(kind: MeeshyToggleRowKind, base: Color, isThemeInk: Bool, isDark: Bool, tint: Color?) -> Color {
        switch kind {
        case .normal:
            return base
        case .destructive:
            return isThemeInk && !isDark ? MeeshyColors.errorInk : MeeshyColors.error
        case .accent:
            return tint ?? MeeshyColors.mentionColor(isDark: isDark)
        }
    }

    /// Une ligne désactivée n'a ni voile d'appui ni survol : elle ne répond pas.
    private static func veilOpacity(isEnabled: Bool, isPressed: Bool, isHovered: Bool) -> Double {
        guard isEnabled else { return 0 }
        if isPressed { return pressedVeilOpacity }
        if isHovered { return hoveredVeilOpacity }
        return 0
    }
}
