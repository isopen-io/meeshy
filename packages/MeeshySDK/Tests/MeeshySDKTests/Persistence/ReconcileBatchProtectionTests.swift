import XCTest
import GRDB
@testable import MeeshySDK

/// **Un message réconcilié depuis le cache garde sa protection** (#7552).
///
/// `bufferIncoming` recrée en base une ligne que le cache tient et que GRDB
/// n'a plus — typiquement un éphémère que `deleteExpiredEphemeral` vient
/// d'effacer. `reconcileBatchSync` l'insérait avec `expiresAt: nil,
/// effectFlags: 0` et sans durée : l'éphémère renaissait en message ORDINAIRE,
/// sans flamme, sans échéance, et plus aucun balayage ne pouvait le retirer.
final class ReconcileBatchProtectionTests: XCTestCase {

    private var dbQueue: DatabaseQueue!
    private var actor: MessagePersistenceActor!

    private static let conversationId = "6ab16c0b67c87be0efa97552"

    override func setUp() async throws {
        dbQueue = try DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: dbQueue)
        actor = MessagePersistenceActor(dbWriter: dbQueue)
        await actor.start()
    }

    override func tearDown() async throws {
        actor = nil
        dbQueue = nil
    }

    private func persistedRow(_ id: String) async throws -> MessageRecord {
        let limit = Date().addingTimeInterval(3)
        while Date() < limit {
            if let row = try await dbQueue.read({ db in try MessageRecord.fetchOne(db, key: id) }) {
                return row
            }
            try await Task.sleep(nanoseconds: 20_000_000)
        }
        return try XCTUnwrap(nil as MessageRecord?, "la ligne réconciliée doit exister en base")
    }

    func test_reconcileBatch_ephemeralFromCache_keepsFlagsDurationAndDeadline() async throws {
        let deadline = Date(timeIntervalSince1970: 1_790_000_060)
        let flags: MessageEffectFlags = [.ephemeral, .blurred]
        await actor.bufferIncoming([
            MessagePersistenceActor.IncomingMessageData(
                id: "6ab37099918d1dc340017552",
                conversationId: Self.conversationId,
                senderId: "6a9e11d7c2b84f0193ac55e1",
                content: "secret",
                createdAt: Date(timeIntervalSince1970: 1_790_000_000),
                computedState: .delivered,
                expiresAt: deadline,
                effectFlags: flags.rawValue,
                ephemeralDuration: 60
            )
        ])

        let row = try await persistedRow("6ab37099918d1dc340017552")

        XCTAssertEqual(row.effectFlags, flags.rawValue)
        XCTAssertEqual(row.ephemeralDuration, 60)
        XCTAssertEqual(row.expiresAt, deadline)
    }

    func test_reconcileBatch_ordinaryMessage_staysUnprotected() async throws {
        await actor.bufferIncoming([
            MessagePersistenceActor.IncomingMessageData(
                id: "6ab37099918d1dc340017553",
                conversationId: Self.conversationId,
                senderId: "6a9e11d7c2b84f0193ac55e1",
                content: "bonjour",
                createdAt: Date(timeIntervalSince1970: 1_790_000_000),
                computedState: .delivered
            )
        ])

        let row = try await persistedRow("6ab37099918d1dc340017553")

        XCTAssertEqual(row.effectFlags, 0)
        XCTAssertNil(row.ephemeralDuration)
        XCTAssertNil(row.expiresAt)
    }
}
