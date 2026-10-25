import XCTest
import MeeshySDK
@testable import Meeshy

/// **Hors du fil, une conversation vue chiffrée de bout en bout ne reçoit jamais
/// de clair** (#12985, #12641, #12986).
///
/// Le fil scelle selon la mémoire du compte, le mode servi et ce qu'il affiche.
/// Le transfert, la file hors ligne, le partage, la réponse depuis une
/// notification, le refus d'appel par message et la réponse à une humeur ne
/// lisaient que le mode SERVI : une passerelle qui sert sans mode une
/// conversation que cet appareil a vue chiffrée y obtenait du clair. Chaque
/// témoin sert la conversation SANS mode, la mémoire disant le bout en bout, et
/// vérifie qu'aucun octet du clair ne part ni n'entre dans une file.
@MainActor
final class EndToEndOffThreadSendTests: XCTestCase {

    private let sealed = "00000000000000000000e2e1"
    private let readable = "00000000000000000000c1e2"
    private let secret = "Le code du coffre est 4512"

    // MARK: - Fixtures

    private func ledger(remembering ids: [String] = []) -> EndToEndRegimeLedger {
        let ledger = EndToEndRegimeLedger(memory: EndToEndRegimeMemory(defaults: nil))
        ids.forEach { ledger.learnEndToEnd(for: $0) }
        return ledger
    }

    private func guardOf(
        remembering ids: [String] = [],
        list: [MeeshyConversation] = [],
        thread: [Message] = []
    ) -> EndToEndDestinationGuard {
        EndToEndDestinationGuard(
            ledger: ledger(remembering: ids),
            cache: ConversationCacheReader(
                loadConversations: { list.isEmpty ? .empty : .fresh(list, age: 1) },
                loadThread: { _ in thread.isEmpty ? .empty : .fresh(thread, age: 1) }
            )
        )
    }

    private func message(_ content: String = "Bonjour", in conversationId: String = "00000000000000000000aaaa") -> Message {
        Message(id: "00000000000000000000bb01", conversationId: conversationId, senderId: "peer",
                content: content, createdAt: Date(), updatedAt: Date())
    }

    private func endToEndMessage(at seconds: TimeInterval) -> Message {
        Message(conversationId: sealed, senderId: "peer", content: "", messageSource: .user,
                isEncrypted: true, encryptionMode: "e2ee", createdAt: Date(timeIntervalSince1970: seconds))
    }

    private func activationNotice(at seconds: TimeInterval) -> Message {
        Message(conversationId: sealed, content: "Chiffrement activé", messageSource: .system,
                createdAt: Date(timeIntervalSince1970: seconds),
                encryptionSwitchNotice: EncryptionSwitchNoticeMetadata(kind: EncryptionSwitchNoticeMetadata.enabledKind, epoch: 1, mode: "e2ee"))
    }

    private func conversationRecipient(_ id: String, servedEncrypted: Bool = false) -> ShareRecipient {
        ShareRecipient(id: "conv:\(id)", kind: .conversation, conversationId: id, userId: "peer",
                       title: id, detail: .direct, avatarURL: nil, isEncrypted: servedEncrypted)
    }

    private func personRecipient(_ userId: String) -> ShareRecipient {
        ShareRecipient(id: "user:\(userId)", kind: .person, conversationId: nil, userId: userId,
                       title: userId, detail: .friendWithoutConversation, avatarURL: nil)
    }

    private func textShare(_ text: String) -> ShareSendRequest {
        ShareSendRequest(subject: .text(text), keptMessageIds: [], caption: "", captionPlacement: nil,
                         grouping: .together, chosenDurationSeconds: nil, copyOnDevice: false)
    }

    private func postedContents(_ api: MockAPIClientForApp) -> [String] {
        api.lastPostBodies.compactMap { String(data: $0, encoding: .utf8) }
    }

    // MARK: - La garde

    func test_guard_aConversationRememberedEndToEnd_seals_evenServedWithoutMode() async {
        let sut = guardOf(remembering: [sealed])

        let seals = await sut.seals(sealed, served: [nil])

        XCTAssertTrue(seals)
    }

    func test_guard_theCachedListRowSaysEndToEnd_seals() async {
        let row = MeeshyConversation(id: sealed, identifier: sealed, type: .direct, encryptionMode: "e2ee")

        let seals = await guardOf(list: [row]).seals(sealed)

        XCTAssertTrue(seals)
    }

    func test_guard_anActivationNoticeInTheCachedThread_seals_andIsRemembered() async {
        let sut = guardOf(thread: [activationNotice(at: 100)])

        let seals = await sut.seals(sealed)

        XCTAssertTrue(seals)
        XCTAssertTrue(sut.ledger.remembersEndToEnd(sealed))
    }

    /// #12986, option 2 — un message chiffré de bout en bout affiché scelle.
    func test_guard_anEndToEndMessageInTheCachedThread_seals() async {
        let seals = await guardOf(thread: [endToEndMessage(at: 100)]).seals(sealed)

        XCTAssertTrue(seals)
    }

    func test_guard_nothingSaysEndToEnd_staysReadable() async {
        let seals = await guardOf(remembering: [sealed], thread: [message(in: readable)]).seals(readable, served: [nil, "server"])

        XCTAssertFalse(seals)
    }

    // MARK: - Le transfert

    private func forwardService(api: MockAPIClientForApp, queue: FakeOfflineMessageQueue, online: Bool,
                                creator: MockConversationCreator = MockConversationCreator()) -> MessageForwardService {
        MessageForwardService(api: api, queue: queue, isOnline: { online }, conversationCreator: creator,
                              destinationGuard: guardOf(remembering: [sealed]))
    }

    func test_forward_online_toARememberedEndToEndConversation_postsNothing() async {
        let api = MockAPIClientForApp()
        let sut = forwardService(api: api, queue: FakeOfflineMessageQueue(), online: true)

        let outcome = await sut.forward(message: message(secret), sourceConversationId: nil, to: sealed)

        XCTAssertEqual(outcome, .failed(reason: ForwardRefusalReason.encryptedDestination.explanation))
        XCTAssertEqual(api.postCount, 0)
        XCTAssertFalse(postedContents(api).contains { $0.contains(secret) })
    }

    func test_forward_offline_toARememberedEndToEndConversation_queuesNothing() async {
        let queue = FakeOfflineMessageQueue()
        let sut = forwardService(api: MockAPIClientForApp(), queue: queue, online: false)

        let outcome = await sut.forward(message: message(secret), sourceConversationId: nil, to: conversationRecipient(sealed))

        XCTAssertFalse(outcome.succeeded)
        let queued = await queue.enqueuedItems
        XCTAssertTrue(queued.isEmpty)
    }

    /// Un contact : la directe que la passerelle rend est la CHIFFRÉE (#12966).
    func test_forward_toAContact_whoseReturnedDirectIsEndToEnd_postsNothing() async {
        let api = MockAPIClientForApp()
        let creator = MockConversationCreator()
        creator.result = .success(MeeshyConversation(id: "00000000000000000000e2e9", identifier: "x", type: .direct, encryptionMode: "e2ee"))
        let sut = forwardService(api: api, queue: FakeOfflineMessageQueue(), online: true, creator: creator)

        let outcome = await sut.forward(message: message(secret), sourceConversationId: nil, to: personRecipient("peer"))

        XCTAssertFalse(outcome.succeeded)
        XCTAssertEqual(api.postCount, 0)
    }

    // MARK: - Le partage

    private func shareDispatcher(api: MockAPIClientForApp, queue: FakeOfflineMessageQueue, online: Bool) -> LiveShareDispatcher {
        LiveShareDispatcher(
            forwardService: MessageForwardService(api: api, queue: queue, isOnline: { online },
                                                  conversationCreator: MockConversationCreator(),
                                                  destinationGuard: guardOf(remembering: [sealed])),
            api: api, queue: queue, isOnline: { online }, conversationCreator: MockConversationCreator(),
            postService: MockPostService(), currentUserId: { "me" },
            destinationGuard: guardOf(remembering: [sealed])
        )
    }

    func test_share_aText_toARememberedEndToEndConversation_postsNothing() async {
        let api = MockAPIClientForApp()
        let sut = shareDispatcher(api: api, queue: FakeOfflineMessageQueue(), online: true)

        let outcome = await sut.deliver(textShare(secret), to: conversationRecipient(sealed))

        guard case .failed = outcome else { return XCTFail("refus attendu, reçu \(outcome)") }
        XCTAssertEqual(api.postCount, 0)
    }

    func test_share_aText_offline_toARememberedEndToEndConversation_queuesNothing() async {
        let queue = FakeOfflineMessageQueue()
        let sut = shareDispatcher(api: MockAPIClientForApp(), queue: queue, online: false)

        _ = await sut.deliver(textShare(secret), to: conversationRecipient(sealed))

        let queued = await queue.enqueuedItems
        XCTAssertTrue(queued.isEmpty)
    }

    // MARK: - La file hors ligne

    private func outboxRecord(_ item: OfflineQueueItem) -> OutboxRecord {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        return OutboxRecord(id: "ofq_\(item.clientMessageId)", kind: .sendMessage, conversationId: item.conversationId,
                            clientMessageId: item.clientMessageId, payload: (try? encoder.encode(item)) ?? Data())
    }

    func test_outbox_aQueuedPlaintext_toARememberedEndToEndConversation_neverLeaves_andIsRefusedForGood() async {
        let service = MockMessageService()
        let sut = OutboxDispatcher(messageService: service, sealsDestination: { [sealed] in $0 == sealed })
        let item = OfflineQueueItem(conversationId: sealed, content: secret, clientMessageId: ClientMessageId.generate())

        do {
            try await sut.dispatchSendMessage(outboxRecord(item))
            XCTFail("la ligne doit être refusée")
        } catch {
            XCTAssertEqual(error as? EndToEndSendRefusal, .outboxUnsealable, "un refus que la file classe définitif")
            XCTAssertEqual(error.localizedDescription, EndToEndSendRefusal.outboxUnsealable.userMessage)
        }
        XCTAssertEqual(service.sendCallCount, 0)
    }

    func test_outbox_aQueuedPlaintext_toAReadableConversation_stillLeaves() async throws {
        let service = MockMessageService()
        let sut = OutboxDispatcher(messageService: service, sealsDestination: { [sealed] in $0 == sealed })
        let item = OfflineQueueItem(conversationId: readable, content: "Bonjour", clientMessageId: ClientMessageId.generate())

        try? await sut.dispatchSendMessage(outboxRecord(item))

        XCTAssertEqual(service.sendCallCount, 1)
        XCTAssertEqual(service.lastSendRequest?.content, "Bonjour")
    }

    // MARK: - Réponse depuis une notification, refus d'appel, humeur (#12641)

    private final class ReplyQueueSpy: NotificationReplyQueueing {
        private(set) var enqueuedItems: [OfflineQueueItem] = []
        func enqueue(_ item: OfflineQueueItem) async throws { enqueuedItems.append(item) }
        @discardableResult
        func enqueue<P: Codable & Sendable>(_ kind: OutboxKind, payload: P, conversationId: String?) async throws -> String { "ofqm_unused" }
        @discardableResult
        func enqueueComment(_ comment: CreateCommentPayload, ownerId: String?) async throws -> String { "ofqm_unused" }
    }

    private final class PersistenceSpy: OptimisticMessagePersisting {
        private(set) var inserted: [MessageRecord] = []
        private(set) var failures: [String: String] = [:]
        func insertOptimistic(_ record: MessageRecord) async throws { inserted.append(record) }
        func markOptimisticFailed(localId: String, reason: String) async throws { failures[localId] = reason }
    }

    func test_callDecline_toARememberedEndToEndConversation_sendsNothing_queuesNothing_andSaysWhy() async {
        let service = MockMessageService()
        let queue = ReplyQueueSpy()
        let persistence = PersistenceSpy()
        let sut = CallDeclineMessenger(messageService: service, replyQueue: queue, messagePersistence: persistence,
                                       currentUserId: { "me" }, prepareReplyQueue: {},
                                       destinationGuard: guardOf(remembering: [sealed]))

        await sut.send(CallDeclineReplyPlan(conversationId: sealed, content: secret, originalLanguage: "fr"))

        XCTAssertEqual(service.sendCallCount, 0)
        XCTAssertTrue(queue.enqueuedItems.isEmpty)
        XCTAssertEqual(Array(persistence.failures.values), [EndToEndSendRefusal.sealedOnlyInConversation.userMessage])
    }

    func test_moodReply_inARememberedEndToEndDirect_servedWithoutMode_leavesSealed() async throws {
        let conversations = MockConversationService()
        conversations.findDirectWithResult = .success(JSONStub.decode("""
        {"id":"\(sealed)","type":"direct","createdAt":"2026-01-01T00:00:00.000Z"}
        """))
        let messages = MockMessageService()
        let e2ee = MockEndToEndMessaging()
        let queue = ReplyQueueSpy()
        let sut = MoodReplySender(conversations: conversations, messages: messages, endToEnd: e2ee,
                                  replyQueue: queue, messagePersistence: PersistenceSpy(),
                                  currentUserId: { "me-1" }, prepareReplyQueue: {}, composingLanguages: { ["fr"] },
                                  destinationGuard: guardOf(remembering: [sealed]))
        let entry = StatusEntry(id: "mood-1", userId: "author-1", username: "Alice", avatarColor: "6366F1", moodEmoji: "😄", content: "Heureux")

        _ = try await sut.sendReply(secret, to: entry)

        XCTAssertEqual(e2ee.deliverCallCount, 1)
        XCTAssertNotEqual(messages.lastSendRequest?.content, secret)
        XCTAssertTrue(queue.enqueuedItems.isEmpty, "une réponse scellée n'entre jamais dans la file")
    }

    // MARK: - L'extension de partage (#12985)

    func test_shareMemory_theAppReflectsTheEndToEndConversationsOfTheBoundAccount() throws {
        let suite = "test.e2ee.share.\(UUID().uuidString)"
        let mirror = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { mirror.removePersistentDomain(forName: suite) }
        let memory = EndToEndRegimeMemory(defaults: nil, mirror: mirror)
        memory.bind(account: "gate.staging.meeshy.me/me-1")

        _ = memory.resolve(conversationId: sealed, served: EndToEndRegime(encryptionMode: "e2ee", enabledAt: nil))
        _ = memory.resolve(conversationId: readable, served: .serverReadable)

        let remembers = EndToEndShareMemory.remembers(in: mirror, userId: "me-1")
        XCTAssertTrue(remembers(sealed))
        XCTAssertFalse(remembers(readable))
        XCTAssertTrue(EndToEndShareMemory.remembers(in: mirror, userId: "someone-else")(readable), "un autre compte : tout se relaie")
    }

    func test_shareMemory_withoutReflection_everyTargetIsRelayed() {
        XCTAssertTrue(EndToEndShareMemory.remembers(in: nil, userId: "me-1")(readable))
    }

    func test_extension_aRememberedEndToEndConversation_isRelayed_neverPostedFromTheExtension() async {
        var sendCount = 0
        let sut = ExtensionShareDispatcher(
            shareId: "share-1",
            session: ShareSession(userId: "me-1", token: "t", apiBaseURL: "https://gate.staging.meeshy.me"),
            staged: [],
            sendShare: { share, _ in sendCount += 1; return share },
            remembersEndToEnd: { [sealed] in $0 == sealed }
        )

        let outcome = await sut.deliver(textShare(secret), to: conversationRecipient(sealed))

        XCTAssertEqual(outcome, .queued(conversationId: sealed))
        XCTAssertEqual(sendCount, 0)
        XCTAssertEqual(sut.relayedConversationIds, [sealed])
    }

    // MARK: - Le tête-à-tête avec un contact (#13006)

    func test_directWithAContact_theEndToEndOneOpens_evenWhenTheReadableOneIsMoreRecent() {
        var readableDirect = MeeshyConversation(id: readable, identifier: readable, type: .direct, lastMessageAt: Date(timeIntervalSince1970: 900))
        readableDirect.participantUserId = "peer"
        var sealedDirect = MeeshyConversation(id: sealed, identifier: sealed, type: .direct, lastMessageAt: Date(timeIntervalSince1970: 100))
        sealedDirect.participantUserId = "peer"

        let chosen = DirectConversationResolver.loaded(with: "peer", in: [readableDirect, sealedDirect], ledger: ledger(remembering: [sealed]))

        XCTAssertEqual(chosen?.id, sealed)
    }
}
