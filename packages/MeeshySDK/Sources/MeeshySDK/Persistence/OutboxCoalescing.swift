import Foundation
import GRDB

/// **L'enfilage « dernier état gagnant »** : une nouvelle intention remplace les
/// lignes `.pending` / `.failed` de même genre et de même ancre
/// (`OutboxMutationRules.coalescesByAnchor`).
///
/// `.markAsRead` est l'exception (outbox-05) : ses messageIds sont des REÇUS de
/// lecture exacte, pas un état à jeter — ils sont fusionnés (union) dans le
/// payload survivant avant la suppression des lignes périmées.
///
/// Les cmid des lignes remplacées remontent (#16010) : elles n'auront jamais
/// d'issue, et ceux qui les observent doivent être relâchés par l'appelant.
enum OutboxCoalescing {
    struct Outcome {
        let payload: Data
        let superseded: [String]
    }

    static func supersedeStaleRows(in db: Database, kind: OutboxKind, anchor: String,
                                   newest: Data, cmid: String) throws -> Outcome {
        let stale: [OutboxRecord] = try OutboxRecord
            .filter(Column("kind") == kind.rawValue)
            .filter(Column("conversationId") == anchor)
            .filter([OutboxStatus.pending.rawValue, OutboxStatus.failed.rawValue].contains(Column("status")))
            .fetchAll(db)
        guard !stale.isEmpty else { return Outcome(payload: newest, superseded: []) }
        let payload = kind == .markAsRead
            ? OutboxMutationRules.mergeMarkAsReadPayloads(newest: newest, stale: stale.map(\.payload))
            : newest
        try OutboxRecord.filter(stale.map(\.id).contains(Column("id"))).deleteAll(db)
        return Outcome(payload: payload, superseded: stale.map(\.clientMessageId).filter { $0 != cmid })
    }
}
