import SwiftUI

public nonisolated enum MeeshyReorderRank: String, Sendable, Equatable, CaseIterable {
    case hidden
    case ordinal
}

/// Où en est une rangée : au repos, saisie, en vol sous le doigt, ou déposée.
public nonisolated enum MeeshyReorderPhase: String, Sendable, Equatable, CaseIterable {
    case rest
    case grabbed
    case flying
    case dropped
}

/// Le bord de la poignée : `leading` prend la poignée étroite (un billet). Les bords suivent le sens d'écriture.
public nonisolated enum MeeshyReorderHandleEdge: String, Sendable, Equatable, CaseIterable {
    case trailing
    case leading
}

public nonisolated enum MeeshyReorderDirection: Sendable, Equatable, Hashable {
    case up
    case down
}

/// **Le calcul pur de K52** : le glisser, les actions de la voix et les flèches du
/// clavier appellent le même déplacement, avec les mêmes bornes. `to` est l'index final.
public nonisolated enum MeeshyReorder {

    public static func move<ID>(_ ids: [ID], from: Int, to: Int) -> [ID] {
        guard ids.indices.contains(from) else { return ids }
        let target = min(max(to, 0), ids.count - 1)
        guard target != from else { return ids }
        var reordered = ids
        let moved = reordered.remove(at: from)
        reordered.insert(moved, at: target)
        return reordered
    }

    /// La rangée dont le centre est le plus proche du centre de la rangée déplacée.
    public static func targetIndex(from: Int, offset: Double, heights: [Double], spacing: Double) -> Int {
        guard heights.indices.contains(from), offset.isFinite else { return from }
        let centers = heights.indices.map { index in
            heights.prefix(index).reduce(0) { $0 + $1 + spacing } + heights[index] / 2
        }
        let moved = centers[from] + offset
        return centers.indices.min { abs(centers[$0] - moved) < abs(centers[$1] - moved) } ?? from
    }

    public static func canMoveUp(index: Int, count: Int) -> Bool {
        count >= 2 && index > 0 && index < count
    }

    public static func canMoveDown(index: Int, count: Int) -> Bool {
        count >= 2 && index >= 0 && index < count - 1
    }

    public static func destination(forIndex index: Int, direction: MeeshyReorderDirection) -> Int {
        direction == .up ? index - 1 : index + 1
    }

    /// Les directions que la voix et le clavier offrent à une rangée : celles qui
    /// la déplacent vraiment. Aucune pour une liste éteinte ou une rangée en attente.
    public static func voiceDirections(index: Int, count: Int, isActive: Bool, isPending: Bool) -> [MeeshyReorderDirection] {
        guard isActive, !isPending else { return [] }
        return [MeeshyReorderDirection.up, .down].filter { direction in
            direction == .up ? canMoveUp(index: index, count: count) : canMoveDown(index: index, count: count)
        }
    }
}

/// **La recette de K52 en VALEURS** : la poignée, la rangée soulevée, la pastille de rang.
public nonisolated struct MeeshyReorderListRecipe: Sendable, Equatable {

    public static let handleHeight: Double = 44
    public static let handleWidth: Double = 44
    public static let narrowHandleWidth: Double = 32
    public static let rankPillDiameter: Double = 30
    public static let liftTiltDegrees: Double = 2
    public static let liftZIndex: Double = 10
    public static let emphasisOpacity: Double = 0.5
    public static let longPressMilliseconds = 350

    public let handleWidth: Double
    public let handleHeight: Double
    public let isLifted: Bool
    public let tiltDegrees: Double
    public let zIndex: Double
    public let showsRank: Bool
    public let isGrabbable: Bool
    public let isFirst: Bool

    public static func resolve(phase: MeeshyReorderPhase,
                               rank: MeeshyReorderRank,
                               isFirst: Bool,
                               isEnabled: Bool,
                               isPending: Bool,
                               handleEdge: MeeshyReorderHandleEdge,
                               reduceMotion: Bool) -> MeeshyReorderListRecipe {
        let lifted = phase == .grabbed || phase == .flying
        return MeeshyReorderListRecipe(
            handleWidth: handleEdge == .leading ? narrowHandleWidth : handleWidth,
            handleHeight: handleHeight,
            isLifted: lifted,
            tiltDegrees: lifted && !reduceMotion ? liftTiltDegrees : 0,
            zIndex: lifted ? liftZIndex : 0,
            showsRank: rank == .ordinal,
            isGrabbable: isEnabled && !isPending,
            isFirst: isFirst
        )
    }

    /// La liste est éteinte si `isEnabled` est faux ou s'il y a moins de deux rangées.
    public static func isActive(isEnabled: Bool, count: Int) -> Bool {
        isEnabled && count >= 2
    }

    /// La pastille suit la position, jamais l'élément : plein au premier, 34 % au deuxième, 16 % ensuite.
    public static func rankOpacity(position: Int) -> Double {
        switch position {
        case ..<1: return 1
        case 1: return 0.34
        default: return 0.16
        }
    }

    public static func accentBorderOpacity(emphasizesFirst: Bool, isFirst: Bool) -> Double {
        emphasizesFirst && isFirst ? emphasisOpacity : 0
    }

    /// Les rangées s'écartent et se posent par un ressort `morph` ; posées d'un coup sous mouvement réduit.
    public static func settleAnimation(reduce: Bool) -> Animation? {
        reduce ? nil : .spring(response: 0.32, dampingFraction: 0.8)
    }
}
