import XCTest
import GRDB
@testable import Meeshy
import MeeshySDK

/// **Des emojis identiques partent EN SÉRIE** (#7985, directive porteur
/// 2026-09-25 : « la déduplication d'envoi des emojis doit être enlevée pour
/// permettre d'envoyer des emojis en séries ! Il faut juste éviter la
/// déduplication de message uniquement »).
///
/// Deux envois au contenu identique sont deux MESSAGES : chacun a son
/// `clientMessageId`, et c'est lui — pas le contenu — que la passerelle
/// dédoublonne quand un même message est rejoué.
@MainActor
final class ConversationViewModelSeriesSendTests: XCTestCase {

    private let conversationId = "00000000000000000000ab02"
    private let userId = "00000000000000000000ab98"

    override func setUp() async throws {
        try await super.setUp()
        APIClient.shared.anonymousSessionToken = nil
    }

    override func tearDown() async throws {
        MessageSocketManager.shared.isConnected = false
        APIClient.shared.anonymousSessionToken = nil
        try await super.tearDown()
    }

    private func makeSUT() async throws -> (sut: ConversationViewModel, messageService: MockMessageService) {
        await CacheCoordinator.shared.messages.invalidate(for: conversationId)
        let auth = MockAuthManager()
        auth.simulateLoggedIn(user: MeeshyUser(id: userId, username: "serie", displayName: "Série"))
        let messageService = MockMessageService()
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
            messageSocket: MockMessageSocket(),
            dependencies: ConversationDependencies(dbPool: pool, persistence: MessagePersistenceActor(dbWriter: pool)),
            networkMonitor: FakeNetworkMonitor(isOnline: true),
            offlineQueue: FakeOfflineMessageQueue()
        )
        sut.start()
        return (sut, messageService)
    }

    func test_sendMessage_deuxEmojisIdentiquesDAffilee_partentTousLesDeux() async throws {
        let (sut, messageService) = try await makeSUT()

        let premier = await sut.sendMessage(content: "😂")
        let premierId = messageService.lastSendRequest?.clientMessageId
        let second = await sut.sendMessage(content: "😂")

        XCTAssertTrue(premier)
        XCTAssertTrue(second, "un second 😂 tapé aussitôt n'est pas un doublon : c'est un second message")
        XCTAssertEqual(messageService.sendCallCount, 2)
        XCTAssertNotEqual(messageService.lastSendRequest?.clientMessageId, premierId,
                          "chaque envoi porte son propre clientMessageId — la seule clé de déduplication")
    }

    func test_sendMessage_troisEmojisEnSerie_partentTous() async throws {
        let (sut, messageService) = try await makeSUT()

        for _ in 0..<3 {
            _ = await sut.sendMessage(content: "❤️")
        }

        XCTAssertEqual(messageService.sendCallCount, 3)
    }
}
