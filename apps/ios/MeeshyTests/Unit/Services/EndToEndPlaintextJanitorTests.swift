import XCTest
import GRDB
import MeeshyE2EE
import MeeshySDK
@testable import Meeshy

/// Un message effacé dans la base des messages vide le coffre E2EE, après sa
/// grâce, et seulement quand le coffre accepte (#13001).
final class EndToEndPlaintextJanitorTests: XCTestCase {
    private let conversationId = "00000000000000000000ab01"

    private func persistence(with rows: [(local: String, server: String)]) async throws -> MessagePersistenceActor {
        let queue = try DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: queue)
        let conversationId = conversationId
        try await queue.write { db in
            for row in rows {
                var record = OptimisticTextRecordBuilder.record(
                    localId: row.local, conversationId: conversationId, senderId: "00000000000000000000bb22", sender: nil,
                    text: "", originalLanguage: "fr", messageType: "text", replyToId: nil, storyReplyToId: nil,
                    forwardedFromId: nil, forwardedFromConversationId: nil, replyToJson: nil, effectFlags: 0,
                    maxViewOnceCount: nil, locationJson: nil, stickerJson: nil, now: Date(), ephemeralDuration: nil
                )
                record.serverId = row.server
                record.isEncrypted = true
                record.encryptionMode = E2EEWire.mode
                try record.insert(db)
            }
        }
        return MessagePersistenceActor(dbWriter: queue)
    }

    private func content() -> E2EEContent {
        E2EEContent(text: "à effacer", language: "fr", replyTo: nil, conversationId: conversationId, clientMessageId: "cid_1", sentAt: Date())
    }

    private func janitor(_ endToEnd: MockEndToEndMessaging, _ queue: MessagePersistenceActor, at now: Date) -> EndToEndPlaintextJanitor {
        EndToEndPlaintextJanitor(endToEnd: endToEnd, queue: { queue }, now: { now })
    }

    func test_aDeletedMessage_leavesTheVault_onceItsGraceHasPassed() async throws {
        let queue = try await persistence(with: [("cid_1", "srv_1"), ("cid_2", "srv_2")])
        let endToEnd = MockEndToEndMessaging()
        await endToEnd.remember(content(), from: "me", as: ["cid_1", "srv_1", "srv_2"])
        try await queue.markDeleted(localId: "srv_1", deletedAt: Date())

        await janitor(endToEnd, queue, at: Date().addingTimeInterval(EndToEndPlaintextJanitor.grace + 1)).drain()

        let stored = await endToEnd.storedMessageIds()
        XCTAssertEqual(stored, ["srv_2"])
        let left = try await queue.pendingPlaintextErasures(recordedBefore: .distantFuture, limit: 10)
        XCTAssertEqual(left, [])
    }

    func test_aFreshDeletion_waitsItsGrace() async throws {
        let queue = try await persistence(with: [("cid_1", "srv_1")])
        let endToEnd = MockEndToEndMessaging()
        await endToEnd.remember(content(), from: "me", as: ["srv_1"])
        try await queue.markDeleted(localId: "srv_1", deletedAt: Date())

        await janitor(endToEnd, queue, at: Date()).drain()

        XCTAssertEqual(endToEnd.erasedIds, [])
        let stored = await endToEnd.storedMessageIds()
        XCTAssertEqual(stored, ["srv_1"], "une suppression qui échoue sur le réseau se rétablit avec son clair")
    }

    func test_aRefusingVault_keepsTheErasuresForTheNextSession() async throws {
        let queue = try await persistence(with: [("cid_1", "srv_1")])
        let endToEnd = MockEndToEndMessaging()
        endToEnd.erasureAccepted = false
        try await queue.markDeleted(localId: "srv_1", deletedAt: Date())

        await janitor(endToEnd, queue, at: Date().addingTimeInterval(EndToEndPlaintextJanitor.grace + 1)).drain()

        let left = try await queue.pendingPlaintextErasures(recordedBefore: .distantFuture, limit: 10)
        XCTAssertEqual(Set(left), ["cid_1", "srv_1"])
    }
}
