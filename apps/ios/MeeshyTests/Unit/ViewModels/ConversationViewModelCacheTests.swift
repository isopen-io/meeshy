import XCTest
import GRDB
@testable import Meeshy
import MeeshySDK

/// Tests for ConversationViewModel lazy-computed index caches.
///
/// Verifies that `cachedLastReceivedIndex` and `cachedLastSentIndex` memoize
/// correctly, return nil when no matching message exists, and reset when
/// `messages` changes structurally.
@MainActor
final class ConversationViewModelCacheTests: XCTestCase {

    private let conversationId = "000000000000000000000001"
    private let myUserId = "000000000000000000000099"
    private let otherUserId = "000000000000000000000002"

    // MARK: - Factory

    private func makeSUT() -> ConversationViewModel {
        let authManager = MockAuthManager()
        let currentUser = MeeshyUser(id: myUserId, username: "me", displayName: "Me")
        authManager.simulateLoggedIn(user: currentUser)

        let pool = try! makeInMemoryPool()
        let sut = ConversationViewModel(
            conversationId: conversationId,
            unreadCount: 0,
            isDirect: false,
            participantUserId: nil,
            anonymousSession: nil,
            authManager: authManager,
            messageService: MockMessageService(),
            conversationService: MockConversationService(),
            reactionService: MockReactionService(),
            reportService: MockReportService(),
            messageSocket: MockMessageSocket(),
            dependencies: ConversationDependencies(
                dbPool: pool,
                persistence: MessagePersistenceActor(dbWriter: pool)
            )
        )
        sut.start()
        return sut
    }

    private func makeInMemoryPool() throws -> DatabaseQueue {
        let db = try DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: db)
        return db
    }

    private func makeMessage(
        id: String,
        isMe: Bool,
        createdAt: Date = Date()
    ) -> Message {
        Message(
            id: id,
            conversationId: conversationId,
            senderId: isMe ? myUserId : otherUserId,
            content: "msg",
            createdAt: createdAt,
            updatedAt: createdAt,
            isMe: isMe
        )
    }

    // MARK: - cachedLastReceivedIndex (messages from others)

    func test_cachedLastReceivedIndex_emptyMessages_returnsNil() {
        let sut = makeSUT()
        sut.messages = []
        XCTAssertNil(sut.cachedLastReceivedIndex)
    }

    func test_cachedLastReceivedIndex_allMine_returnsNil() {
        let sut = makeSUT()
        sut.messages = [
            makeMessage(id: "m1", isMe: true),
            makeMessage(id: "m2", isMe: true),
        ]
        XCTAssertNil(sut.cachedLastReceivedIndex,
            "All-my-messages list has no received messages, index must be nil")
    }

    func test_cachedLastReceivedIndex_mixedMessages_returnsLastOthersIndex() {
        let sut = makeSUT()
        sut.messages = [
            makeMessage(id: "m1", isMe: false), // index 0
            makeMessage(id: "m2", isMe: true),  // index 1
            makeMessage(id: "m3", isMe: false), // index 2 — last received
            makeMessage(id: "m4", isMe: true),  // index 3
        ]
        XCTAssertEqual(sut.cachedLastReceivedIndex, 2,
            "Last received message is at index 2")
    }

    func test_cachedLastReceivedIndex_memoizedOnSecondCall() {
        let sut = makeSUT()
        sut.messages = [
            makeMessage(id: "m1", isMe: false),
            makeMessage(id: "m2", isMe: true),
        ]
        let first = sut.cachedLastReceivedIndex
        let second = sut.cachedLastReceivedIndex
        XCTAssertEqual(first, second,
            "Cache must return the same value on repeated calls without messages changing")
    }

    func test_cachedLastReceivedIndex_resetAfterMessagesChange() {
        let sut = makeSUT()
        sut.messages = [makeMessage(id: "m1", isMe: false)] // index 0
        XCTAssertEqual(sut.cachedLastReceivedIndex, 0)

        // Prepend a new received message — last received is now index 1
        sut.messages = [
            makeMessage(id: "m0", isMe: false), // index 0
            makeMessage(id: "m1", isMe: false), // index 1 — new last received
        ]
        XCTAssertEqual(sut.cachedLastReceivedIndex, 1,
            "Cache must recompute after messages array changes")
    }

    func test_cachedLastReceivedIndex_clearedWhenMessagesBecomesEmpty() {
        let sut = makeSUT()
        sut.messages = [makeMessage(id: "m1", isMe: false)]
        XCTAssertEqual(sut.cachedLastReceivedIndex, 0)

        sut.messages = []
        XCTAssertNil(sut.cachedLastReceivedIndex,
            "Cache must return nil after messages is cleared")
    }

    // MARK: - cachedLastSentIndex (my messages)

    func test_cachedLastSentIndex_emptyMessages_returnsNil() {
        let sut = makeSUT()
        sut.messages = []
        XCTAssertNil(sut.cachedLastSentIndex)
    }

    func test_cachedLastSentIndex_allOthers_returnsNil() {
        let sut = makeSUT()
        sut.messages = [
            makeMessage(id: "m1", isMe: false),
            makeMessage(id: "m2", isMe: false),
        ]
        XCTAssertNil(sut.cachedLastSentIndex,
            "All-others list has no sent messages, index must be nil")
    }

    func test_cachedLastSentIndex_mixedMessages_returnsLastMineIndex() {
        let sut = makeSUT()
        sut.messages = [
            makeMessage(id: "m1", isMe: true),  // index 0
            makeMessage(id: "m2", isMe: false), // index 1
            makeMessage(id: "m3", isMe: true),  // index 2 — last sent
            makeMessage(id: "m4", isMe: false), // index 3
        ]
        XCTAssertEqual(sut.cachedLastSentIndex, 2,
            "Last sent message is at index 2")
    }

    func test_cachedLastSentIndex_memoizedOnSecondCall() {
        let sut = makeSUT()
        sut.messages = [
            makeMessage(id: "m1", isMe: true),
            makeMessage(id: "m2", isMe: false),
        ]
        let first = sut.cachedLastSentIndex
        let second = sut.cachedLastSentIndex
        XCTAssertEqual(first, second,
            "Cache must return the same value on repeated calls without messages changing")
    }

    func test_cachedLastSentIndex_resetAfterMessagesChange() {
        let sut = makeSUT()
        sut.messages = [makeMessage(id: "m1", isMe: true)] // index 0
        XCTAssertEqual(sut.cachedLastSentIndex, 0)

        // Append a new sent message — last sent is now index 1
        sut.messages = [
            makeMessage(id: "m1", isMe: true), // index 0
            makeMessage(id: "m2", isMe: true), // index 1 — new last sent
        ]
        XCTAssertEqual(sut.cachedLastSentIndex, 1,
            "Cache must recompute after messages array changes")
    }

    // MARK: - lastReceivedMessageId / lastSentMessageId convenience

    func test_lastReceivedMessageId_noReceivedMessages_returnsNil() {
        let sut = makeSUT()
        sut.messages = [makeMessage(id: "m1", isMe: true)]
        XCTAssertNil(sut.lastReceivedMessageId)
    }

    func test_lastReceivedMessageId_returnsIdOfLastReceivedMessage() {
        let sut = makeSUT()
        sut.messages = [
            makeMessage(id: "m1", isMe: false),
            makeMessage(id: "m2", isMe: true),
            makeMessage(id: "m3", isMe: false),
        ]
        XCTAssertEqual(sut.lastReceivedMessageId, "m3")
    }

    func test_lastSentMessageId_noSentMessages_returnsNil() {
        let sut = makeSUT()
        sut.messages = [makeMessage(id: "m1", isMe: false)]
        XCTAssertNil(sut.lastSentMessageId)
    }

    func test_lastSentMessageId_returnsIdOfLastSentMessage() {
        let sut = makeSUT()
        sut.messages = [
            makeMessage(id: "m1", isMe: true),
            makeMessage(id: "m2", isMe: false),
            makeMessage(id: "m3", isMe: true),
        ]
        XCTAssertEqual(sut.lastSentMessageId, "m3")
    }

    // MARK: - Cache independence

    func test_receivedAndSentCaches_areIndependent() {
        let sut = makeSUT()
        sut.messages = [
            makeMessage(id: "r1", isMe: false), // index 0
            makeMessage(id: "s1", isMe: true),  // index 1
            makeMessage(id: "r2", isMe: false), // index 2
            makeMessage(id: "s2", isMe: true),  // index 3
        ]
        XCTAssertEqual(sut.cachedLastReceivedIndex, 2, "Last received at index 2")
        XCTAssertEqual(sut.cachedLastSentIndex, 3, "Last sent at index 3")
        XCTAssertEqual(sut.lastReceivedMessageId, "r2")
        XCTAssertEqual(sut.lastSentMessageId, "s2")
    }

    // MARK: - vm-conv-expired-metadata-01 — .expired/.empty hydratent les métadonnées

    private func makeSUTWithSeams(conversationId: String) -> (ConversationViewModel, DatabaseQueue, MockMessageService) {
        let authManager = MockAuthManager()
        let currentUser = MeeshyUser(id: myUserId, username: "me", displayName: "Me")
        authManager.simulateLoggedIn(user: currentUser)

        let pool = try! makeInMemoryPool()
        let messageService = MockMessageService()
        let sut = ConversationViewModel(
            conversationId: conversationId,
            unreadCount: 0,
            isDirect: false,
            participantUserId: nil,
            anonymousSession: nil,
            authManager: authManager,
            messageService: messageService,
            conversationService: MockConversationService(),
            reactionService: MockReactionService(),
            reportService: MockReportService(),
            messageSocket: MockMessageSocket(),
            dependencies: ConversationDependencies(
                dbPool: pool,
                persistence: MessagePersistenceActor(dbWriter: pool)
            )
        )
        sut.start()
        return (sut, pool, messageService)
    }

    func test_loadMessages_emptyCacheWithGRDBRows_hydratesTranscriptionBeforeNetwork() async throws {
        // Clé unique → CacheCoordinator .empty garanti (l'ancienne branche
        // .expired/.empty n'appelait QUE le réseau, sans hydrater GRDB).
        let convId = "00000000000000000000c0d4"
        let (sut, pool, messageService) = makeSUTWithSeams(conversationId: convId)
        // Fixture encodée par le VRAI type (le décodage synthétisé de
        // MeeshyMessageAttachment exige fileName/filePath/uploadedBy/… — un
        // JSON minimal échoue en silence dans le guard try? de l'hydratation).
        var attachment = MeeshyMessageAttachment(
            id: "att-audio-1",
            messageId: nil,
            fileName: "vocal.m4a",
            originalName: "vocal.m4a",
            mimeType: "audio/mp4",
            fileSize: 1_234,
            filePath: "",
            fileUrl: "https://cdn.example/vocal.m4a",
            duration: 3_000,
            uploadedBy: "sender"
        )
        attachment.transcription = try JSONDecoder().decode(
            MeeshyMessageAttachment.EmbeddedTranscription.self,
            from: Data(#"{"text":"bonjour","language":"fr"}"#.utf8)
        )
        let attachmentsJson = try JSONEncoder().encode([attachment])
        let senderId = otherUserId
        try await pool.write { [attachmentsJson, senderId] db in
            try MessageRecord(
                localId: "m-audio-1", serverId: "m-audio-1",
                conversationId: convId, senderId: senderId,
                content: "vocal", originalLanguage: "fr",
                messageType: "text", messageSource: "user", contentType: "audio",
                state: .delivered, retryCount: 0, lastError: nil,
                isEncrypted: false, encryptionMode: nil, encryptedPayload: nil,
                replyToId: nil, storyReplyToId: nil,
                forwardedFromId: nil, forwardedFromConversationId: nil,
                replyToJson: nil, forwardedFromJson: nil,
                expiresAt: nil, effectFlags: 0,
                maxViewOnceCount: nil, viewOnceCount: 0,
                isEdited: false, editedAt: nil, deletedAt: nil,
                pinnedAt: nil, pinnedBy: nil,
                senderName: nil, senderUsername: nil,
                senderColor: nil, senderAvatarURL: nil,
                deliveredCount: 0, readCount: 0,
                deliveredToAllAt: nil, readByAllAt: nil,
                createdAt: Date(), sentAt: nil,
                deliveredAt: nil, readAt: nil, updatedAt: Date(),
                attachmentsJson: attachmentsJson, reactionsJson: nil,
                reactionCount: 0, currentUserReactionsJson: nil,
                mentionedUsersJson: nil,
                cachedBubbleWidth: nil, cachedBubbleHeight: nil,
                cachedLastLineWidth: nil, cachedLineCount: nil,
                cachedTimestampInline: nil,
                layoutVersion: 0, layoutMaxWidth: nil, changeVersion: 0
            ).insert(db)
        }
        messageService.listResult = .failure(MeeshyError.network(.noConnection))

        await sut.loadMessages()

        XCTAssertEqual(
            sut.messageTranscriptions["m-audio-1"]?.text, "bonjour",
            "offline (réseau KO), la transcription persistée en GRDB doit être hydratée — l'ancienne branche .expired/.empty n'hydratait jamais"
        )
        // La peinture traverse `subscribeToMessageStore`, qui attend un tick de
        // runloop (`DispatchQueue.main.async`) pour ne jamais publier pendant
        // une passe de rendu : on l'ATTEND, on ne la suppose pas synchrone.
        let painted = await MessageStoreObservationHelper.awaitMessage(in: sut) { $0.id == "m-audio-1" }
        XCTAssertNotNil(painted, "le message GRDB est peint même sans réseau")
    }

}
