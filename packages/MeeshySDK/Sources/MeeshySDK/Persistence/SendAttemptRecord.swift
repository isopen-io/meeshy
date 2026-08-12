import Foundation
import GRDB

/// Journal local des tentatives d'envoi d'un message sortant — spec
/// `docs/superpowers/specs/2026-07-08-message-send-failure-retry-flow-design.md`.
///
/// Une ligne par tentative de transport (socket-first, REST, socket-fallback,
/// rejeu outbox), clé de jointure `localId` = `clientMessageId` du message.
/// L'historique est conservé après le succès (`serverAck` ne purge pas) : la
/// vue détails affiche la première tentative et chaque re-tentative avec son
/// transport, son horodatage et son erreur éventuelle.
public struct SendAttemptRecord: Codable, Equatable, Sendable, FetchableRecord, MutablePersistableRecord {
    public static let databaseTableName = "send_attempts"

    public var id: Int64?
    public var localId: String
    public var attemptNumber: Int
    public var transport: String
    public var startedAt: Date
    public var finishedAt: Date?
    public var outcome: String
    public var errorMessage: String?

    public enum Transport: String, Sendable {
        case socketFirst = "socket-first"
        case rest = "rest"
        case socketFallback = "socket-fallback"
        case outbox = "outbox"
    }

    public enum Outcome: String, Sendable {
        case success
        case failure
    }

    public init(
        id: Int64? = nil,
        localId: String,
        attemptNumber: Int,
        transport: String,
        startedAt: Date,
        finishedAt: Date? = nil,
        outcome: String,
        errorMessage: String? = nil
    ) {
        self.id = id
        self.localId = localId
        self.attemptNumber = attemptNumber
        self.transport = transport
        self.startedAt = startedAt
        self.finishedAt = finishedAt
        self.outcome = outcome
        self.errorMessage = errorMessage
    }

    public mutating func didInsert(_ inserted: InsertionSuccess) {
        id = inserted.rowID
    }

    /// Insère une tentative en calculant `attemptNumber` = max existant + 1
    /// pour ce `localId`. Appelé dans une transaction d'écriture GRDB — la
    /// sérialisation des writes garantit la monotonie du compteur.
    @discardableResult
    public static func log(
        _ db: Database,
        localId: String,
        transport: Transport,
        startedAt: Date,
        finishedAt: Date = Date(),
        outcome: Outcome,
        errorMessage: String? = nil
    ) throws -> SendAttemptRecord {
        let previous = try Int.fetchOne(
            db,
            sql: "SELECT COALESCE(MAX(attemptNumber), 0) FROM send_attempts WHERE localId = ?",
            arguments: [localId]
        ) ?? 0
        var record = SendAttemptRecord(
            localId: localId,
            attemptNumber: previous + 1,
            transport: transport.rawValue,
            startedAt: startedAt,
            finishedAt: finishedAt,
            outcome: outcome.rawValue,
            errorMessage: errorMessage
        )
        try record.insert(db)
        return record
    }
}
