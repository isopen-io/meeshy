import Foundation

/// **L'ordre du fil des réels est STABLE sous le lecteur (#9702)** — loi pure,
/// jumelle de `holdReelThread` (`apps/web/src/lib/reels/thread.ts`).
///
/// La passerelle RECLASSE une page à chaque lecture (`PostFeedService.getReels`
/// fait couler les réels déjà vus et exclut la graine). Remplacer la liste du
/// pager par ce qu'elle sert déplace donc le réel regardé : ouvert en tête, il
/// se retrouve en queue, et « suivant » n'existe plus.
///
/// Trois règles :
/// - **`refreshed`** — une relecture garde, à leur place, le réel regardé et
///   tout ce qui le précède ; elle ne réordonne que ce qui le SUIT. Chaque réel
///   gardé prend sa donnée la plus récente.
/// - **`appended`** — une page de plus s'ajoute en queue, dédoublonnée.
/// - **`preloadScope`** — le réel regardé et les identités que la fenêtre de
///   préchargement peut atteindre autour de lui : quand l'un ou les autres
///   changent, la préparation est rejouée.
public enum ReelThreadOrder {

    public static func refreshed<Item: Identifiable>(
        current: [Item], anchorId: Item.ID?, served: [Item]
    ) -> [Item] {
        guard let anchorId, let anchorIndex = current.firstIndex(where: { $0.id == anchorId }) else {
            return unique(served)
        }
        let latest = Dictionary(served.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
        let held = unique(Array(current[...anchorIndex])).map { latest[$0.id] ?? $0 }
        return unique(held + served)
    }

    public static func appended<Item: Identifiable>(current: [Item], served: [Item]) -> [Item] {
        unique(current + served)
    }

    /// Ce dont la préparation dépend : le réel regardé ET les identités à
    /// portée. Deux réels d'une liste courte partagent le même voisinage ;
    /// c'est le réel regardé qui les distingue.
    public struct PreloadScope<ID: Hashable & Sendable>: Equatable, Sendable {
        public let anchorId: ID?
        public let neighbours: [ID]
    }

    public static func preloadScope<ID: Hashable & Sendable>(
        ids: [ID], anchorId: ID?, radius: Int = ReelPreloadWindow.maxRadius
    ) -> PreloadScope<ID> {
        guard let anchorId, let anchorIndex = ids.firstIndex(of: anchorId) else {
            return PreloadScope(anchorId: anchorId, neighbours: [])
        }
        let reach = max(0, radius)
        let lower = max(0, anchorIndex - reach)
        let upper = min(ids.count - 1, anchorIndex + reach)
        return PreloadScope(anchorId: anchorId, neighbours: Array(ids[lower...upper]))
    }

    private static func unique<Item: Identifiable>(_ items: [Item]) -> [Item] {
        var seen = Set<Item.ID>()
        return items.filter { seen.insert($0.id).inserted }
    }
}
