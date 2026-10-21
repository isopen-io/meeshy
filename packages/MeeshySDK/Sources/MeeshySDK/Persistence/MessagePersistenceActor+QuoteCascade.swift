import Foundation
import GRDB

// MARK: - Une réponse quitte la BASE avec ce qu'elle cite (#10433)

extension MessagePersistenceActor {

    /// **Purge les réponses que la mort de `deadIds` emporte** — la moitié
    /// persistante de `QuoteCascade` : sans elle, la réponse d'un éphémère mort
    /// restait sur le disque et revenait au fil dès que le message cité sortait
    /// de la fenêtre chargée (plus rien ne disait qu'elle devait mourir).
    ///
    /// Part :
    /// - toute ligne qui CITE un message de `deadIds`, transitivement sur
    ///   `QuoteCascade.maxDepth` maillons, comme la remontée de la passerelle :
    ///   la mort de ce qu'elle cite est ATTEINTE, la sienne aussi ;
    /// - toute ligne de `deadIds` dont la chaîne citée est déjà morte chez ce
    ///   lecteur — une réponse à VUE UNIQUE, non éphémère, à une flamme-œil
    ///   consommée part, au lieu de rester « Message supprimé » sous le
    ///   `message:expired` de la cascade serveur.
    ///
    /// `deadIds` doivent être MORTS pour ce lecteur (combustion menée à son
    /// terme, `message:expired`) : c'est ce qui rend la purge définitive sans
    /// mentir. Les tables filles suivent (`purgeMessages`).
    ///
    /// - Returns: les identifiants locaux purgés.
    @discardableResult
    public func purgeQuoteCascade(
        fromDead deadIds: [String],
        ledger: EphemeralReceiptRecording = EphemeralReceiptLedger.shared,
        now: Date = Date()
    ) async throws -> [String] {
        guard !deadIds.isEmpty else { return [] }
        let doomed = try await dbWriter.read { db in
            try Self.quoteCascadeVictims(of: deadIds, in: db, ledger: ledger, now: now)
        }
        guard !doomed.isEmpty else { return [] }
        try await purgeMessages(ids: doomed)
        return doomed
    }

    nonisolated static func quoteCascadeVictims(
        of deadIds: [String],
        in db: Database,
        ledger: EphemeralReceiptRecording,
        now: Date
    ) throws -> [String] {
        let dead = try MessageRecord
            .filter(deadIds.contains(Column("localId")) || deadIds.contains(Column("serverId")))
            .fetchAll(db)
        let diedWithTheirQuote = try dead.filter { record in
            guard let death = try inheritedDeath(of: record, in: db, ledger: ledger, now: now) else { return false }
            return death <= now
        }

        var seen = Set(deadIds + dead.flatMap { [$0.localId, $0.serverId].compactMap { $0 } })
        var frontier = Array(seen)
        var citers: [MessageRecord] = []
        for _ in 0..<QuoteCascade.maxDepth where !frontier.isEmpty {
            let fresh = try MessageRecord
                .filter(frontier.contains(Column("replyToId")))
                .fetchAll(db)
                .filter { !seen.contains($0.localId) }
            citers += fresh
            frontier = fresh.flatMap { [$0.localId, $0.serverId].compactMap { $0 } }
            seen.formUnion(frontier)
        }
        return (diedWithTheirQuote + citers).map(\.localId)
    }

    /// L'échéance qu'une ligne hérite de sa chaîne citée, chaque maillon relu
    /// en base par son id local OU serveur.
    private nonisolated static func inheritedDeath(
        of record: MessageRecord,
        in db: Database,
        ledger: EphemeralReceiptRecording,
        now: Date
    ) throws -> Date? {
        guard record.replyToId != nil else { return nil }
        let start = QuoteCascade.link(for: record, ledger: ledger, now: now)
        return QuoteCascade.inheritedDeath(of: start) { id in
            let row = try? MessageRecord
                .filter(Column("localId") == id || Column("serverId") == id)
                .fetchOne(db)
            return row.map { QuoteCascade.link(for: $0, ledger: ledger, now: now) }
        }
    }
}
