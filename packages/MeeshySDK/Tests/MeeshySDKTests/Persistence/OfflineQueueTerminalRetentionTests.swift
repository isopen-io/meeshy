import XCTest
import GRDB
@testable import MeeshySDK

/// Couvre la SORTIE d'une ligne définitivement morte (#5965) : elle est bornée
/// en temps, et ce qu'elle épargne — le contenu écrit par l'utilisateur —
/// compte autant que ce qu'elle jette.
final class OfflineQueueTerminalRetentionTests: XCTestCase {

    private var queue: OfflineQueue { OfflineQueue.shared }
    private let now = Date(timeIntervalSince1970: 1_800_000_000)

    override func setUp() async throws {
        let pool = try DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: pool)
        await OfflineQueue.shared.configure(pool: pool)
        await queue.clearAll()
    }

    override func tearDown() async throws {
        await queue.clearAll()
    }

    private func insert(
        kind: OutboxKind,
        status: OutboxStatus,
        gaveUp ago: TimeInterval
    ) async throws {
        let stamp = now.addingTimeInterval(-ago)
        let record = OutboxRecord(
            id: UUID().uuidString,
            kind: kind,
            conversationId: "conv-1",
            clientMessageId: UUID().uuidString,
            payload: Data("{}".utf8),
            status: status,
            attempts: 1,
            lastError: "server(statusCode: 400)",
            createdAt: stamp,
            updatedAt: stamp,
            nextAttemptAt: stamp
        )
        try await insert(record)
    }

    private func insert(_ record: OutboxRecord) async throws {
        guard let pool = await queue.outboxPoolForTesting else {
            return XCTFail("pool non configuré")
        }
        try await pool.write { db in try record.insert(db) }
    }

    private func remainingKinds() async throws -> [OutboxKind] {
        guard let pool = await queue.outboxPoolForTesting else { return [] }
        return try await pool.read { db in try OutboxRecord.fetchAll(db) }
            .map(\.kind)
            .sorted { $0.rawValue < $1.rawValue }
    }

    /// Le symptôme mesuré : deux `blockUser`, une `unblockUser` et une
    /// `sendReaction` mortes depuis 25 heures. Rien ne les relit — elles sortent.
    func test_deadDiscardableRows_leaveTheQueue() async throws {
        try await insert(kind: .blockUser, status: .exhausted, gaveUp: 25 * 3_600)
        try await insert(kind: .unblockUser, status: .exhausted, gaveUp: 25 * 3_600)
        try await insert(kind: .sendReaction, status: .exhausted, gaveUp: 25 * 3_600)

        let deleted = await queue.purgeDiscardableTerminalRows(now: now)

        XCTAssertEqual(deleted, 3)
        let remaining = try await remainingKinds()
        XCTAssertTrue(remaining.isEmpty, "il reste \(remaining)")
    }

    /// **Le contre-témoin, et c'est celui qui compte.** Une ligne `sendMessage`
    /// morte est le SEUL endroit qui tienne encore les identifiants
    /// d'attachments téléversés (`ConversationViewModel.retryMessage`), et une
    /// `createPost` morte est le seul brouillon que
    /// `recoverLastUnsentPost` puisse reproposer. Les jeter retirerait en
    /// silence le dernier chemin vers ce que l'utilisateur a écrit.
    func test_deadRowsCarryingAuthoredContent_areKept() async throws {
        try await insert(kind: .sendMessage, status: .exhausted, gaveUp: 25 * 3_600)
        try await insert(kind: .createPost, status: .exhausted, gaveUp: 25 * 3_600)
        try await insert(kind: .createComment, status: .exhausted, gaveUp: 25 * 3_600)
        try await insert(kind: .publishStory, status: .exhausted, gaveUp: 25 * 3_600)

        let deleted = await queue.purgeDiscardableTerminalRows(now: now)

        XCTAssertEqual(deleted, 0)
        let remaining = try await remainingKinds()
        XCTAssertEqual(remaining, [.createComment, .createPost, .publishStory, .sendMessage])
    }

    /// Une ligne qui vient de renoncer reste : l'utilisateur ne l'a pas encore
    /// vue, et le doigt qui la relance depuis la pastille doit la trouver.
    func test_aRowThatJustGaveUp_stays() async throws {
        try await insert(kind: .blockUser, status: .exhausted, gaveUp: 30)

        let deleted = await queue.purgeDiscardableTerminalRows(now: now)

        XCTAssertEqual(deleted, 0)
        let remaining = try await remainingKinds()
        XCTAssertEqual(remaining, [.blockUser])
    }

    /// **L'âge se mesure au RENONCEMENT, pas à la mise en file.** Une ligne
    /// enfilée hors ligne il y a des heures et qui vient d'échouer est un échec
    /// récent : la mesurer sur `createdAt` la ferait naître périmée.
    func test_theAgeIsMeasuredOnTheGivingUp_notOnTheEnqueue() async throws {
        let born = now.addingTimeInterval(-25 * 3_600)
        let gaveUp = now.addingTimeInterval(-30)
        let record = OutboxRecord(
            id: UUID().uuidString,
            kind: .blockUser,
            conversationId: "_global",
            clientMessageId: UUID().uuidString,
            payload: Data("{}".utf8),
            status: .exhausted,
            attempts: 1,
            lastError: "server(statusCode: 400)",
            createdAt: born,
            updatedAt: gaveUp,
            nextAttemptAt: gaveUp
        )
        try await insert(record)

        let deleted = await queue.purgeDiscardableTerminalRows(now: now)

        XCTAssertEqual(deleted, 0)
        let remaining = try await remainingKinds()
        XCTAssertEqual(remaining, [.blockUser])
    }

    /// Une ligne encore VIVANTE ne se jette jamais, quel que soit son âge : le
    /// flusher la reprendra au prochain réseau.
    func test_liveRows_areNeverPurged_whateverTheirAge() async throws {
        try await insert(kind: .blockUser, status: .pending, gaveUp: 25 * 3_600)
        try await insert(kind: .markAsRead, status: .inflight, gaveUp: 25 * 3_600)

        let deleted = await queue.purgeDiscardableTerminalRows(now: now)

        XCTAssertEqual(deleted, 0)
        let remaining = try await remainingKinds()
        XCTAssertEqual(remaining, [.blockUser, .markAsRead])
    }
}
