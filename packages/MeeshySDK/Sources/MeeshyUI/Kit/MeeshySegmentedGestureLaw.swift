import SwiftUI

/// L'étendue horizontale d'un segment dans la piste, en points, dans l'espace de
/// la piste.
public nonisolated struct MeeshySegmentedSpan: Sendable, Equatable {
    public let minX: Double
    public let maxX: Double

    public init(minX: Double, maxX: Double) {
        self.minX = minX
        self.maxX = maxX
    }

    public var width: Double { maxX - minX }
}

/// Le sens d'un changement de face, lu dans l'ordre des options : vers une
/// option plus loin, le contenu AVANCE ; vers une plus proche, il RECULE.
public nonisolated enum MeeshySegmentedTravel: String, Sendable, Equatable, CaseIterable {
    case forward
    case backward
    case none

    /// Le bord par lequel le contenu choisi entre : celui de fin en avançant,
    /// celui de début en reculant (SwiftUI les retourne en lecture de droite à gauche).
    public var insertionEdge: Edge? {
        switch self {
        case .forward: return .trailing
        case .backward: return .leading
        case .none: return nil
        }
    }

    /// Le bord par lequel le contenu quitté sort : l'opposé de l'entrée.
    public var removalEdge: Edge? {
        switch self {
        case .forward: return .leading
        case .backward: return .trailing
        case .none: return nil
        }
    }
}

/// Le voyage de la pastille : d'où elle part, où elle va, et le numéro du
/// changement (la phase animée court de `generation - 1` à `generation`).
public nonisolated struct MeeshySegmentedDropState: Sendable, Equatable {
    public let from: Int?
    public let to: Int?
    public let generation: Int

    public init(from: Int?, to: Int?, generation: Int) {
        self.from = from
        self.to = to
        self.generation = generation
    }

    public static func resting(at index: Int?) -> MeeshySegmentedDropState {
        MeeshySegmentedDropState(from: index, to: index, generation: 0)
    }

    /// Le changement suivant part de la face montrée ; sous « Réduire les
    /// animations » la pastille ne voyage pas, elle paraît en fondu sur place.
    public func advanced(to index: Int?, reduce: Bool) -> MeeshySegmentedDropState {
        MeeshySegmentedDropState(from: reduce ? index : to, to: index, generation: generation + 1)
    }
}

/// **K03 — le geste et la goutte** (#19606, planche `Sys-Mouvement` § 02) : on
/// change de face en touchant une face OU en glissant sur la pilule ; la pastille
/// s'étire comme une goutte de la face quittée vers la face choisie puis se
/// rétracte, sous le ressort `morph` de K26, et le contenu glisse dans le même sens.
public extension MeeshySegmentedLaw {

    /// La part de la course que prend chaque bord : le bord avant arrive à 60 %,
    /// le bord arrière part à 40 %. Entre les deux, la goutte est étirée.
    nonisolated static let dropLead = 0.6

    nonisolated static func travel(from: Int?, to: Int?) -> MeeshySegmentedTravel {
        guard let from, let to, from != to else { return .none }
        return to > from ? .forward : .backward
    }

    /// Le glissé ne vise une face que si la piste tient sur une rangée : une piste
    /// repliée (très grande police) se choisit au toucher seulement.
    nonisolated static func isSingleRow(tops: [Double]) -> Bool {
        guard let first = tops.first else { return false }
        return tops.allSatisfy { abs($0 - first) < 0.5 }
    }

    /// La face sous le doigt : la première étendue qui contient `x`, sinon la plus
    /// proche (le doigt a glissé hors de la piste) ; `nil` sans étendue.
    nonisolated static func dragTarget(x: Double, spans: [MeeshySegmentedSpan]) -> Int? {
        guard x.isFinite else { return nil }
        return spans.indices.min { distance(x, to: spans[$0]) < distance(x, to: spans[$1]) }
    }

    /// L'avancement du voyage en cours, 0 au départ, 1 à l'arrivée.
    nonisolated static func dropProgress(phase: Double, generation: Int) -> Double {
        phase - Double(generation - 1)
    }

    /// L'étendue de la goutte à `progress` : le bord avant (dans le sens du
    /// voyage) en tête, le bord arrière en retard, les deux posés à l'arrivée.
    nonisolated static func dropSpan(
        from: MeeshySegmentedSpan,
        to: MeeshySegmentedSpan,
        progress: Double
    ) -> MeeshySegmentedSpan {
        let p = progress.isFinite ? progress : 1
        let lead = clamped(p / dropLead)
        let trail = clamped((p - (1 - dropLead)) / dropLead)
        let forward = to.minX >= from.minX
        return MeeshySegmentedSpan(
            minX: from.minX + (to.minX - from.minX) * (forward ? trail : lead),
            maxX: from.maxX + (to.maxX - from.maxX) * (forward ? lead : trail)
        )
    }

    private nonisolated static func clamped(_ value: Double) -> Double {
        min(max(value, 0), 1)
    }

    private nonisolated static func distance(_ x: Double, to span: MeeshySegmentedSpan) -> Double {
        if x < span.minX { return span.minX - x }
        if x > span.maxX { return x - span.maxX }
        return 0
    }
}
