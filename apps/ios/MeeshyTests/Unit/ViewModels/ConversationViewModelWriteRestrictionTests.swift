import XCTest
import GRDB
@testable import Meeshy
import MeeshySDK

/// #9929 — Global se lit sans s'écrire avant 18 ans. Un envoi refusé par un
/// 403 `GLOBAL_ADULTS_ONLY` est DÉFINITIF : ni repli socket, ni file de
/// re-tentative, la bulle optimiste disparaît et le composeur cède la place au
/// bandeau de lecture seule.
@MainActor
final class ConversationViewModelWriteRestrictionTests: XCTestCase {

    private let conversationId = "00000000000000000000cd01"
    private let userId = "00000000000000000000cd99"

    private struct Fixture {
        let sut: ConversationViewModel
        let messageService: MockMessageService
        let messageSocket: MockMessageSocket
        let offlineQueue: FakeOfflineMessageQueue
        let pool: DatabaseQueue
    }

    override func setUp() async throws {
        try await super.setUp()
        APIClient.shared.anonymousSessionToken = nil
    }

    override func tearDown() async throws {
        MessageSocketManager.shared.isConnected = false
        APIClient.shared.anonymousSessionToken = nil
        try await super.tearDown()
    }

    private func makeFixture(restSendFailure: Error? = nil) async throws -> Fixture {
        await CacheCoordinator.shared.messages.invalidate(for: conversationId)
        let auth = MockAuthManager()
        auth.simulateLoggedIn(user: MeeshyUser(id: userId, username: "minor", displayName: "Minor"))
        let messageService = MockMessageService()
        if let restSendFailure {
            messageService.sendResult = .failure(restSendFailure)
        }
        let messageSocket = MockMessageSocket()
        let offlineQueue = FakeOfflineMessageQueue()
        let pool = try DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: pool)
        MessageSocketManager.shared.isConnected = true
        let sut = ConversationViewModel(
            conversationId: conversationId,
            authManager: auth,
            messageService: messageService,
            conversationService: MockConversationService(),
            reactionService: MockReactionService(),
            reportService: MockReportService(),
            messageSocket: messageSocket,
            dependencies: ConversationDependencies(dbPool: pool, persistence: MessagePersistenceActor(dbWriter: pool)),
            networkMonitor: FakeNetworkMonitor(isOnline: true),
            offlineQueue: offlineQueue
        )
        sut.start()
        return Fixture(sut: sut, messageService: messageService, messageSocket: messageSocket,
                       offlineQueue: offlineQueue, pool: pool)
    }

    private var globalAdultsOnly: MeeshyError {
        .forbidden(reason: "Global", body: Data(#"{"success":false,"error":"Global","code":"GLOBAL_ADULTS_ONLY"}"#.utf8))
    }

    private func storedMessageCount(in pool: DatabaseQueue) throws -> Int {
        try pool.read { db in try Int.fetchOne(db, sql: "SELECT COUNT(*) FROM messages") ?? 0 }
    }

    // MARK: - Le refus d'envoi

    func test_sendMessage_globalAdultsOnly_learnsTheRestriction() async throws {
        let fx = try await makeFixture(restSendFailure: globalAdultsOnly)

        let sent = await fx.sut.sendMessage(content: "Salut Global")

        XCTAssertFalse(sent)
        XCTAssertEqual(fx.sut.learnedWriteRestriction, .minorGlobal)
        XCTAssertEqual(fx.sut.writeRestriction(served: nil), .minorGlobal)
    }

    func test_sendMessage_globalAdultsOnly_withdrawsTheOptimisticMessage() async throws {
        let fx = try await makeFixture(restSendFailure: globalAdultsOnly)

        _ = await fx.sut.sendMessage(content: "Salut Global")

        XCTAssertEqual(try storedMessageCount(in: fx.pool), 0)
    }

    func test_sendMessage_globalAdultsOnly_neitherFallsBackNorQueues() async throws {
        let fx = try await makeFixture(restSendFailure: globalAdultsOnly)

        _ = await fx.sut.sendMessage(content: "Salut Global")

        XCTAssertEqual(fx.messageSocket.sendViaSocketFallbackCallCount, 0)
        let queued = await fx.offlineQueue.enqueueCount
        XCTAssertEqual(queued, 0)
    }

    func test_sendMessage_otherForbidden_learnsNoRestriction() async throws {
        let fx = try await makeFixture(restSendFailure: MeeshyError.forbidden(reason: nil, body: Data(#"{"code":"FORBIDDEN"}"#.utf8)))

        _ = await fx.sut.sendMessage(content: "Salut")

        XCTAssertNil(fx.sut.learnedWriteRestriction)
    }

    // MARK: - #7759 — le mode lent des nouveaux comptes

    private var newcomerSlowMode: MeeshyError {
        .rejected(NewcomerSlowMode(retryAfterSeconds: 21).rejection(message: "Bienvenue !"))
    }

    func test_sendMessage_newcomerSlowMode_keepsTheMessageFailed_toResend() async throws {
        let fx = try await makeFixture(restSendFailure: newcomerSlowMode)

        let sent = await fx.sut.sendMessage(content: "Salut Global")

        XCTAssertFalse(sent)
        XCTAssertNil(fx.sut.learnedWriteRestriction, "un refus temporaire ne ferme pas le composeur")
        let states = try await fx.pool.read { db in try String.fetchAll(db, sql: "SELECT state FROM messages") }
        XCTAssertEqual(states, ["failed"], "la bulle reste, renvoyable d'un geste")
    }

    func test_sendMessage_newcomerSlowMode_neitherFallsBackNorQueues() async throws {
        let fx = try await makeFixture(restSendFailure: newcomerSlowMode)

        _ = await fx.sut.sendMessage(content: "Salut Global")

        XCTAssertEqual(fx.messageSocket.sendViaSocketFallbackCallCount, 0)
        let queued = await fx.offlineQueue.enqueueCount
        XCTAssertEqual(queued, 0)
    }

    func test_slowModeNotice_saysTheDelay_inTheSevenLanguages() throws {
        XCTAssertTrue(ConversationViewModel.slowModeNotice(NewcomerSlowMode(retryAfterSeconds: 21)).contains("21"))

        let catalogURL = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Localizable.xcstrings")
        let root = try XCTUnwrap(JSONSerialization.jsonObject(with: Data(contentsOf: catalogURL)) as? [String: Any])
        let strings = try XCTUnwrap(root["strings"] as? [String: Any])
        let entry = try XCTUnwrap(strings["conversation.send.slow_mode"] as? [String: Any], "clé absente du catalogue")
        let localizations = try XCTUnwrap(entry["localizations"] as? [String: Any])
        for locale in ["fr", "en", "es", "de", "it", "pt-BR", "ar"] {
            let unit = (localizations[locale] as? [String: Any])?["stringUnit"] as? [String: Any]
            let value = unit?["value"] as? String ?? ""
            XCTAssertTrue(value.contains("%lld"), "conversation.send.slow_mode [\(locale)] doit dire le délai — « \(value) »")
        }
    }

    // MARK: - Ce que la vue lit

    func test_writeRestriction_servedMinorGlobal_closesTheComposer() async throws {
        let fx = try await makeFixture()

        XCTAssertEqual(fx.sut.writeRestriction(served: .minorGlobal), .minorGlobal)
    }

    func test_writeRestriction_servedUnknown_keepsTheComposer() async throws {
        let fx = try await makeFixture()

        XCTAssertNil(fx.sut.writeRestriction(served: .unknown("future-rule")))
        XCTAssertNil(fx.sut.writeRestriction(served: nil))
    }

    // MARK: - reconcile

    private func makeOutgoing(protection: MessageProtectionIntent? = nil) -> OutgoingMessage {
        OutgoingMessage(
            conversationId: ConversationID(conversationId),
            content: "Salut Global",
            relation: .none,
            attachments: OutgoingAttachments(ids: nil, previews: nil),
            protection: protection
        )
    }

    private func makeContext(_ clientMessageId: String, intent: MessageProtectionIntent = .none) -> SendAttemptContext {
        SendAttemptContext(
            clientMessageId: MessageID(clientMessageId),
            startedAt: Date(),
            intent: intent,
            language: "fr",
            reusesExistingRow: false
        )
    }

    private func reconcileFailure(
        _ error: any Error,
        fixture fx: Fixture,
        clientMessageId: String,
        intent: MessageProtectionIntent = .none
    ) async -> Result<SentMessageReceipt, SendFailure> {
        let outgoing = makeOutgoing(protection: intent)
        let context = makeContext(clientMessageId, intent: intent)
        await fx.sut.stageOptimistic(outgoing, context: context)
        let payload = await fx.sut.prepareUpload(outgoing, context: context)
        return await fx.sut.reconcile(.failure(error), outgoing: outgoing, payload: payload, context: context)
    }

    private func state(of localId: String, in pool: DatabaseQueue) throws -> MessageState? {
        try pool.read { db in try MessageRecord.fetchOne(db, key: localId)?.state }
    }

    func test_reconcile_closingRestriction_withdrawsRow_returnsWriteRestricted() async throws {
        let fx = try await makeFixture()

        let result = await reconcileFailure(globalAdultsOnly, fixture: fx, clientMessageId: "cid_rec_1")

        guard case .failure(let failure) = result else { return XCTFail("un refus définitif est un échec") }
        XCTAssertEqual(failure, SendFailure.writeRestricted(.minorGlobal))
        XCTAssertEqual(try storedMessageCount(in: fx.pool), 0)
    }

    func test_reconcile_slowMode_returnsSlowMode() async throws {
        let fx = try await makeFixture()

        let result = await reconcileFailure(newcomerSlowMode, fixture: fx, clientMessageId: "cid_rec_2")

        guard case .failure(.slowMode(let slowMode)) = result else { return XCTFail("mode lent attendu") }
        XCTAssertTrue((20...21).contains(slowMode.retryAfterSeconds))
        XCTAssertEqual(try state(of: "cid_rec_2", in: fx.pool), .failed)
    }

    func test_reconcile_restFailed_socketFallbackAck_setsPendingServerId_returnsAcknowledgedViaSocketFallback() async throws {
        let fx = try await makeFixture()
        fx.messageSocket.sendViaSocketFallbackResult = MessageSocketManager.SendMessageAck(messageId: "srv-fb", clientMessageId: nil)

        let result = await reconcileFailure(NSError(domain: "reconcile", code: 500), fixture: fx, clientMessageId: "cid_rec_3")

        guard case .success(let receipt) = result,
              case .acknowledged(let serverId, _, let via) = receipt.delivery else { return XCTFail("repli socket attendu") }
        XCTAssertEqual(serverId.rawValue, "srv-fb")
        XCTAssertEqual(via, .socketFallback)
        XCTAssertEqual(fx.sut.pendingServerIds["cid_rec_3"], "srv-fb")
        XCTAssertEqual(try state(of: "cid_rec_3", in: fx.pool), .sent)
    }

    func test_reconcile_restFailed_noFallback_appliesSendFailed_enqueuesRetry_returnsQueuedForRetry() async throws {
        let fx = try await makeFixture()

        let result = await reconcileFailure(NSError(domain: "reconcile", code: 500), fixture: fx, clientMessageId: "cid_rec_4")

        guard case .failure(let failure) = result, case .queuedForRetry = failure else { return XCTFail("mise en file attendue") }
        XCTAssertEqual(try state(of: "cid_rec_4", in: fx.pool), .queued)
        let items = await fx.offlineQueue.enqueuedItems
        XCTAssertEqual(items.map(\.clientMessageId), ["cid_rec_4"])
    }

    func test_reconcile_retryEnqueueThrows_marksFailed_returnsRetryEnqueueFailed() async throws {
        let fx = try await makeFixture()
        await fx.offlineQueue.setShouldThrow(true)

        let result = await reconcileFailure(NSError(domain: "reconcile", code: 500), fixture: fx, clientMessageId: "cid_rec_5")

        guard case .failure(let failure) = result, case .retryEnqueueFailed = failure else { return XCTFail("échec d'outbox attendu") }
        XCTAssertEqual(try state(of: "cid_rec_5", in: fx.pool), .failed)
    }

    func test_reconcile_specialProps_skipSocketFallback() async throws {
        let fx = try await makeFixture()
        fx.messageSocket.sendViaSocketFallbackResult = MessageSocketManager.SendMessageAck(messageId: "srv-no", clientMessageId: nil)

        let result = await reconcileFailure(
            NSError(domain: "reconcile", code: 500),
            fixture: fx,
            clientMessageId: "cid_rec_6",
            intent: MessageProtectionIntent(isViewOnce: true)
        )

        guard case .failure = result else { return XCTFail("une vue unique ne passe pas par le repli socket") }
        XCTAssertEqual(fx.messageSocket.sendViaSocketFallbackCalls.count, 0)
    }
}

private extension FakeOfflineMessageQueue {
    func setShouldThrow(_ value: Bool) {
        shouldThrow = value
    }
}
