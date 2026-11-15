import XCTest
import MeeshySDK
@testable import Meeshy

/// La réponse envoyée depuis la page d'une humeur (#10814) part en
/// `storyReplyToId` dans la DERNIÈRE conversation directe avec l'auteur, ou
/// dans une conversation directe créée pour elle — et elle est chiffrée
/// exactement quand le composer de la conversation la chiffrerait : selon le
/// RÉGIME de la conversation (#3707), jamais selon les clés du pair.
@MainActor
final class MoodReplySenderTests: XCTestCase {

    private func makeEntry() -> StatusEntry {
        StatusEntry(id: "mood-1", userId: "author-1", username: "Alice", avatarColor: "6366F1", moodEmoji: "😄", content: "Heureux")
    }

    private final class MockReplyQueue: NotificationReplyQueueing {
        private(set) var enqueuedItems: [OfflineQueueItem] = []
        var enqueueItemError: Error?

        func enqueue(_ item: OfflineQueueItem) async throws {
            if let enqueueItemError { throw enqueueItemError }
            enqueuedItems.append(item)
        }

        @discardableResult
        func enqueue<P: Codable & Sendable>(_ kind: OutboxKind, payload: P, conversationId: String?) async throws -> String {
            "ofqm_unused"
        }

        @discardableResult
        func enqueueComment(_ comment: CreateCommentPayload, ownerId: String?) async throws -> String {
            "ofqm_unused"
        }
    }

    private final class MockOptimisticPersistence: OptimisticMessagePersisting {
        private(set) var insertedRecords: [MessageRecord] = []
        private(set) var failedLocalIds: [String] = []

        func insertOptimistic(_ record: MessageRecord) async throws {
            insertedRecords.append(record)
        }

        func markOptimisticFailed(localId: String, reason: String) async throws {
            failedLocalIds.append(localId)
        }
    }

    private var queue = MockReplyQueue()
    private var persistence = MockOptimisticPersistence()

    private func makeSUT(endToEnd: MockEndToEndMessaging = MockEndToEndMessaging()) -> (MoodReplySender, MockConversationService, MockMessageService) {
        let conversations = MockConversationService()
        let messages = MockMessageService()
        queue = MockReplyQueue()
        persistence = MockOptimisticPersistence()
        let sut = MoodReplySender(conversations: conversations, messages: messages, endToEnd: endToEnd,
                                  replyQueue: queue, messagePersistence: persistence,
                                  currentUserId: { "me-1" }, prepareReplyQueue: {},
                                  composingLanguages: { ["fr"] }, destinationGuard: .isolated())
        return (sut, conversations, messages)
    }

    private func directConversation(id: String, encryptionMode: String? = nil) -> APIConversation {
        let mode = encryptionMode.map { #","encryptionMode":"\#($0)""# } ?? ""
        return JSONStub.decode("""
        {"id":"\(id)","type":"direct","createdAt":"2026-01-01T00:00:00.000Z"\(mode)}
        """)
    }

    func test_sendReply_existingDirectConversation_sendsThereAsAReplyToTheMood() async throws {
        let (sut, conversations, messages) = makeSUT()
        conversations.findDirectWithResult = .success(directConversation(id: "0000000000000000000000aa"))

        let conversationId = try await sut.sendReply("Trop bien", to: makeEntry())

        XCTAssertEqual(conversationId, "0000000000000000000000aa")
        XCTAssertEqual(conversations.lastFindDirectWithUserId, "author-1")
        XCTAssertEqual(conversations.createCallCount, 0)
        XCTAssertEqual(messages.lastSendConversationId, "0000000000000000000000aa")
        XCTAssertEqual(messages.lastSendRequest?.storyReplyToId, "mood-1")
        XCTAssertEqual(messages.lastSendRequest?.content, "Trop bien")
    }

    func test_sendReply_noDirectConversation_createsOneWithTheAuthor() async throws {
        let (sut, conversations, messages) = makeSUT()

        _ = try await sut.sendReply("Coucou", to: makeEntry())

        XCTAssertEqual(conversations.createCallCount, 1)
        XCTAssertEqual(conversations.lastCreateType, "direct")
        XCTAssertEqual(conversations.lastCreateParticipantIds, ["author-1"])
        XCTAssertEqual(messages.lastSendRequest?.storyReplyToId, "mood-1")
    }

    func test_sendReply_inAPlaintextConversation_staysInPlaintext_evenWhenThePeerHasKeys() async throws {
        let e2ee = MockEndToEndMessaging()
        let (sut, conversations, messages) = makeSUT(endToEnd: e2ee)
        conversations.findDirectWithResult = .success(directConversation(id: "0000000000000000000000aa"))

        _ = try await sut.sendReply("Salut", to: makeEntry())

        XCTAssertEqual(messages.lastSendRequest?.content, "Salut")
        XCTAssertNil(messages.lastSendRequest?.isEncrypted)
        XCTAssertEqual(e2ee.deliverCallCount, 0, "la passerelle refuserait un chiffré dans une conversation en clair")
    }

    func test_sendReply_inAnEncryptedConversation_leavesUnderLibsignal_neverInTheQueue() async throws {
        let e2ee = MockEndToEndMessaging()
        let (sut, conversations, messages) = makeSUT(endToEnd: e2ee)
        conversations.findDirectWithResult = .success(directConversation(id: "0000000000000000000000aa", encryptionMode: "e2ee"))

        _ = try await sut.sendReply("Salut", to: makeEntry())

        let request = try XCTUnwrap(messages.lastSendRequest)
        XCTAssertEqual(request.encryptionProtocol, "libsignal-v1")
        XCTAssertEqual(request.storyReplyToId, "mood-1")
        XCTAssertNil(request.content)
        XCTAssertEqual(e2ee.deliveredContents.first?.text, "Salut")
        XCTAssertEqual(e2ee.deliveredContents.first?.conversationId, "0000000000000000000000aa")
        XCTAssertTrue(queue.enqueuedItems.isEmpty, "la file rejoue en clair")
        XCTAssertNotNil(e2ee.remembered[request.clientMessageId], "le clair de ma réponse reste sur l'appareil")
    }

    // MARK: - #10820 — la réponse en clair passe par la file hors ligne

    /// La bulle s'inscrit dans la conversation directe AVANT le réseau, et la
    /// file garde la réponse avec sa citation : elle repartira au retour du réseau.
    func test_sendReply_inPlaintext_landsAnOptimisticBubbleAndAnOutboxRowCitingTheMood() async throws {
        let (sut, conversations, messages) = makeSUT()
        conversations.findDirectWithResult = .success(directConversation(id: "0000000000000000000000aa"))

        _ = try await sut.sendReply("Trop bien", to: makeEntry())

        let row = try XCTUnwrap(queue.enqueuedItems.first)
        XCTAssertEqual(row.conversationId, "0000000000000000000000aa")
        XCTAssertEqual(row.storyReplyToId, "mood-1")
        XCTAssertEqual(row.content, "Trop bien")
        let bubble = try XCTUnwrap(persistence.insertedRecords.first)
        XCTAssertEqual(bubble.localId, row.clientMessageId)
        XCTAssertEqual(bubble.storyReplyToId, "mood-1")
        XCTAssertEqual(bubble.senderId, "me-1")
        XCTAssertEqual(messages.lastSendRequest?.clientMessageId, row.clientMessageId, "un seul message : le rejeu se déduplique par clientMessageId")
    }

    /// Hors ligne : l'envoi direct échoue mais la file tient la réponse — pas
    /// d'erreur, pas de texte restauré, la bulle attend le réseau.
    func test_sendReply_offlineInPlaintext_doesNotThrowBecauseTheOutboxHoldsIt() async throws {
        let (sut, _, messages) = makeSUT()
        messages.sendResult = .failure(URLError(.notConnectedToInternet))

        _ = try await sut.sendReply("Salut", to: makeEntry())

        XCTAssertEqual(queue.enqueuedItems.count, 1)
        XCTAssertTrue(persistence.failedLocalIds.isEmpty)
    }

    /// La file refuse ET le réseau échoue : la bulle passe en échec et
    /// l'erreur remonte (le texte revient dans le champ).
    func test_sendReply_sendFailsAndOutboxRefuses_marksTheBubbleFailedAndThrows() async {
        let (sut, _, messages) = makeSUT()
        messages.sendResult = .failure(URLError(.timedOut))
        queue.enqueueItemError = URLError(.cannotCreateFile)

        do {
            _ = try await sut.sendReply("Salut", to: makeEntry())
            XCTFail("expected a failure")
        } catch {}
        XCTAssertEqual(persistence.failedLocalIds.count, 1)
    }

    /// La file rejoue en clair : une réponse CHIFFRÉE n'y entre jamais
    /// (fail-closed). Elle part directement, ou l'erreur remonte.
    func test_sendReply_sealedReplyFails_neverQueuesAndThrows() async {
        let (sut, conversations, messages) = makeSUT()
        conversations.findDirectWithResult = .success(directConversation(id: "0000000000000000000000aa", encryptionMode: "e2ee"))
        messages.sendResult = .failure(URLError(.timedOut))

        do {
            _ = try await sut.sendReply("Salut", to: makeEntry())
            XCTFail("expected a failure")
        } catch {}
        XCTAssertTrue(queue.enqueuedItems.isEmpty)
        XCTAssertTrue(persistence.insertedRecords.isEmpty)
    }
}
