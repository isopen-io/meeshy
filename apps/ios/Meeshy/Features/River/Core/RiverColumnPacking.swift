import Foundation

/// La Rivière — partage des colonnes entre voix (miroir de
/// `columnAccepts` / `packColumns` / `assignColumns` de
/// `packages/shared/utils/river-lanes.ts`).
///
/// Logique pure : elle ne lit que ses entrées. Extraite de `RiverLaneResolver`
/// pour tenir le budget de taille ; le code est celui d'origine, seuls les
/// types nommés par `RiverLaneResolver` y sont préfixés.
nonisolated enum RiverColumnPacking {

    struct Seed {
        let laneId: String
        let isViewer: Bool
        let spans: [RiverLaneResolver.RiverLaneSpan]
    }

    struct Assignment {
        let indexByLaneId: [String: Int]
        let overflowed: Bool
    }

    private struct Packing {
        var columns: [[RiverLaneResolver.RiverLaneSpan]] = []
        var indexByLaneId: [(laneId: String, index: Int)] = []
        var overflowed = false
    }

    private static func spansOverlap(_ a: RiverLaneResolver.RiverLaneSpan, _ b: RiverLaneResolver.RiverLaneSpan) -> Bool {
        a.startRank <= b.endRank && b.startRank <= a.endRank
    }

    /// Une colonne accueille une voix de plus si aucun de ses segments ne
    /// croise les siens.
    private static func columnAccepts(held: [RiverLaneResolver.RiverLaneSpan], spans: [RiverLaneResolver.RiverLaneSpan]) -> Bool {
        !held.contains { occupied in spans.contains { spansOverlap(occupied, $0) } }
    }

    /// Range les voix en colonnes quand elles sont PLUS NOMBREUSES que la
    /// largeur permise — coloration gloutonne d'intervalles : chaque voix
    /// prend la colonne libre la plus à gauche. La rive (colonne 0) reste au
    /// lecteur SEUL quand il a une branche : le lecteur étant premier dans
    /// l'ordre, il l'ouvre, et les autres cherchent à partir de la colonne 1.
    private static func pack(lanes: [Seed], maxLanes: Int) -> Packing {
        let shoreIsTaken = lanes.first?.isViewer == true
        var packing = Packing()

        for lane in lanes {
            if packing.overflowed { break }

            let firstShareable = (lane.isViewer || !shoreIsTaken) ? 0 : 1
            var reused: Int?
            var index = firstShareable
            while index < packing.columns.count {
                if columnAccepts(held: packing.columns[index], spans: lane.spans) {
                    reused = index
                    break
                }
                index += 1
            }
            let target = reused ?? packing.columns.count

            if target >= maxLanes {
                packing.overflowed = true
                break
            }

            if target < packing.columns.count {
                packing.columns[target].append(contentsOf: lane.spans)
            } else {
                packing.columns.append(lane.spans)
            }
            packing.indexByLaneId.append((laneId: lane.laneId, index: target))
        }

        return packing
    }

    /// Colonne de chaque voix. Tant que la rivière tient dans sa largeur, une
    /// voix garde SA colonne, pour elle seule et à vie — le partage n'est pas
    /// une optimisation qu'on applique dès qu'elle est possible, c'est le
    /// recours quand il y a plus de voix que de couloirs.
    static func assign(lanes: [Seed], maxLanes: Int) -> Assignment {
        if lanes.count <= maxLanes {
            var indexByLaneId: [String: Int] = [:]
            for (index, lane) in lanes.enumerated() { indexByLaneId[lane.laneId] = index }
            return Assignment(indexByLaneId: indexByLaneId, overflowed: false)
        }

        let packing = pack(lanes: lanes, maxLanes: maxLanes)
        var indexByLaneId: [String: Int] = [:]
        for entry in packing.indexByLaneId { indexByLaneId[entry.laneId] = entry.index }
        return Assignment(indexByLaneId: indexByLaneId, overflowed: packing.overflowed)
    }
}
