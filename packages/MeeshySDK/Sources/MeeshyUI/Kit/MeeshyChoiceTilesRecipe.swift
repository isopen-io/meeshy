import SwiftUI

/// Ce que la tête de la tuile porte : un médaillon, un chiffre et son unité, ou un disque à glyphe.
public nonisolated enum MeeshyChoiceContent: String, Sendable, Equatable, CaseIterable {
    case option
    case value
    case icon
}

public nonisolated enum MeeshyChoiceFormat: String, Sendable, Equatable, CaseIterable {
    case square
    case wide
    case compact
}

/// `glass` prend le verre de K01 ; `tonal` est l'aplat d'un fond.
public nonisolated enum MeeshyChoiceSurface: String, Sendable, Equatable, CaseIterable {
    case tonal
    case glass
}

public nonisolated enum MeeshyChoiceItemState: Sendable, Equatable {
    case enabled
    case disabled
    case locked(key: String)
}

public nonisolated enum MeeshyChoiceSelection: Sendable, Equatable {
    case single(String?)
    case multiple(Set<String>)
}

/// Une option opaque : des textes déjà traduits, un glyphe, une teinte. Aucun lien,
/// aucune durée, aucun cercle : l'hôte passe des identifiants.
public struct MeeshyChoiceItem: Identifiable, Equatable {
    public let id: String
    public let title: String
    public let detail: String?
    public let value: String?
    public let unit: String?
    public let systemImage: String?
    public let tint: Color?
    public let state: MeeshyChoiceItemState
    public let spansRow: Bool

    public init(id: String,
                title: String,
                detail: String? = nil,
                value: String? = nil,
                unit: String? = nil,
                systemImage: String? = nil,
                tint: Color? = nil,
                state: MeeshyChoiceItemState = .enabled,
                spansRow: Bool = false) {
        self.id = id
        self.title = title
        self.detail = detail
        self.value = value
        self.unit = unit
        self.systemImage = systemImage
        self.tint = tint
        self.state = state
        self.spansRow = spansRow
    }
}

/// Ce qui suit un toucher : l'identifiant à rendre à l'hôte, le verrou à ouvrir, ou rien.
public nonisolated enum MeeshyChoiceOutcome: Sendable, Equatable {
    case select(String)
    case deselect(String)
    case locked(String)
    case ignored
}

/// **La recette de K47 en VALEURS** et sa loi de sélection : l'hôte tient la
/// sélection et la reçoit en retour ; la tuile n'en garde rien.
public nonisolated struct MeeshyChoiceTilesRecipe: Sendable, Equatable {

    public static let disabledOpacity: Double = 0.4
    public static let valueBaseFontSize: Double = 40
    public static let denseValueFontSize: Double = 30
    public static let borderWidth: Double = 1.5
    public static let cornerRadius: Double = 20
    public static let spacing: Double = 10

    public let isSelected: Bool
    public let isInteractive: Bool
    public let isLocked: Bool
    public let opacity: Double
    public let usesGlass: Bool
    public let pressScale: Double
    public let valueSize: Double
    public let borderWidth: Double

    public static func columns(_ requested: Int) -> Int {
        min(max(requested, 2), 4)
    }

    public static func valueFontSize(columns: Int) -> Double {
        self.columns(columns) >= 4 ? denseValueFontSize : valueBaseFontSize
    }

    public static func format(for item: MeeshyChoiceItem, base: MeeshyChoiceFormat) -> MeeshyChoiceFormat {
        base == .square && item.spansRow ? .wide : base
    }

    /// Les rangées de la grille : une option qui prend toute la rangée (`spansRow`
    /// dans une grille carrée) a sa rangée ; les autres se rangent par colonnes.
    public static func rows(_ items: [MeeshyChoiceItem], columns: Int, base: MeeshyChoiceFormat) -> [[MeeshyChoiceItem]] {
        let width = self.columns(columns)
        var rows: [[MeeshyChoiceItem]] = []
        var current: [MeeshyChoiceItem] = []
        for item in items {
            if format(for: item, base: base) == .wide && base == .square {
                if !current.isEmpty { rows.append(current); current = [] }
                rows.append([item])
                continue
            }
            current.append(item)
            if current.count == width { rows.append(current); current = [] }
        }
        return current.isEmpty ? rows : rows + [current]
    }

    public static func isSelected(_ id: String, in selection: MeeshyChoiceSelection) -> Bool {
        switch selection {
        case .single(let chosen): return chosen == id
        case .multiple(let chosen): return chosen.contains(id)
        }
    }

    /// Une tuile libre passe en désactivée quand le plafond d'une sélection multiple est atteint.
    public static func isDisabled(_ item: MeeshyChoiceItem, selection: MeeshyChoiceSelection, maxSelected: Int?) -> Bool {
        if item.state == .disabled { return true }
        guard case .multiple(let chosen) = selection, let maxSelected else { return false }
        return !chosen.contains(item.id) && chosen.count >= maxSelected
    }

    public static func outcome(selection: MeeshyChoiceSelection,
                               tapped item: MeeshyChoiceItem,
                               allowsEmpty: Bool,
                               maxSelected: Int?) -> MeeshyChoiceOutcome {
        if case .locked = item.state { return .locked(item.id) }
        if isDisabled(item, selection: selection, maxSelected: maxSelected) { return .ignored }
        let chosen = isSelected(item.id, in: selection)
        switch selection {
        case .single: return chosen ? (allowsEmpty ? .deselect(item.id) : .ignored) : .select(item.id)
        case .multiple: return chosen ? .deselect(item.id) : .select(item.id)
        }
    }

    public static func countText(selection: MeeshyChoiceSelection, maxSelected: Int?, label: ((Int, Int) -> String)?) -> String? {
        guard case .multiple(let chosen) = selection, let label, let maxSelected else { return nil }
        return label(chosen.count, maxSelected)
    }

    public static func resolve(content: MeeshyChoiceContent,
                               format: MeeshyChoiceFormat,
                               surface: MeeshyChoiceSurface,
                               columns: Int,
                               isSelected: Bool,
                               isPressed: Bool,
                               state: MeeshyChoiceItemState) -> MeeshyChoiceTilesRecipe {
        let isDisabled = state == .disabled
        let isLocked: Bool = { if case .locked = state { return true } else { return false } }()
        return MeeshyChoiceTilesRecipe(
            isSelected: isSelected && !isDisabled,
            isInteractive: !isDisabled,
            isLocked: isLocked,
            opacity: isDisabled ? disabledOpacity : 1,
            usesGlass: surface == .glass,
            pressScale: isPressed && !isDisabled ? 0.97 : 1,
            valueSize: content == .value ? valueFontSize(columns: columns) : 0,
            borderWidth: borderWidth
        )
    }
}
