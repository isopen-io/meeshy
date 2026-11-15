import os

/// Signposts pour profiler les segments CHAUDS du rendu de la liste dans
/// Instruments (track « Points of Interest ») ET via `XCTOSSignpostMetric` dans
/// les tests. Deux intervalles : `applySnapshot` (prépa snapshot O(n) : reversed
/// + map + groupByDay + diff) et `cellConfig` (config PAR cellule : domainMessage
/// + build `BubbleContent` + `UIHostingConfiguration`). Permet de voir EXACTEMENT
/// quel segment du rendu coûte, par device/iOS, sur un scroll réel.
enum PerfSignpost {
    static let signposter = OSSignposter(
        logHandle: OSLog(subsystem: "me.meeshy.app", category: .pointsOfInterest)
    )
}
