import SwiftUI

public nonisolated enum MeeshyAvatarGroupLayout: Sendable, Equatable {
    case stack
    case duo
    case rail
    case grid(columns: Int)
}

/// Le diamètre remis à la cellule de l'hôte, en points.
public nonisolated enum MeeshyAvatarGroupSize: Int, Sendable, Equatable, CaseIterable {
    case s26 = 26
    case s40 = 40
    case s44 = 44
    case s56 = 56
    case s72 = 72
}

/// Des RANGS, jamais des identifiants : l'hôte sait ce que le rang désigne.
public nonisolated enum MeeshyAvatarGroupSelection: Sendable, Equatable {
    case none
    case single(Int?)
    case multiple(Set<Int>)
}

/// La loi de sélection par rang : une cellule éteinte sort de l'ordre de sélection ;
/// en unique, retoucher la cellule choisie la garde.
public nonisolated enum MeeshyAvatarGroupSelectionLaw {
    public static func apply(_ selection: MeeshyAvatarGroupSelection,
                             tapped index: Int,
                             isEnabled: ((Int) -> Bool)?) -> MeeshyAvatarGroupSelection {
        if let isEnabled, !isEnabled(index) { return selection }
        switch selection {
        case .none: return .none
        case .single: return .single(index)
        case .multiple(let chosen):
            return .multiple(chosen.contains(index) ? chosen.subtracting([index]) : chosen.union([index]))
        }
    }
}

/// **La recette de K48 en VALEURS** : combien de cellules se voient, ce que dit le
/// « +N », le détourage et le chevauchement par taille.
public nonisolated struct MeeshyAvatarGroupRecipe: Sendable, Equatable {

    public static let disabledOpacity: Double = 0.4
    public static let stackMaxRange = 2...5
    public static let gridRows = 2
    public static let railColumnWidth: Double = 62
    public static let railSpacing: Double = 10
    public static let overflowCeiling = 99

    public let effectiveLayout: MeeshyAvatarGroupLayout
    public let visibleCount: Int
    public let overflowCount: Int
    public let columns: Int
    public let rendersNothing: Bool

    /// « +N » : N = le reste, jamais « +0 », « 99+ » au-delà de 99.
    public var overflowText: String? {
        guard overflowCount > 0 else { return nil }
        return overflowCount > Self.overflowCeiling ? "\(Self.overflowCeiling)+" : "+\(overflowCount)"
    }

    public static func resolve(layout: MeeshyAvatarGroupLayout,
                               size: MeeshyAvatarGroupSize,
                               count: Int,
                               max requestedMax: Int) -> MeeshyAvatarGroupRecipe {
        let total = Swift.max(count, 0)
        let effective: MeeshyAvatarGroupLayout = layout == .duo && total != 2 ? .stack : layout
        let visible = visibleCount(layout: effective, total: total, requestedMax: requestedMax)
        return MeeshyAvatarGroupRecipe(
            effectiveLayout: effective,
            visibleCount: visible,
            overflowCount: total - visible,
            columns: columnCount(of: effective),
            rendersNothing: total == 0
        )
    }

    private static func visibleCount(layout: MeeshyAvatarGroupLayout, total: Int, requestedMax: Int) -> Int {
        switch layout {
        case .rail, .duo:
            return total
        case .stack:
            let limit = Swift.min(Swift.max(requestedMax, stackMaxRange.lowerBound), stackMaxRange.upperBound)
            return Swift.min(total, limit)
        case .grid(let columns):
            let capacity = columnCount(of: .grid(columns: columns)) * gridRows
            guard total > capacity else { return total }
            return Swift.min(Swift.max(requestedMax, 1), capacity - 1)
        }
    }

    private static func columnCount(of layout: MeeshyAvatarGroupLayout) -> Int {
        guard case .grid(let columns) = layout else { return 0 }
        return Swift.min(Swift.max(columns, 2), 4)
    }

    public static func ringWidth(_ size: MeeshyAvatarGroupSize) -> Double {
        switch size {
        case .s26: return 2
        case .s40, .s44: return 3
        case .s56: return 3.5
        case .s72: return 4
        }
    }

    public static func overlap(_ size: MeeshyAvatarGroupSize) -> Double {
        switch size {
        case .s26: return 10
        case .s40: return 9
        case .s44: return 10
        case .s56: return 13
        case .s72: return 17
        }
    }

    /// Ce que dit le groupe : le libellé de l'hôte, sinon son résumé.
    public static func spokenLabel(label: String?, summary: String?) -> String? {
        if let label, !label.isEmpty { return label }
        if let summary, !summary.isEmpty { return summary }
        return nil
    }

    /// La fusion du duo respire ; arrêtée sous mouvement réduit.
    public static func breathAnimation(reduce: Bool) -> Animation? {
        reduce ? nil : .easeInOut(duration: 3).repeatForever(autoreverses: true)
    }
}
