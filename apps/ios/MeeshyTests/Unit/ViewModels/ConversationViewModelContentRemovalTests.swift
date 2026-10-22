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

    // MARK: - Sélection multiple (#11159)

    private static let viewerId = "00000000000000000000fd99"

    private func seed(_ fx: Fixture, localId: String, senderId: String) async throws {
        let record = MessageStoreObservationHelper.makeRecord(
            localId: localId, conversationId: fx.conversationId, senderId: senderId, content: "Propos \(localId)"
        )
        try await MessagePersistenceActor(dbWriter: fx.pool).insertOptimistic(record)
        _ = await MessageStoreObservationHelper.awaitMessage(in: fx.sut) { $0.id == localId }
    }

    func test_removeSelectedMessages_mixedSelection_onlyOthersCarryTheReason() async throws {
        let fx = try await makeFixture()
        try await seed(fx, localId: "msg-a", senderId: "someone-else")
        try await seed(fx, localId: "msg-b", senderId: "another-one")
        try await seed(fx, localId: "msg-mine", senderId: Self.viewerId)

        await ConversationSelectionRemoval(viewModel: fx.sut).run(["msg-a", "msg-b", "msg-mine"], reason: "Propos haineux")

        XCTAssertEqual(fx.messageService.deleteCallCount, 3)
        XCTAssertEqual(fx.messageService.deleteReasonsByMessageId["msg-a"], .some("Propos haineux"))
        XCTAssertEqual(fx.messageService.deleteReasonsByMessageId["msg-b"], .some("Propos haineux"))
        XCTAssertEqual(fx.messageService.deleteReasonsByMessageId["msg-mine"], .some(nil), "ses propres messages partent sans motif")
        for id in ["msg-a", "msg-b", "msg-mine"] {
            let row = try await fx.record(id)
            XCTAssertNotNil(row?.deletedAt, id)
        }
    }

    func test_removeSelectedMessages_oneRefused_restoresOnlyThatMessage() async throws {
        let fx = try await makeFixture()
        try await seed(fx, localId: "msg-a", senderId: "someone-else")
        try await seed(fx, localId: "msg-b", senderId: "another-one")
        fx.messageService.deleteFailingMessageIds = ["msg-b"]

        await ConversationSelectionRemoval(viewModel: fx.sut).run(["msg-a", "msg-b"], reason: "Propos haineux")

        let kept = try await fx.record("msg-b")
        XCTAssertNil(kept?.deletedAt, "le message refusé revient")
        let removed = try await fx.record("msg-a")
        XCTAssertNotNil(removed?.deletedAt, "l'autre reste retiré")
        XCTAssertNotNil(fx.sut.error)
    }

    func test_removeSelectedMessages_offline_sendsNothing() async throws {
        let fx = try await makeFixture(isOnline: false)
        try await seed(fx, localId: "msg-a", senderId: "someone-else")

        await ConversationSelectionRemoval(viewModel: fx.sut).run(["msg-a"], reason: "Propos haineux")

        XCTAssertEqual(fx.messageService.deleteCallCount, 0)
        let row = try await fx.record("msg-a")
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

    private static func offer(_ post: FeedPost, viewerId: String? = "mod", role: String?) -> PublicationModerationOffer? {
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

    func test_titleKey_severalMessages_usesThePluralKey() {
        XCTAssertEqual(ContentRemovalKind.message.titleKey(count: 1), "moderation.removal.title.message")
        XCTAssertEqual(ContentRemovalKind.message.titleKey(count: 3), "moderation.removal.title.messages")
    }

    func test_deleteConfirmation_titleKey_followsTheSelectionCount() {
        XCTAssertEqual(MessageDeleteConfirmation.titleKey(count: 1), "conversation.view.delete_message.title")
        XCTAssertEqual(MessageDeleteConfirmation.titleKey(count: 2), "conversation.view.delete_messages.title")
    }

    func test_deleteConfirmation_severalMessages_saysHowMany() {
        XCTAssertTrue(MessageDeleteConfirmation.title(count: 3).contains("3"))
        XCTAssertFalse(MessageDeleteConfirmation.title(count: 1).contains("1"))
    }

    func test_titleKey_otherKinds_ignoreTheCount() {
        XCTAssertEqual(ContentRemovalKind.post.titleKey(count: 4), "moderation.removal.title.post")
        XCTAssertEqual(ContentRemovalKind.comment.titleKey(count: 2), "moderation.removal.title.comment")
    }

    func test_sheetTitle_severalMessages_saysHowMany() {
        XCTAssertTrue(ContentRemovalKind.message.sheetTitle(count: 3).contains("3"))
        XCTAssertEqual(ContentRemovalKind.message.sheetTitle(count: 1), ContentRemovalKind.message.sheetTitle)
    }
}

/// **« Retirer » s'offre-t-il sur une SÉLECTION de messages ?** (#11159) — au
/// moins un message d'un autre, tous retirables, et les siens supprimables pour tous.
@MainActor
final class ContentRemovalSelectionOfferTests: XCTestCase {

    private static func message(_ id: String, isMe: Bool) -> MeeshyMessage {
        MeeshyMessage(id: id, conversationId: "c", content: "Bonjour", isMe: isMe)
    }

    private static func offers(_ selected: [MeeshyMessage], removable: Bool = true, ownForEveryone: Bool = true) -> Bool {
        ContentRemovalOffer.selectionOffersRemoval(
            selected, mayRemove: { _ in removable }, mayDeleteForEveryone: { _ in ownForEveryone }
        )
    }

    func test_selectionOffersRemoval_othersMessagesAndModerator_isOffered() {
        XCTAssertTrue(Self.offers([Self.message("a", isMe: false), Self.message("m", isMe: true)]))
    }

    func test_selectionOffersRemoval_onlyOwnMessages_isNotOffered() {
        XCTAssertFalse(Self.offers([Self.message("m", isMe: true)]))
        XCTAssertFalse(Self.offers([]))
    }

    func test_selectionOffersRemoval_viewerCannotModerate_isNotOffered() {
        XCTAssertFalse(Self.offers([Self.message("a", isMe: false)], removable: false))
    }

    func test_selectionOffersRemoval_ownMessageNoLongerDeletableForEveryone_isNotOffered() {
        XCTAssertFalse(Self.offers([Self.message("a", isMe: false), Self.message("m", isMe: true)], ownForEveryone: false))
    }
}
