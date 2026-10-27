import XCTest
import GRDB
import MeeshyE2EE
import MeeshySDK
@testable import Meeshy

/// Un message effacé dans la base des messages vide le coffre E2EE (#13001) :
/// une suppression lancée ici seulement une fois confirmée, et seulement pour
/// le compte de cette base.
@MainActor
final class EndToEndPlaintextJanitorTests: XCTestCase {
    private let conversationId = "00000000000000000000ab01"
    private let me = "00000000000000000000aa11"

    private func persistence(with rows: [(local: String, server: String)]) async throws -> MessagePersistenceActor {
        let queue = try DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: queue)
        let records = rows.map { row -> MessageRecord in
            var record = OptimisticTextRecordBuilder.record(
                localId: row.local, conversationId: conversationId, senderId: "00000000000000000000bb22", sender: nil,
                text: "", originalLanguage: "fr", messageType: "text", replyToId: nil, storyReplyToId: nil,
                forwardedFromId: nil, forwardedFromConversationId: nil, replyToJson: nil, effectFlags: 0,
                maxViewOnceCount: nil, locationJson: nil, stickerJson: nil, sealedEndToEnd: true,
                now: Date(), ephemeralDuration: nil
            )
            record.serverId = row.server
            return record
        }
        try await queue.write { db in try records.forEach { try $0.insert(db) } }
        return MessagePersistenceActor(dbWriter: queue, currentUserId: me)
    }

    private func content() -> E2EEContent {
        E2EEContent(text: "à effacer", language: "fr", replyTo: nil, conversationId: conversationId, clientMessageId: "cid_1", sentAt: Date())
    }

    private func janitor(_ endToEnd: MockEndToEndMessaging, _ queue: MessagePersistenceActor) -> EndToEndPlaintextJanitor {
        EndToEndPlaintextJanitor(endToEnd: endToEnd, queue: { await queue.plaintextErasures })
    }

    func test_aMessageDeletedByTheServer_leavesTheVault_andTheQueue() async throws {
        let queue = try await persistence(with: [("cid_1", "srv_1"), ("cid_2", "srv_2")])
        let endToEnd = MockEndToEndMessaging()
        await endToEnd.remember(content(), from: me, as: ["cid_1", "srv_1", "srv_2"])
        try await queue.markDeleted(localId: "srv_1", deletedAt: Date())

        await janitor(endToEnd, queue).drain()

        XCTAssertEqual(endToEnd.storedIds, ["srv_2"])
        let left = try await queue.plaintextErasures.pending(limit: 10)
        XCTAssertEqual(left, [])
    }

    func test_aLocalDeletion_keepsItsClear_untilTheServerConfirmsIt() async throws {
        let queue = try await persistence(with: [("cid_1", "srv_1")])
        let endToEnd = MockEndToEndMessaging()
        await endToEnd.remember(content(), from: me, as: ["cid_1", "srv_1"])
        try await queue.markDeletedAwaitingConfirmation(localId: "srv_1", deletedAt: Date())

        await janitor(endToEnd, queue).drain()
        XCTAssertEqual(endToEnd.storedIds, ["cid_1", "srv_1"], "une suppression pas encore acceptée peut se rétablir")

        try await queue.confirmDeletion(localId: "srv_1")
        await janitor(endToEnd, queue).drain()
        XCTAssertEqual(endToEnd.storedIds, [])
    }

    func test_aLocalDeletionRefusedLater_keepsItsClear() async throws {
        let queue = try await persistence(with: [("cid_1", "srv_1")])
        let endToEnd = MockEndToEndMessaging()
        await endToEnd.remember(content(), from: me, as: ["srv_1"])
        try await queue.markDeletedAwaitingConfirmation(localId: "srv_1", deletedAt: Date())
        await janitor(endToEnd, queue).drain()

        try await queue.markUndeleted(localId: "srv_1")
        await janitor(endToEnd, queue).drain()

        XCTAssertEqual(endToEnd.storedIds, ["srv_1"])
    }

    func test_aRefusingVault_keepsTheErasuresForTheNextSession() async throws {
        let queue = try await persistence(with: [("cid_1", "srv_1")])
        let endToEnd = MockEndToEndMessaging()
        endToEnd.erasureAccepted = false
        try await queue.markDeleted(localId: "srv_1", deletedAt: Date())

        await janitor(endToEnd, queue).drain()

        let left = try await queue.plaintextErasures.pending(limit: 10)
        XCTAssertEqual(Set(left), ["cid_1", "srv_1"])
    }

    func test_theVaultIsErasedOnlyForTheQueuesAccount() async throws {
        let queue = try await persistence(with: [("cid_1", "srv_1")])
        let endToEnd = MockEndToEndMessaging()
        endToEnd.vaultAccount = "00000000000000000000cc33"
        try await queue.markDeleted(localId: "srv_1", deletedAt: Date())

        await janitor(endToEnd, queue).drain()

        XCTAssertEqual(endToEnd.erasedIds.count, 1)
        let left = try await queue.plaintextErasures.pending(limit: 10)
        XCTAssertEqual(Set(left), ["cid_1", "srv_1"], "le coffre d'un autre compte ne se vide pas pour celui-ci")
    }

    /// Audit (M-2) — l'enveloppe d'un message supprimé pendant que l'appareil
    /// était hors ligne s'ouvre APRÈS l'effacement : son clair repart aussitôt.
    func test_anEnvelopeOpenedAfterTheErasure_leavesTheVaultAgain() async throws {
        let queue = try await persistence(with: [("srv_1", "srv_1")])
        let endToEnd = MockEndToEndMessaging()
        try await queue.markDeleted(localId: "srv_1", deletedAt: Date())
        await janitor(endToEnd, queue).drain()
        await endToEnd.remember(content(), from: me, as: ["srv_1"])

        await janitor(endToEnd, queue).reconsider("srv_1")

        XCTAssertEqual(endToEnd.storedIds, [])
    }

    func test_aLiveMessageOpened_isNotErased() async throws {
        let queue = try await persistence(with: [("srv_1", "srv_1")])
        let endToEnd = MockEndToEndMessaging()
        await endToEnd.remember(content(), from: me, as: ["srv_1"])

        await janitor(endToEnd, queue).reconsider("srv_1")

        XCTAssertEqual(endToEnd.storedIds, ["srv_1"])
    }
}
