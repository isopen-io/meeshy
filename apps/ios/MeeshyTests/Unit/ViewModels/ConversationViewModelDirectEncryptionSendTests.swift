import XCTest
import GRDB
import CryptoKit
@testable import Meeshy
import MeeshySDK

/// **Un envoi en conversation directe ne clignote plus en rouge** (#8221).
///
/// Quand la session E2EE du pair n'a pas pu s'établir, le message part en
/// clair — il partait déjà en clair par le repli socket. Le build Release
/// posait d'abord la bulle en `.failed` (« encryption_failed ») avant que
/// l'acquittement socket ne la guérisse : le retry rouge s'affichait quelques
/// millisecondes sur chaque envoi.
@MainActor
final class ConversationViewModelDirectEncryptionSendTests: XCTestCase {

    private let conversationId = "00000000000000000000cd01"
    private let userId = "00000000000000000000cd98"
    private let peerId = "00000000000000000000cd77"

    override func setUp() async throws {
        try await super.setUp()
        APIClient.shared.anonymousSessionToken = nil
    }

    override func tearDown() async throws {
        APIClient.shared.anonymousSessionToken = nil
        try await super.tearDown()
    }

    private struct SUT {
        let viewModel: ConversationViewModel
        let messageService: MockMessageService
        let socket: MockMessageSocket
        let pool: DatabaseQueue
    }

    private func makeSUT(encryptor: DirectMessageEncrypting) async throws -> SUT {
        await CacheCoordinator.shared.messages.invalidate(for: conversationId)
        let auth = MockAuthManager()
        auth.simulateLoggedIn(user: MeeshyUser(id: userId, username: "direct", displayName: "Direct"))
        let messageService = MockMessageService()
        let socket = MockMessageSocket()
        socket.isConnected = true
        let pool = try DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: pool)
        let viewModel = ConversationViewModel(
            conversationId: conversationId,
            isDirect: true,
            participantUserId: peerId,
            authManager: auth,
            messageService: messageService,
            conversationService: MockConversationService(),
            reactionService: MockReactionService(),
            reportService: MockReportService(),
            messageSocket: socket,
            dependencies: ConversationDependencies(dbPool: pool, persistence: MessagePersistenceActor(dbWriter: pool)),
            networkMonitor: FakeNetworkMonitor(isOnline: true),
            offlineQueue: FakeOfflineMessageQueue(),
            messageEncryptor: encryptor
        )
        viewModel.start()
        return SUT(viewModel: viewModel, messageService: messageService, socket: socket, pool: pool)
    }

    func test_sendMessage_sessionE2EEIndisponible_neMarqueJamaisLaBulleEnEchec() async throws {
        let sut = try await makeSUT(encryptor: FailingEncryptor())
        sut.socket.sendViaSocketFallbackResult = MessageSocketManager.SendMessageAck(
            messageId: "00000000000000000000cd55", clientMessageId: nil
        )

        let sent = await sut.viewModel.sendMessage(content: "Salut")

        XCTAssertTrue(sent)
        let cid = try XCTUnwrap(sut.socket.lastSendViaSocketFallbackClientMessageId)
        let record = try await sut.pool.read { db in try MessageRecord.fetchOne(db, key: cid) }
        XCTAssertEqual(record?.state, .sent)
        XCTAssertNil(record?.lastError,
                     "la bulle n'a traversé aucun échec : une session E2EE absente n'est pas un envoi raté")
    }

    func test_sendMessage_sessionE2EEIndisponible_partEnClairParLeSocketFirst() async throws {
        let sut = try await makeSUT(encryptor: FailingEncryptor())
        sut.socket.sendViaSocketFallbackResult = MessageSocketManager.SendMessageAck(
            messageId: "00000000000000000000cd56", clientMessageId: nil
        )

        _ = await sut.viewModel.sendMessage(content: "Salut")

        XCTAssertEqual(sut.socket.sendViaSocketFallbackCallCount, 1)
        XCTAssertEqual(sut.socket.lastSendViaSocketFallbackIsEncrypted, false)
        XCTAssertEqual(sut.messageService.sendCallCount, 0,
                       "le socket-first a acquitté : aucun POST REST de secours")
    }

    func test_sendMessage_sessionE2EEEtablie_partChiffreParREST() async throws {
        let sut = try await makeSUT(encryptor: SucceedingEncryptor())

        _ = await sut.viewModel.sendMessage(content: "Salut")

        XCTAssertEqual(sut.socket.sendViaSocketFallbackCallCount, 0,
                       "un message chiffré ne part jamais par le socket-first")
        XCTAssertEqual(sut.messageService.lastSendRequest?.isEncrypted, true)
        XCTAssertEqual(sut.messageService.lastSendRequest?.encryptionMode, "E2EE")
        XCTAssertNotEqual(sut.messageService.lastSendRequest?.content, "Salut")
    }
}

private struct FailingEncryptor: DirectMessageEncrypting {
    func encryptMessage(_ payload: Data, for userId: String, conversationId: String) async throws -> Data {
        throw SessionManager.SessionError.sessionUnavailable
    }
}

private struct SucceedingEncryptor: DirectMessageEncrypting {
    func encryptMessage(_ payload: Data, for userId: String, conversationId: String) async throws -> Data {
        Data(payload.reversed())
    }
}
