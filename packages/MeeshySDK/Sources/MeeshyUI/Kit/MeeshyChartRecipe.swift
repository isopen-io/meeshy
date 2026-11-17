import SwiftUI

public nonisolated enum MeeshyChartKind: String, Sendable, Equatable, CaseIterable {
    case bars
    case line
    case donut
    case funnel
    case breakdown
    case strip
    case bubbles
}

/// La hauteur de tracé : 96, 128 ou 220.
public nonisolated enum MeeshyChartSize: String, Sendable, Equatable, CaseIterable {
    case compact
    case regular
    case large

    public var height: Double {
        switch self {
        case .compact: return 96
        case .regular: return 128
        case .large: return 220
        }
    }
}

/// Ce que le graphique nomme : le pic, aujourd'hui (le dernier point), une période, des repères d'axe.
public nonisolated enum MeeshyChartMarker: Sendable, Equatable {
    case peak
    case today
    case band(from: String, to: String)
    case ticks([Double])
}

public nonisolated enum MeeshyChartLayout: Sendable, Equatable {
    case stacked
    case inline
}

/// Un point opaque : un identifiant, une valeur, un mot, ce que la voix en dit.
public nonisolated struct MeeshyChartPoint: Identifiable, Equatable, Sendable {
    public let id: String
    public let value: Double
    public let label: String
    public let spoken: String
    public let tint: Color?
    public let position: Double?

    public init(id: String, value: Double, label: String, spoken: String, tint: Color? = nil, position: Double? = nil) {
        self.id = id
        self.value = value
        self.label = label
        self.spoken = spoken
        self.tint = tint
        self.position = position
    }

    /// Une valeur négative ou non finie est servie à zéro.
    public var servedValue: Double { value.isFinite ? max(value, 0) : 0 }
}

/// L'étiquette d'un point choisi : un titre, une valeur, une mention.
public nonisolated struct MeeshyChartCallout: Equatable, Sendable {
    public let title: String
    public let value: String
    public let note: String?

    public init(title: String, value: String, note: String? = nil) {
        self.title = title
        self.value = value
        self.note = note
    }
}

/// **La recette de K50 en VALEURS** : la hauteur de tracé par genre, l'état sans
/// donnée, les points que les repères désignent.
public nonisolated struct MeeshyChartRecipe: Sendable, Equatable {

    public static let stripHeight: Double = 26
    public static let funnelStageHeight: Double = 52
    public static let donutDiameter: Double = 104
    public static let maxAxisLabels = 5

    public let plotHeight: Double
    public let isEmpty: Bool

    public static func resolve(kind: MeeshyChartKind, size: MeeshyChartSize, pointCount: Int) -> MeeshyChartRecipe {
        MeeshyChartRecipe(plotHeight: height(kind: kind, size: size, pointCount: pointCount), isEmpty: pointCount <= 0)
    }

    private static func height(kind: MeeshyChartKind, size: MeeshyChartSize, pointCount: Int) -> Double {
        switch kind {
        case .strip: return stripHeight
        case .donut: return donutDiameter
        case .funnel: return funnelStageHeight * Double(max(pointCount, 1))
        case .bars, .line, .breakdown, .bubbles: return size.height
        }
    }

    /// Les rangs que désigne un repère : `peak` le sommet, `today` le dernier point,
    /// `band` les points de l'un à l'autre (identifiants inconnus ⇒ rien).
    public static func markedIndexes(_ marker: MeeshyChartMarker, ids: [String], values: [Double]) -> [Int] {
        switch marker {
        case .peak: return MeeshyChartScale.peak(values).map { [$0] } ?? []
        case .today: return ids.isEmpty ? [] : [ids.count - 1]
        case .band(let from, let to):
            guard let start = ids.firstIndex(of: from), let end = ids.firstIndex(of: to) else { return [] }
            return Array(min(start, end)...max(start, end))
        case .ticks: return []
        }
    }

    /// Le point sous un doigt : l'abscisse rapportée à la largeur, bornée aux points existants.
    public static func index(forX x: Double, width: Double, count: Int) -> Int? {
        guard count > 0, width > 0, x.isFinite else { return nil }
        return min(max(Int(x / width * Double(count)), 0), count - 1)
    }

    /// Sans `selection`, le graphique est en lecture seule : son geste de choix ne
    /// s'arme pas, le défilement de l'hôte passe à travers.
    public static func armsSelectionGesture(hasSelection: Bool) -> Bool {
        hasSelection
    }

    /// L'entrée d'un tracé : une courbe douce, posée d'emblée sous mouvement réduit.
    public static func entryAnimation(reduce: Bool) -> Animation? {
        reduce ? nil : .spring(response: 0.48, dampingFraction: 1)
    }
}
