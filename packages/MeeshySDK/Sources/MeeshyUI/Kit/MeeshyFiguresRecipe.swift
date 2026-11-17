import Foundation

/// Les trois tailles du chiffre : héros (48), large par défaut (34), compact (24).
public nonisolated enum MeeshyFigureSize: String, Sendable, Equatable, CaseIterable {
    case hero
    case large
    case compact
}

/// La tendance d'un chiffre : un SENS (la flèche le dit, pas seulement la couleur)
/// et un texte déjà écrit par l'hôte.
public nonisolated enum MeeshyFigureTrend: Sendable, Equatable {
    case up(String)
    case down(String)
    case flat(String)

    public var text: String {
        switch self {
        case .up(let text), .down(let text), .flat(let text): return text
        }
    }

    public var arrowName: String {
        switch self {
        case .up: return "arrow.up.right"
        case .down: return "arrow.down.right"
        case .flat: return "arrow.right"
        }
    }
}

/// Un point de la mini-courbe, dans son cadre.
public nonisolated struct MeeshySparkPoint: Sendable, Equatable {
    public let x: Double
    public let y: Double
}

/// **La recette de K34 en VALEURS** : la police par taille, le nombre de filets
/// d'une bande, le passage en compact sous 360, l'échelle d'une courbe dans son
/// cadre, la jauge d'une rangée de part, les positions qui roulent, la phrase
/// dite. Aucune mise en forme de nombre : `value` arrive déjà écrit.
public nonisolated struct MeeshyFiguresRecipe: Sendable, Equatable {

    public static let unitFontSize: Double = 12.5
    public static let unitGap: Double = 2
    public static let minimumScale: Double = 0.6
    public static let trendHeight: Double = 20
    public static let trendArrow: Double = 12
    public static let separatorGap: Double = 16
    public static let tightBandWidth: Double = 360
    public static let sparkWidth: Double = 72
    public static let sparkHeight: Double = 28
    public static let sparkStroke: Double = 2
    public static let sparkAreaOpacity: Double = 0.14
    public static let sparkDot: Double = 6
    public static let sparkPadding: Double = 3
    public static let shareMinimumFill: Double = 4
    public static let shareRowLimit: Int = 4
    public static let shareBadge: Double = 38
    public static let shareGauge: Double = 8
    public static let emptyValue = "—"

    public let size: MeeshyFigureSize
    public let fontSize: Double
    public let separatorCount: Int
    public let separatorsAreHorizontal: Bool
    public let showsSkeleton: Bool
    public let isEmpty: Bool

    public static func resolve(
        size: MeeshyFigureSize,
        count: Int = 1,
        width: Double = 390,
        trend: MeeshyFigureTrend? = nil,
        isLoading: Bool = false,
        isEmpty: Bool = false,
        isStacked: Bool = false,
        hasValue: Bool = false
    ) -> MeeshyFiguresRecipe {
        let clamped = min(max(count, 1), 4)
        let resolved: MeeshyFigureSize = clamped == 4 && width < tightBandWidth ? .compact : size
        return MeeshyFiguresRecipe(
            size: resolved,
            fontSize: fontSize(for: resolved),
            separatorCount: clamped - 1,
            separatorsAreHorizontal: isStacked,
            showsSkeleton: isLoading && !hasValue,
            isEmpty: isEmpty
        )
    }

    public static func fontSize(for size: MeeshyFigureSize) -> Double {
        switch size {
        case .hero: return 48
        case .large: return 34
        case .compact: return 24
        }
    }

    /// La mini-courbe : au moins deux points, sinon rien. Les valeurs non finies
    /// valent le minimum ; une série constante se pose au milieu. Tout reste dans
    /// le cadre, marge du point final comprise.
    public static func sparkPoints(_ points: [Double], width: Double, height: Double) -> [MeeshySparkPoint] {
        guard points.count >= 2, width.isFinite, height.isFinite else { return [] }
        let finite = points.filter { $0.isFinite }
        let low = finite.min() ?? 0
        let high = finite.max() ?? 0
        let span = high - low
        let inner = max(height - sparkPadding * 2, 0)
        let last = Double(points.count - 1)
        return points.enumerated().map { index, raw in
            let value = raw.isFinite ? raw : low
            let share = span > 0 ? (value - low) / span : 0.5
            return MeeshySparkPoint(x: Double(index) / last * width, y: sparkPadding + (1 - share) * inner)
        }
    }

    /// La jauge d'une rangée de part : bornée de 0 à 1 ; une part qui existe ne
    /// descend jamais sous 4.
    public static func shareFill(share: Double, width: Double) -> Double {
        guard share.isFinite, share > 0, width.isFinite else { return 0 }
        return min(max(min(share, 1) * width, shareMinimumFill), width)
    }

    public static func visibleShareRows(_ count: Int) -> Int {
        min(max(count, 0), shareRowLimit)
    }

    /// Les positions des chiffres qui diffèrent, alignées par la fin ; seuls les
    /// chiffres roulent, jamais les espaces ni les signes. À la première
    /// apparition (`from` absent), rien ne roule.
    public static func changedPositions(from old: String?, to new: String) -> [Int] {
        guard let old else { return [] }
        let before = Array(old)
        let after = Array(new)
        return after.indices.filter { index in
            guard after[index].isNumber else { return false }
            let counterpart = before.count - (after.count - index)
            return counterpart < 0 || before[counterpart] != after[index]
        }
    }

    public static func displayedValue(_ value: String?) -> String {
        guard let value, !value.isEmpty else { return emptyValue }
        return value
    }

    /// La phrase dite : la valeur, puis l'unité ; sans valeur, le mot de l'hôte.
    public static func spoken(value: String?, unit: String, emptyLabel: String) -> String {
        let said = (value?.isEmpty ?? true) ? emptyLabel : (value ?? emptyLabel)
        return "\(said) \(unit)"
    }

    /// Une bande est UN élément : ses chiffres, dits d'un trait.
    public static func spokenBand(_ parts: [String]) -> String {
        parts.joined(separator: ", ")
    }
}
