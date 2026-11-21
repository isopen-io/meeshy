import SwiftUI

public nonisolated enum MeeshyMediaTileKind: String, Sendable, Equatable, CaseIterable {
    case media
    case text
    case ghost
    case skeleton
}

public nonisolated enum MeeshyMediaGridLayout: String, Sendable, Equatable, CaseIterable {
    case regular
    case masonry
    case row
}

public nonisolated enum MeeshyMediaTileShape: String, Sendable, Equatable, CaseIterable {
    case square
    case tall
    case free
}

public nonisolated enum MeeshyMediaGridSpacing: String, Sendable, Equatable, CaseIterable {
    case tight
    case regular
}

/// La pastille d'un coin : un glyphe et une valeur (« 0:24 », « 4 »), rendue par K41.
public nonisolated struct MeeshyMediaTileBadge: Equatable {
    public let systemImage: String
    public let value: String?

    public init(systemImage: String, value: String? = nil) {
        self.systemImage = systemImage
        self.value = value
    }
}

/// Un élément opaque : un identifiant stable (clé de recyclage), des textes déjà
/// traduits, un rapport de forme. Aucune publication, aucun réel, aucune story.
public nonisolated struct MeeshyMediaGridItem: Identifiable, Equatable {
    public let id: String
    public let kind: MeeshyMediaTileKind
    public let label: String
    public let aspect: Double?
    public let badge: MeeshyMediaTileBadge?
    public let caption: String?
    public let overline: String?
    public let text: String?
    public let tint: Color?

    public init(id: String,
                kind: MeeshyMediaTileKind,
                label: String,
                aspect: Double? = nil,
                badge: MeeshyMediaTileBadge? = nil,
                caption: String? = nil,
                overline: String? = nil,
                text: String? = nil,
                tint: Color? = nil) {
        self.id = id
        self.kind = kind
        self.label = label
        self.aspect = aspect
        self.badge = badge
        self.caption = caption
        self.overline = overline
        self.text = text
        self.tint = tint
    }
}

/// **La loi de placement de la maçonnerie** : chaque tuile va dans la colonne la
/// plus courte, à égalité la première. L'ordre de l'hôte est gardé dans chaque colonne.
public nonisolated enum MeeshyMediaGridPlacement {

    public static func columns(aspects: [Double], count: Int, spacing: Double, width: Double) -> [[Int]] {
        let columnCount = MeeshyMediaGridRecipe.columns(count)
        let tileWidth = columnWidth(columns: columnCount, spacing: spacing, width: width)
        var placed = Array(repeating: [Int](), count: columnCount)
        var heights = Array(repeating: 0.0, count: columnCount)
        for (index, aspect) in aspects.enumerated() {
            let ratio = MeeshyMediaGridRecipe.clampedAspect(aspect)
            let shortest = heights.indices.min { heights[$0] < heights[$1] || (heights[$0] == heights[$1] && $0 < $1) } ?? 0
            placed[shortest].append(index)
            heights[shortest] += (tileWidth > 0 ? tileWidth : 1) / ratio + spacing
        }
        return placed
    }

    public static func columnWidth(columns: Int, spacing: Double, width: Double) -> Double {
        guard width > 0 else { return 0 }
        let count = Double(MeeshyMediaGridRecipe.columns(columns))
        return max((width - spacing * (count - 1)) / count, 0)
    }
}

/// **La recette de K49 en VALEURS** : colonnes, écart, rapport des tuiles, rayon,
/// appui, ouverture. La grille montre, elle ne range rien : aucune coche, aucun « + ».
public nonisolated struct MeeshyMediaGridRecipe: Sendable, Equatable {

    public static let cornerRadius: Double = 18
    public static let borderWidth: Double = 1
    public static let pressedScale: Double = 0.97
    public static let wideSpacing: Double = 14
    public static let wideThreshold: Double = 700
    public static let textMinimumHeight: Double = 150
    public static let captionMaxLines = 3
    public static let aspectRange: ClosedRange<Double> = 0.5...2
    public static let reachEndRows = 2

    public let columns: Int
    public let cornerRadius: Double
    public let borderWidth: Double
    public let isOpenable: Bool
    public let isRecycled: Bool
    public let pressScale: Double

    public static func columns(_ requested: Int) -> Int {
        min(max(requested, 2), 3)
    }

    public static func spacingValue(_ spacing: MeeshyMediaGridSpacing, width: Double) -> Double {
        if width > wideThreshold { return wideSpacing }
        return spacing == .tight ? 6 : 8
    }

    public static func clampedAspect(_ aspect: Double?) -> Double {
        guard let aspect, aspect.isFinite, aspect > 0 else { return 1 }
        return min(max(aspect, aspectRange.lowerBound), aspectRange.upperBound)
    }

    public static func aspectRatio(shape: MeeshyMediaTileShape, aspect: Double?) -> Double {
        switch shape {
        case .square: return 1
        case .tall: return 2.0 / 3.0
        case .free: return clampedAspect(aspect)
        }
    }

    public static func visibleItems(_ items: [MeeshyMediaGridItem], layout: MeeshyMediaGridLayout, columns: Int) -> [MeeshyMediaGridItem] {
        layout == .row ? Array(items.prefix(self.columns(columns))) : items
    }

    /// La dernière ligne approche : l'hôte charge la suite, une fois par ligne atteinte.
    public static func shouldReachEnd(index: Int, count: Int, columns: Int) -> Bool {
        let rows = reachEndRows * self.columns(columns)
        return count > 0 && index >= count - rows
    }

    /// La demande de suite, UNE par page : rend le compte à retenir quand la suite
    /// est à demander, rien si elle l'a déjà été pour ce compte. Une page qui ne
    /// vient pas ne se redemande pas au défilement : la reprise est à l'hôte.
    public static func reachEndRequest(index: Int, count: Int, columns: Int, lastRequestedCount: Int?) -> Int? {
        guard lastRequestedCount != count, shouldReachEnd(index: index, count: count, columns: columns) else { return nil }
        return count
    }

    public static func resolve(layout: MeeshyMediaGridLayout,
                               shape: MeeshyMediaTileShape,
                               columns: Int,
                               spacing: MeeshyMediaGridSpacing,
                               kind: MeeshyMediaTileKind,
                               isPressed: Bool,
                               reduceMotion: Bool) -> MeeshyMediaGridRecipe {
        let openable = kind == .media || kind == .text
        return MeeshyMediaGridRecipe(
            columns: self.columns(columns),
            cornerRadius: cornerRadius,
            borderWidth: borderWidth,
            isOpenable: openable,
            isRecycled: layout != .row,
            pressScale: isPressed && openable && !reduceMotion ? pressedScale : 1
        )
    }
}
