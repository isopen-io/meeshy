import XCTest
import GRDB
@testable import Meeshy
import MeeshySDK

@MainActor
final class ConversationSendStateProjectionTests: XCTestCase {

    private let conversationId = "00000000000000000000ab12"
    private let userId = "00000000000000000000ab99"

    override func setUp() async throws {
        try await super.setUp()
        APIClient.shared.anonymousSessionToken = nil
    }

    override func tearDown() async throws {
        MessageSocketManager.shared.isConnected = false
        APIClient.shared.anonymousSessionToken = nil
        try await super.tearDown()
    }

    private func makeSUT(pool: DatabaseQueue? = nil) async throws -> ConversationViewModel {
        await CacheCoordinator.shared.messages.invalidate(for: conversationId)
        let auth = MockAuthManager()
        auth.simulateLoggedIn(user: MeeshyUser(id: userId, username: "etat", displayName: "État"))
        let pool = try pool ?? DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: pool)
        MessageSocketManager.shared.isConnected = true
        let sut = ConversationViewModel(
            conversationId: conversationId,
            authManager: auth,
            messageService: MockMessageService(),
            conversationService: MockConversationService(),
            reactionService: MockReactionService(),
            reportService: MockReportService(),
            messageSocket: MockMessageSocket(),
            dependencies: ConversationDependencies(dbPool: pool, persistence: MessagePersistenceActor(dbWriter: pool)),
            networkMonitor: FakeNetworkMonitor(isOnline: true),
            offlineQueue: FakeOfflineMessageQueue()
        )
        sut.start()
        return sut
    }

    private func makeOutgoing(content: String) -> OutgoingMessage {
        OutgoingMessage(
            conversationId: ConversationID(conversationId),
            content: content,
            relation: .none,
            attachments: OutgoingAttachments(ids: nil, previews: nil)
        )
    }

    func test_send_completesAndReturnsActivityToIdle() async throws {
        let sut = try await makeSUT()

        _ = await sut.send(makeOutgoing(content: "Salut"))

        XCTAssertEqual(sut.sendActivity, .idle)
        XCTAssertFalse(sut.isSending)
    }

    func test_twoConcurrentSends_finishIdle() async throws {
        let sut = try await makeSUT()

        let firstMessage = makeOutgoing(content: "😂")
        let secondMessage = makeOutgoing(content: "😂")
        async let first = sut.send(firstMessage)
        async let second = sut.send(secondMessage)
        _ = await (first, second)

        XCTAssertEqual(sut.sendActivity, .idle)
    }

    func test_outgoingState_unknownId_isNil() async throws {
        let sut = try await makeSUT()

        let state = sut.outgoingState(of: "inconnu")

        XCTAssertNil(state)
    }

    func test_outgoingState_messageWhoseDeliveryFailed_isFailed() async throws {
        let pool = try DatabaseQueue()
        let sut = try await makeSUT(pool: pool)
        let record = MessageStoreObservationHelper.makeRecord(
            localId: "echec", conversationId: conversationId, senderId: userId, content: "jamais parti", state: .failed
        )
        try await MessagePersistenceActor(dbWriter: pool).insertOptimistic(record)
        _ = await MessageStoreObservationHelper.awaitMessage(in: sut) { $0.id == "echec" }

        let state = sut.outgoingState(of: "echec")

        XCTAssertEqual(state?.messageId, "echec")
        XCTAssertEqual(state?.isFailed, true)
    }

    func test_viewModelFamily_declaresNoPublishedSendFlag() throws {
        let source = AppSourceGuard.stripComments(
            try AppSourceGuard.unit("Meeshy/Features/Main/ViewModels/ConversationViewModel.swift")
        )

        XCTAssertFalse(source.contains("@Published var isSending"))
        XCTAssertFalse(source.contains("var inFlightSendCount"))
    }

    func test_conversationViews_readSendStateOnlyThroughProjections() throws {
        let files = AppSourceGuard.unitURLs("Meeshy/Features/Main/Views/ConversationView.swift")
        XCTAssertGreaterThan(files.count, 3)

        for file in files {
            let source = AppSourceGuard.stripComments(
                try String(contentsOf: file, encoding: .utf8)
            )
            XCTAssertFalse(source.contains("viewModel.isSending"), file.lastPathComponent)
            XCTAssertFalse(source.contains("viewModel.inFlightSendCount"), file.lastPathComponent)
            XCTAssertFalse(source.contains("].deliveryStatus =="), file.lastPathComponent)
        }
    }
}
