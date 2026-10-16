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
}
