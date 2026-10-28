import XCTest
import Combine
import GRDB
@testable import MeeshySDK

/// `attachment:deleted` : la pièce quitte le cache des messages, l'index des médias, la base du compte (par la mutation
/// temps réel) et l'aperçu de la liste.
final class ConversationSyncEngineAttachmentDeletionTests: XCTestCase {

    private func makeEngine() throws -> (engine: ConversationSyncEngine, socket: MockMessageSocket, cache: CacheCoordinator) {
        let db = try DatabaseQueue()
        try AppDatabase.runMigrations(on: db)
        let socket = MockMessageSocket()
        let cache = CacheCoordinator(messageSocket: socket, socialSocket: MockSocialSocket(), db: db)
        let engine = ConversationSyncEngine(
            cache: cache, conversationService: MockConversationService(), messageService: MockMessageService(),
            messageSocket: socket, socialSocket: MockSocialSocket(), api: MockAPIClient(), syncDelta: MockSyncDeltaMuet()
        )
        return (engine, socket, cache)
    }

    private func waitUntil(timeout: TimeInterval = 2, _ condition: () async -> Bool) async -> Bool {
        let deadline = Date().addingTimeInterval(timeout)
        while Date() < deadline {
            if await condition() { return true }
            try? await Task.sleep(nanoseconds: 15_000_000)
        }
        return await condition()
    }

    private func photo(_ id: String) -> MeeshyMessageAttachment { MeeshyMessageAttachment(id: id, mimeType: "image/jpeg") }

    private func message(_ text: String, _ pieces: [String], conversationId: String = "c1") -> MeeshyMessage {
        MeeshyMessage(id: "m1", conversationId: conversationId, content: text, createdAt: Date(),
                      attachments: pieces.map(photo))
    }

    private func removal(_ attachmentId: String = "a", conversationId: String = "c1") -> AttachmentDeletedEvent {
        AttachmentDeletedEvent(conversationId: conversationId, messageId: "m1", attachmentId: attachmentId)
    }

    // MARK: - Cache des messages

    func test_theCachedMessageLosesThePieceAndKeepsItsText() async throws {
        let (engine, _, cache) = try makeEngine()
        try await cache.messages.save([message("légende", ["a", "b"])], for: "c1")
        await engine.startSocketRelay()

        AttachmentDeletionChannel.shared.deleted.send(removal("a"))

        let done = await waitUntil { await cache.messages.load(for: "c1").snapshot()?.first?.attachments.map(\.id) == ["b"] }
        XCTAssertTrue(done)
        let kept = await cache.messages.load(for: "c1").snapshot()?.first
        XCTAssertNil(kept?.deletedAt)
        XCTAssertEqual(kept?.content, "légende")
    }

    func test_aMessageLeftWithNeitherTextNorPieceBecomesATombstone() async throws {
        let (engine, _, cache) = try makeEngine()
        try await cache.messages.save([message("", ["a"])], for: "c1")
        await engine.startSocketRelay()

        AttachmentDeletionChannel.shared.deleted.send(removal("a"))

        let done = await waitUntil { await cache.messages.load(for: "c1").snapshot()?.first?.deletedAt != nil }
        XCTAssertTrue(done)
    }

    func test_aReplayChangesNothing() async throws {
        let (engine, _, cache) = try makeEngine()
        try await cache.messages.save([message("x", ["a", "b"])], for: "c1")
        await engine.startSocketRelay()

        AttachmentDeletionChannel.shared.deleted.send(removal("a"))
        AttachmentDeletionChannel.shared.deleted.send(removal("a"))

        let done = await waitUntil { await cache.messages.load(for: "c1").snapshot()?.first?.attachments.map(\.id) == ["b"] }
        XCTAssertTrue(done)
    }

    func test_aForgedConversationLeavesTheRealMessageIntact() async throws {
        let (engine, _, cache) = try makeEngine()
        try await cache.messages.save([message("", ["a"], conversationId: "c1")], for: "c1")
        try await cache.messages.save([], for: "autre")
        await engine.startSocketRelay()
        let collector = RealtimeMutationCollector()
        engine.realtimeMessagePersistor = { await collector.append($0) }

        AttachmentDeletionChannel.shared.deleted.send(removal("a", conversationId: "autre"))
        _ = await waitUntil { await !collector.mutations.isEmpty }

        let intact = await cache.messages.load(for: "c1").snapshot()?.first
        XCTAssertEqual(intact?.attachments.map(\.id), ["a"])
        XCTAssertNil(intact?.deletedAt)
    }

    // MARK: - Base du compte

    func test_theRemovalIsForwardedToTheAccountStoreWithItsConversation() async throws {
        let (engine, _, _) = try makeEngine()
        let collector = RealtimeMutationCollector()
        engine.realtimeMessagePersistor = { await collector.append($0) }
        await engine.startSocketRelay()

        AttachmentDeletionChannel.shared.deleted.send(removal("a"))

        let received = await waitUntil { await collector.mutations.contains {
            if case let .attachmentRemoved(messageId, conversationId, attachmentId, _) = $0 {
                return messageId == "m1" && conversationId == "c1" && attachmentId == "a"
            }
            return false
        } }
        XCTAssertTrue(received)
    }

    // MARK: - Écran médias

    func test_thePieceLeavesTheMediaIndexOfItsConversationOnly() async throws {
        let (engine, _, cache) = try makeEngine()
        let carrier = message("", ["a", "b"])
        try await cache.conversationMedia.save([carrier], for: "c1")
        try await cache.conversationMedia.save([carrier], for: "c2")
        await engine.startSocketRelay()

        AttachmentDeletionChannel.shared.deleted.send(removal("a"))

        let done = await waitUntil { await cache.conversationMedia.load(for: "c1").snapshot()?.first?.attachments.map(\.id) == ["b"] }
        XCTAssertTrue(done)
        let other = await cache.conversationMedia.load(for: "c2").snapshot()?.first
        XCTAssertEqual(other?.attachments.map(\.id), ["a", "b"])
    }

    func test_aCarrierWithNoPieceOfItsKindLeavesTheIndex() async throws {
        let (engine, _, cache) = try makeEngine()
        try await cache.conversationMedia.save([message("", ["a"])], for: "c1")
        await engine.startSocketRelay()

        AttachmentDeletionChannel.shared.deleted.send(removal("a"))

        let done = await waitUntil { await cache.conversationMedia.load(for: "c1").snapshot()?.isEmpty == true }
        XCTAssertTrue(done)
    }

    // MARK: - Aperçu de la liste

    private func conversation(lastPreview: String?, pieces: [String]) -> MeeshyConversation {
        var row = TestFactories.makeConversation(id: "c1")
        row.applyLastMessage(LastMessageFacet(
            id: "m1", preview: lastPreview, senderName: "Zoé", at: Date(),
            attachments: pieces.map(photo), attachmentCount: pieces.count,
            nature: LastMessageNature(messageType: "image", attachmentSummary: LastMessageAttachmentSummary(attachments: pieces.map(photo)))
        ))
        return row
    }

    func test_theListRowRecountsItsPieces() async throws {
        let (engine, _, cache) = try makeEngine()
        try await cache.conversations.save([conversation(lastPreview: "légende", pieces: ["a", "b"])], for: "list")
        await engine.startSocketRelay()

        AttachmentDeletionChannel.shared.deleted.send(removal("a"))

        let done = await waitUntil { await cache.conversations.load(for: "list").snapshot()?.first?.lastMessageAttachments.map(\.id) == ["b"] }
        XCTAssertTrue(done)
        let row = await cache.conversations.load(for: "list").snapshot()?.first
        XCTAssertEqual(row?.lastMessageNature?.attachmentSummary?.count, 1)
        XCTAssertEqual(row?.lastMessagePreview, "légende")
    }

    func test_anEmptiedLastMessageGivesTheRowBackItsPredecessor() async throws {
        let (engine, _, cache) = try makeEngine()
        let before = MeeshyMessage(id: "m0", conversationId: "c1", content: "avant", createdAt: Date(timeIntervalSince1970: 1_700_000_000))
        try await cache.messages.save([before, message("", ["a"])], for: "c1")
        try await cache.conversations.save([conversation(lastPreview: nil, pieces: ["a"])], for: "list")
        await engine.startSocketRelay()

        AttachmentDeletionChannel.shared.deleted.send(removal("a"))

        let done = await waitUntil { await cache.conversations.load(for: "list").snapshot()?.first?.lastMessageId == "m0" }
        XCTAssertTrue(done)
    }

    func test_aProtectedPredecessorKeepsItsLabelAndNeverItsClearText() async throws {
        let (engine, _, cache) = try makeEngine()
        var sealed = MeeshyMessage(id: "m0", conversationId: "c1", content: "secret en clair", createdAt: Date(timeIntervalSince1970: 1_700_000_000))
        sealed.isEncrypted = true
        try await cache.messages.save([sealed, message("", ["a"])], for: "c1")
        try await cache.conversations.save([conversation(lastPreview: nil, pieces: ["a"])], for: "list")
        await engine.startSocketRelay()

        AttachmentDeletionChannel.shared.deleted.send(removal("a"))

        let done = await waitUntil { await cache.conversations.load(for: "list").snapshot()?.first?.lastMessageId == "m0" }
        XCTAssertTrue(done)
        let row = await cache.conversations.load(for: "list").snapshot()?.first
        XCTAssertNil(row?.lastMessagePreview)
        XCTAssertEqual(row?.lastMessageNature?.isEncrypted, true)
    }

    func test_aViewOncePhotoKeepsItsProtectionWhenAnotherPieceLeaves() async throws {
        let (engine, _, cache) = try makeEngine()
        var row = conversation(lastPreview: nil, pieces: ["a", "b"])
        row.lastMessageIsViewOnce = true
        try await cache.conversations.save([row], for: "list")
        await engine.startSocketRelay()

        AttachmentDeletionChannel.shared.deleted.send(removal("a"))

        let done = await waitUntil { await cache.conversations.load(for: "list").snapshot()?.first?.lastMessageAttachments.count == 1 }
        XCTAssertTrue(done)
        let after = await cache.conversations.load(for: "list").snapshot()?.first
        XCTAssertEqual(after?.lastMessageIsViewOnce, true)
        XCTAssertNil(after?.lastMessagePreview)
    }

    func test_aRowServedWithOnlyItsSummaryReadsThePiecesOfTheCachedMessage() {
        var row = TestFactories.makeConversation(id: "c1")
        row.applyLastMessage(LastMessageFacet(id: "m1", preview: "légende", senderName: "Zoé", at: Date()))

        let result = ConversationListLastMessage.removingAttachment(
            "a", ofMessage: "m1", conversationId: "c1", fallbackAttachments: [photo("a"), photo("b")], in: [row])

        guard case let .updated(rows) = result else { return XCTFail("la ligne doit suivre") }
        XCTAssertEqual(rows.first?.lastMessageAttachments.map(\.id), ["b"])
    }

    func test_aRowOfAnotherMessageIsLeftAlone() {
        let row = conversation(lastPreview: "x", pieces: ["a"])

        let result = ConversationListLastMessage.removingAttachment(
            "a", ofMessage: "autre", conversationId: "c1", fallbackAttachments: [], in: [row])

        guard case .unchanged = result else { return XCTFail("aucune écriture attendue") }
    }
}
