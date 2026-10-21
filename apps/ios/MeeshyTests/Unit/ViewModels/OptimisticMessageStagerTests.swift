import XCTest
@testable import Meeshy
import MeeshySDK

@MainActor
final class OptimisticMessageStagerTests: XCTestCase {

    private struct InsertRefused: Error {}

    private final class PersistenceSpy: OptimisticMessagePersisting, @unchecked Sendable {
        private let lock = NSLock()
        private var stored: [MessageRecord] = []
        private var refuses = false

        var records: [MessageRecord] { lock.withLock { stored } }
        func refuseInserts() { lock.withLock { refuses = true } }

        func insertOptimistic(_ record: MessageRecord) async throws {
            try lock.withLock {
                if refuses { throw InsertRefused() }
                stored.append(record)
            }
        }

        func markOptimisticFailed(localId: String, reason: String) async throws {}
    }

    private final class ThreadCacheSpy: @unchecked Sendable {
        private let lock = NSLock()
        private var thread: [Message]
        private var mergeCount = 0

        init(seed: [Message] = []) { thread = seed }

        var cache: [Message] { lock.withLock { thread } }
        var merges: Int { lock.withLock { mergeCount } }

        func merge(_ mutate: @Sendable ([Message]) -> [Message]) {
            lock.withLock {
                mergeCount += 1
                thread = mutate(thread)
            }
        }
    }

    private let author = OptimisticAuthor(senderId: "p-me", sender: nil)

    private func makeSUT(cache: ThreadCacheSpy = ThreadCacheSpy()) -> (sut: OptimisticMessageStager, persistence: PersistenceSpy, engine: MockConversationSyncEngine, cache: ThreadCacheSpy) {
        let persistence = PersistenceSpy()
        let engine = MockConversationSyncEngine()
        let sut = OptimisticMessageStager(
            persistence: persistence,
            listSink: engine,
            threadCache: { _, mutate in cache.merge(mutate) }
        )
        return (sut, persistence, engine, cache)
    }

    private func makeOutgoing(text: String = "Salut") -> OutgoingMessage {
        OutgoingMessage(conversationId: ConversationID("conv-1"), content: text, relation: .none, attachments: .none)
    }

    private func makeContext(intent: MessageProtectionIntent = .none) -> SendAttemptContext {
        SendAttemptContext(clientMessageId: MessageID("temp_1"), startedAt: Date(), intent: intent, language: "fr", reusesExistingRow: false)
    }

    private func waitUntil(_ condition: @MainActor () -> Bool) async {
        for _ in 0..<200 where !condition() { try? await Task.sleep(nanoseconds: 10_000_000) }
    }

    func test_stageOnline_insertsOneSendingRowCarryingUnitedEffectFlagsAndDuration_thenPublishesListFacet() async {
        let (sut, persistence, engine, _) = makeSUT()

        await sut.stageOnline(
            makeOutgoing(), context: makeContext(intent: MessageProtectionIntent(ephemeralDurationSeconds: 3_600)),
            author: author, conversationId: "conv-1", replyReference: nil, effectFlags: 42
        )

        XCTAssertEqual(persistence.records.count, 1)
        let record = persistence.records[0]
        XCTAssertEqual(record.localId, "temp_1")
        XCTAssertEqual(record.state, .sending)
        XCTAssertEqual(record.effectFlags, 42)
        XCTAssertEqual(record.ephemeralDuration, 3_600)
        XCTAssertNil(record.expiresAt)
        XCTAssertEqual(engine.updateConversationAfterSendCallCount, 1)
    }

    func test_stageOnline_whenInsertThrows_publishesNoListFacet() async {
        let (sut, persistence, engine, _) = makeSUT()
        persistence.refuseInserts()

        await sut.stageOnline(
            makeOutgoing(), context: makeContext(), author: author, conversationId: "conv-1", replyReference: nil, effectFlags: 0
        )

        XCTAssertTrue(persistence.records.isEmpty)
        XCTAssertEqual(engine.updateConversationAfterSendCallCount, 0)
    }

    func test_stageOffline_insertsRowWithoutClientDeadline_mergesItIntoThreadCacheOnce_andReturnsTheMessage() async {
        let (sut, persistence, engine, cache) = makeSUT()

        let message = await sut.stageOffline(
            makeOutgoing(), clientMessageId: MessageID("offline_1"), intent: MessageProtectionIntent(ephemeralDurationSeconds: 60),
            author: author, conversationId: "conv-1", language: "fr", effectFlags: 0
        )

        await waitUntil { cache.merges == 1 && engine.updateConversationAfterSendCallCount == 1 }
        XCTAssertEqual(message.id, "offline_1")
        XCTAssertEqual(message.deliveryStatus, .sending)
        XCTAssertEqual(persistence.records.map(\.localId), ["offline_1"])
        XCTAssertNil(persistence.records.first?.expiresAt)
        XCTAssertEqual(persistence.records.first?.ephemeralDuration, 60)
        XCTAssertEqual(cache.cache.map(\.id), ["offline_1"])
        XCTAssertEqual(engine.updateConversationAfterSendCallCount, 1)
    }

    func test_stageOffline_whenCacheAlreadyHoldsTheId_leavesCacheUnchanged() async {
        let already = Message(id: "offline_1", conversationId: "conv-1", content: "déjà là")
        let (sut, _, _, cache) = makeSUT(cache: ThreadCacheSpy(seed: [already]))

        _ = await sut.stageOffline(
            makeOutgoing(), clientMessageId: MessageID("offline_1"), intent: .none,
            author: author, conversationId: "conv-1", language: "fr", effectFlags: 0
        )

        await waitUntil { cache.merges == 1 }
        XCTAssertEqual(cache.cache.map(\.content), ["déjà là"])
    }

    func test_stageMedia_carriesProtectionLifecycleFlagsAndEphemeralDuration_andListFacetWithAttachments() async {
        let (sut, persistence, engine, _) = makeSUT()
        let protection = MessageProtectionIntent(ephemeralDurationSeconds: 600)
        let photo = MessageAttachment(id: "a1", mimeType: "image/jpeg", fileUrl: "file:///tmp/a1.jpg")

        sut.stageMedia(
            OptimisticMediaDraft(
                conversationId: "conv-1", tempId: "temp_media", content: "", attachments: [photo], messageType: .image,
                replyToId: nil, storyReplyToId: nil, replyReference: nil, originalLanguage: "fr", sticker: nil, protection: protection
            ),
            author: author
        )

        await waitUntil { persistence.records.count == 1 && engine.updateConversationAfterSendCallCount == 1 }
        let record = persistence.records.first
        XCTAssertEqual(record?.localId, "temp_media")
        XCTAssertEqual(record?.effectFlags, protection.lifecycleFlags.rawValue)
        XCTAssertEqual(record?.ephemeralDuration, 600)
        XCTAssertNotNil(record?.attachmentsJson)
        XCTAssertEqual(engine.updateConversationAfterSendCallCount, 1)
    }

    func test_stageMedia_withReplyReference_writesReplyToJson() async {
        let (sut, persistence, _, _) = makeSUT()
        let reference = ReplyReference(messageId: "m-quoted", authorName: "Bob", previewText: "salut")

        sut.stageMedia(
            OptimisticMediaDraft(
                conversationId: "conv-1", tempId: "temp_media", content: "légende", attachments: [], messageType: .image,
                replyToId: "m-quoted", storyReplyToId: nil, replyReference: reference, originalLanguage: "fr", sticker: nil, protection: .none
            ),
            author: author
        )

        await waitUntil { persistence.records.count == 1 }
        XCTAssertNotNil(persistence.records.first?.replyToJson)
        XCTAssertNil(persistence.records.first?.attachmentsJson)
    }
}
