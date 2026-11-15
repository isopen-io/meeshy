import Foundation
import MeeshySDK

nonisolated struct MergeOutcome {
    let messages: [Message]
    let superseded: Set<String>
}

nonisolated struct MergeDrops {
    let all: Set<String>
    let unexpected: Set<String>
    let inFlightOrSent: Int
}

/// La fusion de `incoming` (le snapshot du store) dans les messages en mémoire : une ligne qui n'a pas encore
/// atteint GRDB (livraison socket qui devance le REST) est PRÉSERVÉE, le résultat est trié par `createdAt`.
/// Quand l'accusé serveur change l'id d'affichage d'une bulle optimiste (`cid_…` → id serveur), la table
/// `pendingServerIds` désigne l'ancienne ligne comme SUPERSEDED : sans cela elle serait gardée à côté de la
/// nouvelle, soit une bulle en double.
nonisolated enum ConversationMessageMerge {

    static func merge(current: [Message], incoming: [Message], pendingServerIds: [String: String]) -> MergeOutcome {
        let incomingIds = Set(incoming.map(\.id))
        let superseded = Set(current.compactMap { message -> String? in
            guard let serverId = pendingServerIds[message.id], incomingIds.contains(serverId) else { return nil }
            return message.id
        })
        let preserved = current.filter { !incomingIds.contains($0.id) && !superseded.contains($0.id) }
        let merged = preserved.isEmpty ? incoming : (incoming + preserved).sorted { $0.createdAt < $1.createdAt }
        return MergeOutcome(messages: merged, superseded: superseded)
    }

    /// Une ligne qui disparaît de l'affichage sans raison est un bug ; les lignes SUPERSEDED sont des
    /// disparitions attendues (changement d'id à l'accusé).
    static func drops(before: [Message], after: [Message], superseded: Set<String>) -> MergeDrops {
        let all = Set(before.map(\.id)).subtracting(after.map(\.id))
        let unexpected = all.subtracting(superseded)
        let inFlightOrSent = before.filter { unexpected.contains($0.id) }.filter { message in
            let status = String(describing: message.deliveryStatus)
            return ["sending", "clock", "failed", "sent", "queued"].contains { status.contains($0) }
        }.count
        return MergeDrops(all: all, unexpected: unexpected, inFlightOrSent: inFlightOrSent)
    }
}
