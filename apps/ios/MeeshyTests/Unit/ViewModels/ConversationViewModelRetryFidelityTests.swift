import XCTest
import GRDB
@testable import Meeshy
import MeeshySDK

@MainActor
final class ConversationViewModelRetryFidelityTests: XCTestCase {

    private let conversationId = "00000000000000000000cf01"
    private let userId = "00000000000000000000cf99"

    private struct Fixture {
        let sut: ConversationViewModel
        let messageService: MockMessageService
    }

    override func tearDown() async throws {
        MessageSocketManager.shared.isConnected = false
        try await super.tearDown()
    }

    private func makeFixture() async throws -> Fixture {
        await CacheCoordinator.shared.messages.invalidate(for: conversationId)
        let auth = MockAuthManager()
        auth.simulateLoggedIn(user: MeeshyUser(id: userId, username: "retry", displayName: "Retry"))
        let messageService = MockMessageService()
        let pool = try DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: pool)
        MessageSocketManager.shared.isConnected = false
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
        return Fixture(sut: sut, messageService: messageService)
    }

    private func seedFailed(
        localId: String,
        content: String,
        replyToId: String? = nil,
        forwardedFromId: String? = nil,
        forwardedFromConversationId: String? = nil,
        location: SharedPlace? = nil,
        fixture fx: Fixture
    ) async throws {
        var record = OptimisticTextRecordBuilder.record(
            localId: localId,
            conversationId: conversationId,
            senderId: userId,
            sender: nil,
            text: content,
            originalLanguage: "fr",
            messageType: "text",
            replyToId: replyToId,
            storyReplyToId: nil,
            forwardedFromId: forwardedFromId,
            forwardedFromConversationId: forwardedFromConversationId,
            replyToJson: nil,
            effectFlags: 0,
            maxViewOnceCount: nil,
            locationJson: OptimisticRecordColumns.locationJson(location, id: localId),
            stickerJson: nil,
            now: Date(),
            ephemeralDuration: nil
        )
        record.state = .failed
        try await fx.sut.messagePersistence.insertOptimistic(record)
        let seeded = await MessageStoreObservationHelper.awaitMessageProperty(
            id: localId, in: fx.sut
        ) { $0.deliveryStatus == .failed }
        XCTAssertTrue(seeded, "precondition: le message en échec doit être visible")
    }

    func test_retryMessage_failedLocationOnlyMessage_resendsWithItsPlace() async throws {
        let fx = try await makeFixture()
        let place = SharedPlace(latitude: 48.8, longitude: 2.3, name: "Paris")
        try await seedFailed(localId: "m_retry_place", content: "", location: place, fixture: fx)

        await fx.sut.retryMessage(messageId: "m_retry_place")

        XCTAssertEqual(fx.messageService.lastSendRequest?.location, place)
    }

    func test_retryMessage_failedForwardedText_keepsForwardedFromId() async throws {
        let fx = try await makeFixture()
        try await seedFailed(
            localId: "m_retry_fwd", content: "transféré",
            forwardedFromId: "m_origin", forwardedFromConversationId: "00000000000000000000cf02",
            fixture: fx
        )

        await fx.sut.retryMessage(messageId: "m_retry_fwd")

        XCTAssertEqual(fx.messageService.lastSendRequest?.forwardedFromId, "m_origin")
        XCTAssertEqual(fx.messageService.lastSendRequest?.forwardedFromConversationId, "00000000000000000000cf02")
    }

    func test_retryMessage_failedReply_keepsReplyToId() async throws {
        let fx = try await makeFixture()
        try await seedFailed(localId: "m_retry_reply", content: "réponse", replyToId: "m_parent", fixture: fx)

        await fx.sut.retryMessage(messageId: "m_retry_reply")

        XCTAssertEqual(fx.messageService.lastSendRequest?.replyToId, "m_parent")
    }
}
