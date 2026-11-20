import XCTest
import GRDB
@testable import Meeshy
import MeeshyE2EE
import MeeshySDK

/// **Un pair sans appareil chiffré reçoit le texte dans le tête-à-tête lisible**
/// (#20074). Le clair n'entre jamais dans le fil chiffré (#12949) : la bulle
/// optimiste en sort, le texte part dans l'AUTRE conversation, servie sans bout
/// en bout, qui s'ouvre. Une étape qui échoue rend le refus lisible d'avant.
@MainActor
final class EndToEndReadableRedirectTests: XCTestCase {

    private let conversationId = "00000000000000000000ed01"
    private let readableId = "00000000000000000000ed02"
    private let userId = "00000000000000000000ed98"
    private let peerId = "00000000000000000000ed77"
    private let text = "On se voit à 18 h ?"

    private struct SUT {
        let viewModel: ConversationViewModel
        let messageService: MockMessageService
        let encryption: MockConversationEncryptionService
        let pool: DatabaseQueue
    }

    private func makeSUT(
        readable: Result<String, Error>? = nil,
        readableStatus: ConversationEncryptionStatus? = nil,
        sendFails: Bool = false,
        conversationName: String = "Mama Ngono"
    ) async throws -> SUT {
        await CacheCoordinator.shared.messages.invalidate(for: conversationId)
        let auth = MockAuthManager()
        auth.simulateLoggedIn(user: MeeshyUser(id: userId, username: "moi", displayName: "Moi"))
        let messageService = MockMessageService()
        if sendFails { messageService.sendResult = .failure(URLError(.timedOut)) }
        let encryption = MockConversationEncryptionService()
        encryption.openReadableDirectResult = readable ?? .success(readableId)
        if let readableStatus { encryption.statusResult = .success(readableStatus) }
        let pool = try DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: pool)
        let persistence = MessagePersistenceActor(dbWriter: pool)
        let endToEnd = MockEndToEndMessaging()
        endToEnd.sealError = E2EESealError.recipientHasNoDevice(userId: peerId)
        let socket = MockMessageSocket()
        socket.isConnected = true
        let viewModel = ConversationViewModel(
            conversationId: conversationId,
            isDirect: true,
            participantUserId: peerId,
            encryptionMode: "e2ee",
            authManager: auth,
            messageService: messageService,
            conversationService: MockConversationService(),
            reactionService: MockReactionService(),
            reportService: MockReportService(),
            messageSocket: socket,
            dependencies: ConversationDependencies(
                persistence: persistence,
                collaborators: ConversationCollaborators(
                    persistence: persistence, syncEngine: ConversationSyncEngine.shared,
                    messageService: messageService, regimeLedger: EndToEndRegimeLedger(),
                    encryptionService: encryption
                )
            ),
            networkMonitor: FakeNetworkMonitor(isOnline: true),
            offlineQueue: FakeOfflineMessageQueue(),
            endToEnd: endToEnd
        )
        viewModel.currentConversation = makeDirectConversation(name: conversationName)
        viewModel.start()
        return SUT(viewModel: viewModel, messageService: messageService, encryption: encryption, pool: pool)
    }

    private func makeDirectConversation(name: String) -> MeeshyConversation {
        MeeshyConversation(id: conversationId, identifier: conversationId, type: .direct, title: name, encryptionMode: "e2ee")
    }

    private func records(in pool: DatabaseQueue) throws -> [MessageRecord] {
        try pool.read { db in try MessageRecord.fetchAll(db) }
    }

    // MARK: - La redirection réussit

    func test_send_peerWithoutDevice_sendsTheTextInClearToTheReadableDirect() async throws {
        let sut = try await makeSUT()

        let result = await sut.viewModel.send(outgoingMessage(content: text, conversationId: conversationId))

        XCTAssertTrue(result.isAccepted, "le texte est parti, ailleurs : reçu \(result)")
        XCTAssertEqual(sut.encryption.openedReadableDirectWith, [peerId])
        XCTAssertEqual(sut.messageService.sendCallCount, 1)
        XCTAssertEqual(sut.messageService.lastSendConversationId, readableId)
        XCTAssertEqual(sut.messageService.lastSendRequest?.content, text)
        XCTAssertNil(sut.messageService.lastSendRequest?.isEncrypted)
    }

    func test_send_peerWithoutDevice_theBubbleLeavesTheEncryptedThread() async throws {
        let sut = try await makeSUT()

        _ = await sut.viewModel.send(outgoingMessage(content: text, conversationId: conversationId))

        XCTAssertTrue(try records(in: sut.pool).filter { $0.conversationId == conversationId }.isEmpty,
                      "aucune ligne, et donc aucun clair, ne reste dans le fil chiffré")
    }

    func test_send_peerWithoutDevice_opensTheReadableDirect() async throws {
        let sut = try await makeSUT()
        let opened = expectation(forNotification: .meeshyNavigateToConversation, object: readableId)

        _ = await sut.viewModel.send(outgoingMessage(content: text, conversationId: conversationId))

        await fulfillment(of: [opened], timeout: 1)
    }

    func test_send_peerWithoutDevice_learnsThatThePeerLacksADevice() async throws {
        let sut = try await makeSUT()

        _ = await sut.viewModel.send(outgoingMessage(content: text, conversationId: conversationId))

        XCTAssertTrue(EndToEndPeerDeviceReach.shared.lacksEncryptedDevice(peerId))
    }

    func test_send_peerWithoutDevice_theListRowReturnsToTheLastRealMessage() async throws {
        let sut = try await makeSUT()
        var row = Conversation(id: conversationId, identifier: conversationId, type: .direct, title: "Mama Ngono",
                               lastMessageAt: Date(), encryptionMode: "e2ee")
        row.applyLastMessage(LastMessageFacet.sent(id: "srv_old", text: "Ancien", at: Date(timeIntervalSinceNow: -60)))
        try await CacheCoordinator.shared.conversations.save([row], for: "list")
        try await CacheCoordinator.shared.messages.save(
            [MeeshyMessage(id: "srv_old", conversationId: conversationId, senderId: userId, content: "Ancien")], for: conversationId
        )
        defer { Task { await CacheCoordinator.shared.conversations.invalidate(for: "list") } }

        _ = await sut.viewModel.send(outgoingMessage(content: text, conversationId: conversationId))

        let listed = await CacheCoordinator.shared.conversations.load(for: "list").snapshot() ?? []
        XCTAssertEqual(listed.first { $0.id == conversationId }?.lastMessageId, "srv_old",
                       "la ligne du fil chiffré n'annonce pas un message parti ailleurs")
    }

    // MARK: - La redirection échoue : le refus lisible d'avant

    func test_send_readableDirectServedEndToEnd_staysRefusedAndSendsNothing() async throws {
        let sut = try await makeSUT(readableStatus: ConversationEncryptionStatus(
            isEncrypted: true, mode: "e2ee", epoch: 1, canToggleEncryption: false
        ))

        let result = await sut.viewModel.send(outgoingMessage(content: text, conversationId: conversationId))

        guard case .failure(.endToEndUnsealed(.recipientWithoutEncryptedDevice)) = result else {
            return XCTFail("un fil chiffré ne reçoit jamais le clair, reçu \(result)")
        }
        XCTAssertEqual(sut.messageService.sendCallCount, 0)
    }

    func test_send_readableDirectIsTheEncryptedThread_staysRefused() async throws {
        let sut = try await makeSUT(readable: .success(conversationId))

        let result = await sut.viewModel.send(outgoingMessage(content: text, conversationId: conversationId))

        guard case .failure(.endToEndUnsealed(.recipientWithoutEncryptedDevice)) = result else {
            return XCTFail("le fil d'où l'on part n'est pas une destination, reçu \(result)")
        }
        XCTAssertEqual(sut.messageService.sendCallCount, 0)
    }

    func test_send_readableDirectCannotOpen_keepsTheFailedBubble() async throws {
        let sut = try await makeSUT(readable: .failure(URLError(.notConnectedToInternet)))

        let result = await sut.viewModel.send(outgoingMessage(content: text, conversationId: conversationId))

        guard case .failure(.endToEndUnsealed(.recipientWithoutEncryptedDevice)) = result else {
            return XCTFail("refus lisible attendu, reçu \(result)")
        }
        let bubble = try XCTUnwrap(records(in: sut.pool).first { $0.conversationId == conversationId })
        XCTAssertEqual(bubble.lastError, EndToEndSendRefusal.recipientWithoutEncryptedDevice.userMessage)
    }

    func test_send_readableSendFails_keepsTheFailedBubble() async throws {
        let sut = try await makeSUT(sendFails: true)

        let result = await sut.viewModel.send(outgoingMessage(content: text, conversationId: conversationId))

        guard case .failure(.endToEndUnsealed(.recipientWithoutEncryptedDevice)) = result else {
            return XCTFail("refus lisible attendu, reçu \(result)")
        }
        XCTAssertFalse(try records(in: sut.pool).filter { $0.conversationId == conversationId }.isEmpty)
    }

    // MARK: - Le corps redirigé

    func test_request_keepsTextLanguageAndProtection_dropsTheQuote() throws {
        let outgoing = outgoingMessage(content: text, conversationId: conversationId)
        let context = SendAttemptContext(
            clientMessageId: MessageID("c1"), startedAt: Date(),
            intent: MessageProtectionIntent(ephemeralDurationSeconds: 60, isViewOnce: true), language: "fr",
            reusesExistingRow: false
        )

        let request = try XCTUnwrap(EndToEndReadableRedirect.request(
            for: outgoing, context: context, wireEffectFlags: 4, clientMessageId: "fresh"
        ))

        XCTAssertEqual(request.content, text)
        XCTAssertEqual(request.originalLanguage, "fr")
        XCTAssertEqual(request.ephemeralDuration, 60)
        XCTAssertEqual(request.isViewOnce, true)
        XCTAssertEqual(request.effectFlags, 4)
        XCTAssertEqual(request.clientMessageId, "fresh")
        XCTAssertNil(request.replyToId)
        XCTAssertNil(request.isEncrypted)
    }

    func test_request_blankText_isNotRedirected() {
        let context = SendAttemptContext(
            clientMessageId: MessageID("c1"), startedAt: Date(), intent: MessageProtectionIntent(), language: "fr",
            reusesExistingRow: false
        )

        XCTAssertNil(EndToEndReadableRedirect.request(
            for: outgoingMessage(content: "  ", conversationId: conversationId), context: context,
            wireEffectFlags: nil, clientMessageId: "fresh"
        ))
    }

    func test_notice_namesThePeerByFirstName() {
        let notice = EndToEndReadableRedirect.notice(peerName: "Mama Ngono")
        XCTAssertTrue(notice.contains("Mama"))
        XCTAssertFalse(notice.contains("Ngono"))
        XCTAssertFalse(EndToEndReadableRedirect.notice(peerName: "  ").contains("%@"))
    }
}
