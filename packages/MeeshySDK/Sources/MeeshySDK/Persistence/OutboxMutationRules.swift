import Foundation

/// Règles pures de l'enfilage des mutations non-message : quelles kinds se
/// coalescent, comment fusionner deux reçus de lecture, comment lire le cmid
/// d'un payload encodé. Ne lit que ses entrées.
enum OutboxMutationRules {
    /// Whether the given `OutboxKind` should coalesce-on-enqueue: every new
    /// row for the same conversationId anchor supersedes earlier
    /// `.pending` / `.failed` rows of the same kind. Reserved for kinds
    /// whose payload is **monotonically idempotent** — applying only the
    /// latest one alone is equivalent to applying every intermediate one
    /// in sequence.
    ///
    /// Currently includes only `.markAsRead`: le curseur de lecture n'avance
    /// que vers l'avant, si bien qu'une conversation de groupe animée qui
    /// déclenche `markAsRead` à chaque message entrant peut réduire 17 rows
    /// empilées à une seule — les identifiants lus des rows périmées étant
    /// fusionnés dans la survivante par `mergeMarkAsReadPayloads`, aucune
    /// lecture n'est perdue au passage. Other latest-state kinds
    /// (profile / settings / conversation updates) might be added later,
    /// but each needs a case-by-case audit to confirm intermediate states
    /// can be safely dropped.
    static func coalescesByAnchor(kind: OutboxKind) -> Bool {
        switch kind {
        case .markAsRead:
            return true
        case .markStoryViewed:
            // R6 — anchor = storyId : re-voir la même story remplace le row
            // pendant/failed précédent (le « vu » est binaire et idempotent) ;
            // des stories différentes ont des anchors différents et sont
            // toutes conservées.
            return true
        default:
            return false
        }
    }

    /// outbox-05 — fusionne le payload `.markAsRead` entrant avec toutes les
    /// rows périmées qu'il remplace, au lieu de jeter leurs `messageIds`
    /// (reçus de lecture exacte). Décodage tolérant : une row legacy
    /// indécodable est ignorée, jamais un enqueue planté.
    static func mergeMarkAsReadPayloads(newest: Data, stale: [Data]) -> Data {
        let decoder = JSONDecoder()
        guard let newestPayload = try? decoder.decode(MarkAsReadPayload.self, from: newest) else {
            return newest
        }
        let staleDecoded = stale.compactMap { try? decoder.decode(MarkAsReadPayload.self, from: $0) }

        let informed = (staleDecoded.map(\.messageIds) + [newestPayload.messageIds]).compactMap { $0 }
        let mergedMessageIds: [String]?
        if informed.isEmpty {
            mergedMessageIds = nil
        } else {
            var seen = Set<String>()
            mergedMessageIds = informed.flatMap { $0 }.filter { seen.insert($0).inserted }
        }

        var mergedLanguages: [String: String] = [:]
        for languages in staleDecoded.map(\.messageLanguages) + [newestPayload.messageLanguages] {
            guard let languages else { continue }
            mergedLanguages.merge(languages, uniquingKeysWith: { _, new in new })
        }

        let merged = MarkAsReadPayload(
            clientMutationId: newestPayload.clientMutationId,
            conversationId: newestPayload.conversationId,
            messageIds: mergedMessageIds,
            language: newestPayload.language,
            messageLanguages: mergedLanguages.isEmpty ? nil : mergedLanguages,
            caughtUpToMessageId: newestPayload.caughtUpToMessageId
        )
        return (try? JSONEncoder().encode(merged)) ?? newest
    }

    /// Reads the top-level `clientMutationId` field from a JSON-encoded
    /// payload without requiring the payload type to expose a protocol.
    static func extractClientMutationId(from payload: Data) -> String? {
        guard let object = try? JSONSerialization.jsonObject(with: payload) as? [String: Any],
              let cmid = object["clientMutationId"] as? String else {
            return nil
        }
        return ClientMutationId.isValid(cmid) ? cmid : nil
    }
}
