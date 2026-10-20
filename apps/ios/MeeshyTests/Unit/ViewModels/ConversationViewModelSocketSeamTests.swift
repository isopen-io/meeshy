import XCTest
import GRDB
@testable import Meeshy
import MeeshySDK

/// Le socket INJECTÉ dans `ConversationViewModel` est aussi celui qu'écoute son
/// `ConversationSocketHandler` (#10828).
///
/// Le modèle de vue recevait `messageSocket` mais construisait son handler sur
/// le défaut `MessageSocketManager.shared`. Sous test, la jonction partait donc
/// sur le VRAI socket de l'app hôte : connecté au serveur, il répondait
/// `conversation:join-error` / `not_a_member` pour la conversation de test, et
/// `handleAccessRevoked` vidait la base en mémoire du test au hasard de la
/// latence réseau — la ligne insérée par le test disparaissait avant sa relecture.
@MainActor
final class ConversationViewModelSocketSeamTests: XCTestCase {

    private let conversationId = "000000000000000000000001"

    private func makeSUT() throws -> (
        sut: ConversationViewModel,
        socket: MockMessageSocket,
        persistence: MessagePersistenceActor,
        pool: DatabaseQueue
    ) {
        let pool = try MessageStoreObservationHelper.makeInMemoryDatabase()
        let persistence = MessagePersistenceActor(dbWriter: pool)
        let authManager = MockAuthManager()
        authManager.simulateLoggedIn(
            user: MeeshyUser(id: "000000000000000000000099", username: "me", displayName: "Me")
        )
        let socket = MockMessageSocket()
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
            messageSocket: socket,
            dependencies: ConversationDependencies(dbPool: pool, persistence: persistence)
        )
        return (sut, socket, persistence, pool)
    }

    private func membershipDenied() throws -> ConversationJoinErrorEvent {
        let json = Data("""
        {"conversationId":"\(conversationId)","reason":"not_a_member","message":"Vous n'êtes pas membre de cette conversation"}
        """.utf8)
        return try JSONDecoder().decode(ConversationJoinErrorEvent.self, from: json)
    }

    func test_start_joinsTheRoomThroughTheInjectedSocket() throws {
        let (sut, socket, _, _) = try makeSUT()

        sut.start()

        XCTAssertEqual(socket.joinConversationIds, [conversationId])
    }

    func test_membershipDeniedOnTheInjectedSocket_revokesAccessAndWipesTheConversation() async throws {
        let (sut, socket, persistence, pool) = try makeSUT()
        try await persistence.insertOptimistic(MessageStoreObservationHelper.makeRecord(
            localId: "msg-seam", conversationId: conversationId
        ))
        sut.start()

        socket.conversationJoinError.send(try membershipDenied())

        let revoked = await MessageStoreObservationHelper.awaitCondition { sut.accessRevoked }
        XCTAssertTrue(revoked)
        let row = try await MessageStoreObservationHelper.fetchRecord(localId: "msg-seam", from: pool)
        XCTAssertNil(row)
    }

    // MARK: - emit

    private func makeSendSUT(restFailure: (any Error)? = nil, socketConnected: Bool) throws -> (
        sut: ConversationViewModel,
        socket: MockMessageSocket,
        messageService: MockMessageService,
        pool: DatabaseQueue
    ) {
        let pool = try MessageStoreObservationHelper.makeInMemoryDatabase()
        let authManager = MockAuthManager()
        authManager.simulateLoggedIn(
            user: MeeshyUser(id: "000000000000000000000099", username: "me", displayName: "Me")
        )
        let socket = MockMessageSocket()
        socket.isConnected = socketConnected
        let messageService = MockMessageService()
        if let restFailure { messageService.sendResult = .failure(restFailure) }
        let sut = ConversationViewModel(
            conversationId: conversationId,
            authManager: authManager,
            messageService: messageService,
            conversationService: MockConversationService(),
            reactionService: MockReactionService(),
            reportService: MockReportService(),
            messageSocket: socket,
            dependencies: ConversationDependencies(dbPool: pool, persistence: MessagePersistenceActor(dbWriter: pool)),
            networkMonitor: FakeNetworkMonitor(isOnline: true),
            offlineQueue: FakeOfflineMessageQueue()
        )
        return (sut, socket, messageService, pool)
    }

    private func makeOutgoing() -> OutgoingMessage {
        OutgoingMessage(
            conversationId: ConversationID(conversationId),
            content: "Salut",
            relation: .none,
            attachments: OutgoingAttachments(ids: nil, previews: nil)
        )
    }

    private func makeContext(_ clientMessageId: String) -> SendAttemptContext {
        SendAttemptContext(
            clientMessageId: MessageID(clientMessageId),
            startedAt: Date(),
            intent: .none,
            language: "fr",
            reusesExistingRow: false
        )
    }

    private func attempts(in pool: DatabaseQueue) throws -> [String] {
        try pool.read { db in
            try Row.fetchAll(db, sql: "SELECT transport, outcome FROM send_attempts ORDER BY attemptNumber")
                .map { "\($0["transport"] as String)/\($0["outcome"] as String)" }
        }
    }

    func test_emit_socketFirstAck_returnsAcknowledgedViaSocketFirst_withoutRESTCall() async throws {
        let (sut, socket, messageService, _) = try makeSendSUT(socketConnected: true)
        socket.sendViaSocketFallbackResult = MessageSocketManager.SendMessageAck(messageId: "srv-1", clientMessageId: nil)
        let outgoing = makeOutgoing()
        let context = makeContext("cid_emit_1")
        await sut.stageOptimistic(outgoing, context: context)
        let payload = await sut.prepareUpload(outgoing, context: context)

        let receipt = try await sut.emit(outgoing, payload: payload, context: context)

        guard case .acknowledged(let serverId, _, let via) = receipt.delivery else { return XCTFail("ACK attendu") }
        XCTAssertEqual(serverId.rawValue, "srv-1")
        XCTAssertEqual(via, .socketFirst)
        XCTAssertEqual(messageService.sendCallCount, 0)
    }

    func test_emit_socketFirstMiss_fallsToREST_sameClientMessageId_recordsTwoAttemptsInOrder() async throws {
        let (sut, socket, messageService, pool) = try makeSendSUT(socketConnected: true)
        let outgoing = makeOutgoing()
        let context = makeContext("cid_emit_2")
        await sut.stageOptimistic(outgoing, context: context)
        let payload = await sut.prepareUpload(outgoing, context: context)

        let receipt = try await sut.emit(outgoing, payload: payload, context: context)

        guard case .acknowledged(_, _, let via) = receipt.delivery else { return XCTFail("ACK attendu") }
        XCTAssertEqual(via, .rest)
        XCTAssertEqual(socket.sendViaSocketFallbackCalls.map(\.clientMessageId), ["cid_emit_2"])
        XCTAssertEqual(messageService.lastSendRequest?.clientMessageId, "cid_emit_2")
        XCTAssertEqual(try attempts(in: pool), ["socket-first/failure", "rest/success"])
    }

    func test_emit_restThrows_recordsRestFailureThenRethrows() async throws {
        let failure = NSError(domain: "SocketSeam", code: 500)
        let (sut, _, _, pool) = try makeSendSUT(restFailure: failure, socketConnected: false)
        let outgoing = makeOutgoing()
        let context = makeContext("cid_emit_3")
        await sut.stageOptimistic(outgoing, context: context)
        let payload = await sut.prepareUpload(outgoing, context: context)

        do {
            _ = try await sut.emit(outgoing, payload: payload, context: context)
            XCTFail("l'échec REST doit être relancé")
        } catch {
            XCTAssertEqual((error as NSError).code, 500)
        }
        XCTAssertEqual(try attempts(in: pool), ["rest/failure"])
    }
}
