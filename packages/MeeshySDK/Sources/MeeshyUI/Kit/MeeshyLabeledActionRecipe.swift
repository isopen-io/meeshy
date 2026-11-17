import Foundation

/// Les trois diamètres du disque d'une grille : 56 serré, 60 par défaut, 64 large.
public nonisolated enum MeeshyLabeledActionSize: Int, Sendable, Equatable, CaseIterable {
    case s56 = 56
    case s60 = 60
    case s64 = 64
}

/// Ce que la valeur dit : un compte (pilule pleine à l'accent) ou un avis (sourde).
public nonisolated enum MeeshyLabeledActionValueKind: String, Sendable, Equatable, CaseIterable {
    case accent
    case quiet
}

/// Les colonnes d'une grille : autant que la largeur en loge (jusqu'à `max` sur
/// téléphone), ou un nombre fixe.
public nonisolated enum MeeshyActionColumns: Sendable, Equatable {
    case adaptive(max: Int)
    case fixed(Int)
}

/// **La recette d'UNE action libellée (K32) en VALEURS** : le diamètre du disque,
/// le glyphe, la cible, le libellé et la valeur, et ce que disent les états.
///
/// Le disque lui-même est celui de K02 (`MeeshyGlassButtonFace`, dessiné à 48) :
/// K32 n'en dessine aucun. Les diamètres 56, 60 et 64 sont obtenus en mettant le
/// disque de K02 à l'échelle `faceScale` (diamètre / 48), sans toucher à K02.
public nonisolated struct MeeshyLabeledActionRecipe: Sendable, Equatable {

    public static let baseFaceDiameter: Double = 48
    public static let featuredDiameter: Double = 96
    public static let bandDiameter: Double = 56
    public static let minTargetWidth: Double = 76
    public static let minTargetHeight: Double = 88
    public static let labelFontSize: Double = 12
    public static let labelGap: Double = 9
    public static let valueHeight: Double = 20
    public static let valueGap: Double = 6
    public static let disabledOpacity: Double = 0.4
    public static let pendingGlyphOpacity: Double = 0.45

    public let kind: MeeshyGlassButtonKind
    public let diameter: Double
    public let glyphSize: Double
    public let faceScale: Double
    public let minTargetWidth: Double
    public let minTargetHeight: Double
    public let labelFontSize: Double
    public let labelGap: Double
    public let valueHeight: Double
    public let valueGap: Double
    public let opacity: Double
    public let glyphOpacity: Double
    public let showsRing: Bool
    public let isActionable: Bool
    public let isInDestructiveBand: Bool
    public let hasValue: Bool

    public static func resolve(
        kind: MeeshyGlassButtonKind = .normal,
        size: MeeshyLabeledActionSize = .s60,
        isPending: Bool = false,
        isFeatured: Bool = false,
        isEnabled: Bool = true,
        hasValue: Bool = false,
        textScale: Double = 1
    ) -> MeeshyLabeledActionRecipe {
        let inBand = kind == .destructive
        let diameter = isFeatured ? featuredDiameter : (inBand ? bandDiameter : Double(size.rawValue))
        return MeeshyLabeledActionRecipe(
            kind: kind,
            diameter: diameter,
            glyphSize: isFeatured ? 40 : glyphSize(forDiameter: diameter),
            faceScale: diameter / baseFaceDiameter,
            minTargetWidth: minTargetWidth,
            minTargetHeight: minTargetHeight,
            labelFontSize: labelFontSize,
            labelGap: labelGap,
            valueHeight: valueHeight,
            valueGap: valueGap,
            opacity: isEnabled ? 1 : disabledOpacity,
            glyphOpacity: isPending ? pendingGlyphOpacity : 1,
            showsRing: isPending,
            isActionable: isEnabled && !isPending,
            isInDestructiveBand: inBand,
            hasValue: hasValue
        )
    }

    /// Le glyphe : 26, 28 et 30 pour 56, 60 et 64 (46 % du disque, arrondi).
    public static func glyphSize(forDiameter diameter: Double) -> Double {
        switch diameter {
        case ..<58: return 26
        case ..<62: return 28
        default: return 30
        }
    }
}

/// **La recette de la GRILLE d'actions (K32) en VALEURS** : le nombre de colonnes,
/// leur largeur, la répartition en rangées (jamais une action seule sur la
/// dernière quand on peut l'éviter) et la taille du disque pour la largeur.
public nonisolated struct MeeshyActionGridRecipe: Sendable, Equatable {

    public static let minColumn: Double = 76
    public static let largeTextMinColumn: Double = 104
    public static let largeTextScale: Double = 1.6
    public static let columnGap: Double = 8
    public static let rowGap: Double = 18
    public static let phoneMaxColumns = 4
    public static let wideWidth: Double = 560
    public static let tightWidth: Double = 360

    public let columns: Int
    public let columnWidth: Double
    public let minColumn: Double
    public let rows: [Int]
    public let size: MeeshyLabeledActionSize

    public static func resolve(
        width: Double,
        count: Int,
        columns: MeeshyActionColumns = .adaptive(max: phoneMaxColumns),
        textScale: Double = 1
    ) -> MeeshyActionGridRecipe {
        let safeWidth = width.isFinite ? max(width, 0) : 0
        let safeCount = max(count, 0)
        let minimum = textScale >= largeTextScale ? largeTextMinColumn : minColumn
        let fit = max(Int((safeWidth + columnGap) / (minimum + columnGap)), 1)
        let used: Int
        switch columns {
        case .fixed(let number):
            used = max(number, 1)
        case .adaptive(let limit):
            let cap = safeWidth >= wideWidth ? max(safeCount, 1) : max(limit, 1)
            used = max(min(fit, cap), 1)
        }
        let gaps = columnGap * Double(used - 1)
        return MeeshyActionGridRecipe(
            columns: used,
            columnWidth: (safeWidth - gaps) / Double(used),
            minColumn: minimum,
            rows: distribute(count: safeCount, columns: used),
            size: autoSize(width: safeWidth)
        )
    }

    /// La taille du disque pour la largeur : 56 sous 360, 60 en dessous de 560, 64 au-delà.
    public static func autoSize(width: Double) -> MeeshyLabeledActionSize {
        if width < tightWidth { return .s56 }
        return width < wideWidth ? .s60 : .s64
    }

    /// Les rangées : remplies de gauche à droite, sauf si la dernière n'aurait
    /// qu'une action — alors le compte se répartit au plus égal, la rangée courte
    /// en dernier.
    public static func distribute(count: Int, columns: Int) -> [Int] {
        guard count > 0, columns > 0 else { return [] }
        let rowCount = (count + columns - 1) / columns
        if count > 1 && count % columns == 1 {
            let quotient = count / rowCount
            let remainder = count % rowCount
            return (0..<rowCount).map { $0 < remainder ? quotient + 1 : quotient }
        }
        return (0..<rowCount).map { index in
            index < rowCount - 1 ? columns : count - columns * (rowCount - 1)
        }
    }
}
