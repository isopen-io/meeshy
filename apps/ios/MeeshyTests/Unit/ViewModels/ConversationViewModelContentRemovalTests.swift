import XCTest
import GRDB
@testable import Meeshy
import MeeshySDK

/// **Retirer le message d'un AUTRE, avec son motif** (#11151) : optimiste comme
/// « supprimer pour tous », défait si la passerelle refuse, jamais rejoué hors
/// ligne sans motif.
@MainActor
final class ConversationViewModelContentRemovalTests: XCTestCase {

    private struct Fixture {
        let sut: ConversationViewModel
        let messageService: MockMessageService
        let offlineQueue: FakeOfflineMessageQueue
        let pool: DatabaseQueue
        let conversationId: String

        func record(_ localId: String) async throws -> MessageRecord? {
            try await pool.read { try MessageRecord.fetchOne($0, key: localId) }
        }
    }

    private func makeFixture(isOnline: Bool = true, deleteFailure: Error? = nil) async throws -> Fixture {
        let conversationId = "00000000000000000000fd01"
        await CacheCoordinator.shared.messages.invalidate(for: conversationId)
        let auth = MockAuthManager()
        auth.simulateLoggedIn(user: MeeshyUser(id: "00000000000000000000fd99", username: "admin", displayName: "Admin"))
        let messageService = MockMessageService()
        if let deleteFailure { messageService.deleteResult = .failure(deleteFailure) }
        let offlineQueue = FakeOfflineMessageQueue()
        let pool = try DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: pool)
        let sut = ConversationViewModel(
            conversationId: conversationId,
            authManager: auth,
            messageService: messageService,
            conversationService: MockConversationService(),
            reactionService: MockReactionService(),
            reportService: MockReportService(),
            messageSocket: MockMessageSocket(),
            dependencies: ConversationDependencies(dbPool: pool, persistence: MessagePersistenceActor(dbWriter: pool)),
            networkMonitor: FakeNetworkMonitor(isOnline: isOnline),
            offlineQueue: offlineQueue
        )
        sut.start()
        return Fixture(sut: sut, messageService: messageService, offlineQueue: offlineQueue, pool: pool, conversationId: conversationId)
    }

    private func seedOthersMessage(_ fx: Fixture, localId: String = "msg-other") async throws {
        let record = MessageStoreObservationHelper.makeRecord(
            localId: localId, conversationId: fx.conversationId, senderId: "someone-else", content: "Propos"
        )
        try await MessagePersistenceActor(dbWriter: fx.pool).insertOptimistic(record)
        _ = await MessageStoreObservationHelper.awaitMessage(in: fx.sut) { $0.id == localId }
    }

    func test_removeMessage_online_marksDeletedAndSendsTheReason() async throws {
        let fx = try await makeFixture()
        try await seedOthersMessage(fx)

        await fx.sut.removeMessage(messageId: "msg-other", reason: "Propos haineux")

        XCTAssertEqual(fx.messageService.deleteCallCount, 1)
        XCTAssertEqual(fx.messageService.lastDeleteConversationId, fx.conversationId)
        XCTAssertEqual(fx.messageService.lastDeleteReason, "Propos haineux")
        let row = try await fx.record("msg-other")
        XCTAssertNotNil(row?.deletedAt, "le retrait est optimiste : le message s'efface aussitôt")
    }

    func test_removeMessage_whenTheGatewayRefuses_restoresTheMessage() async throws {
        let fx = try await makeFixture(deleteFailure: APIError.serverError(403, "forbidden"))
        try await seedOthersMessage(fx)

        await fx.sut.removeMessage(messageId: "msg-other", reason: "Propos haineux")

        let row = try await fx.record("msg-other")
        XCTAssertNil(row?.deletedAt, "un refus défait le retrait")
        XCTAssertNotNil(fx.sut.error)
    }

    func test_removeMessage_offline_neitherCallsTheServerNorQueuesAReasonlessDelete() async throws {
        let fx = try await makeFixture(isOnline: false)
        try await seedOthersMessage(fx)

        await fx.sut.removeMessage(messageId: "msg-other", reason: "Propos haineux")

        XCTAssertEqual(fx.messageService.deleteCallCount, 0)
        let queued = await fx.offlineQueue.enqueuedDeletes
        XCTAssertTrue(queued.isEmpty)
        let row = try await fx.record("msg-other")
        XCTAssertNil(row?.deletedAt)
        XCTAssertNotNil(fx.sut.error)
    }
}

/// **« Retirer » s'offre-t-il sur une publication ?** (#11151) — la modération
/// de la plateforme, jamais sur son propre contenu.
@MainActor
final class ContentRemovalOfferTests: XCTestCase {

    private static func post(authorId: String = "author", type: String = "POST") -> FeedPost {
        FeedPost(id: "p1", author: "Awa", authorId: authorId, type: type, content: "Bonjour")
    }

    private static func offer(_ post: FeedPost, viewerId: String? = "mod", role: String?) -> ((String) -> Void)? {
        ContentRemovalOffer.publication(for: post, viewerId: viewerId, viewerRole: role) { _, _ in }
    }

    func test_publication_platformModeratorOnAnothersPost_isOffered() {
        for role in ["MODERATOR", "ADMIN", "BIGBOSS"] {
            XCTAssertNotNil(Self.offer(Self.post(), role: role), role)
        }
    }

    func test_publication_ordinaryRoles_areNotOffered() {
        for role in ["USER", "AUDIT", "ANALYST"] {
            XCTAssertNil(Self.offer(Self.post(), role: role), role)
        }
        XCTAssertNil(Self.offer(Self.post(), role: nil))
    }

    func test_publication_ownPost_isNeverOffered() {
        XCTAssertNil(Self.offer(Self.post(authorId: "mod"), viewerId: "mod", role: "BIGBOSS"))
    }

    func test_kind_namesReelStoryAndPost() {
        XCTAssertEqual(ContentRemovalKind.of(post: Self.post(type: "REEL")), .reel)
        XCTAssertEqual(ContentRemovalKind.of(post: Self.post(type: "STORY")), .story)
        XCTAssertEqual(ContentRemovalKind.of(post: Self.post(type: "POST")), .post)
    }

    func test_successText_aRemovalSaysTheAuthorIsNotified_aDeletionKeepsItsWord() {
        XCTAssertEqual(ContentRemovalKind.successText(reason: nil, deleted: "Publication supprimée"), "Publication supprimée")
        XCTAssertNotEqual(ContentRemovalKind.successText(reason: "Spam", deleted: "Publication supprimée"), "Publication supprimée")
    }
}
