import XCTest
import Combine
import MeeshySDK
@testable import Meeshy

/// #14645 — rendre une conversation obsolète en un geste : la ligne disparaît
/// tout de suite (optimiste), revient si la passerelle refuse, et
/// `conversation:obsoleted` ferme le fil ouvert. Le retrait des listes des
/// autres membres passe par le store (`ConversationStoreSocketBridgeTests`)
/// et le cache (`CacheCoordinatorConversationObsolescenceTests`).
@MainActor
final class ConversationObsoleteTests: XCTestCase {

    private let conversationId = "000000000000000000000099"

    // MARK: - Factory

    private func makeList(
        conversationService: MockConversationService = MockConversationService(),
        messageSocket: MockMessageSocket = MockMessageSocket()
    ) -> ConversationListViewModel {
        let draftStore = DraftStore(userDefaults: UserDefaults(suiteName: "ConvObsoleteTests-\(UUID().uuidString)")!)
        draftStore.clearAll()
        return ConversationListViewModel(
            conversationService: conversationService,
            preferenceService: MockPreferenceService(),
            messageSocket: messageSocket,
            messageService: MockMessageService(),
            authManager: MockAuthManager(),
            storyService: MockStoryService(),
            syncEngine: MockConversationSyncEngine(),
            messageNotificationPublisher: PassthroughSubject<MessageActivitySignal, Never>().eraseToAnyPublisher(),
            draftStore: draftStore,
            store: ConversationListViewModelTests.makeTestStore(),
            categoryStore: UserCategoryStore(service: ConvListTestCategoryWriter())
        )
    }

    private func makeConversation(id: String) -> Conversation {
        MeeshyConversation(id: id, identifier: id, type: .group, title: "Groupe \(id)", currentUserRole: "admin")
    }

    private func makeObsoletedEvent(conversationId: String) -> ConversationObsoletedEvent {
        ConversationObsoletedEvent(
            conversationId: conversationId,
            obsoletedBy: "admin-1",
            obsoletedAt: "2026-11-02T10:00:00.000Z",
            purgeAfter: "2026-11-04T10:00:00.000Z"
        )
    }

    private func waitUntil(_ condition: () -> Bool) async {
        for _ in 0..<100 where !condition() {
            try? await Task.sleep(nanoseconds: 10_000_000)
        }
    }

    // MARK: - Le geste (optimiste)

    func test_perform_success_removesTheRowAndCallsTheGateway() async {
        let service = MockConversationService()
        let sut = makeList(conversationService: service)
        sut.conversations = [makeConversation(id: "c1"), makeConversation(id: "c2")]

        let succeeded = await ConversationObsolescence(list: sut).perform(conversationId: "c1")

        XCTAssertTrue(succeeded)
        XCTAssertEqual(sut.conversations.map(\.id), ["c2"])
        XCTAssertEqual(service.obsoleteCallCount, 1)
        XCTAssertEqual(service.lastObsoleteConversationId, "c1")
    }

    func test_perform_rowLeavesBeforeTheGatewayAnswers() async {
        let service = MockConversationService()
        let sut = makeList(conversationService: service)
        sut.conversations = [makeConversation(id: "c1"), makeConversation(id: "c2")]
        var rowsWhenTheGatewayWasCalled: [String]?
        let probe = sut.conversationLeavesDetail.sink { _ in rowsWhenTheGatewayWasCalled = sut.conversations.map(\.id) }
        defer { probe.cancel() }

        await ConversationObsolescence(list: sut).perform(conversationId: "c1")

        XCTAssertEqual(rowsWhenTheGatewayWasCalled, ["c2"], "la ligne disparaît au geste, pas à la réponse")
    }

    func test_perform_gatewayRefuses_putsTheRowBackAtItsPlace() async {
        let service = MockConversationService()
        service.obsoleteResult = .failure(MeeshyError.forbidden(reason: nil, body: nil))
        let sut = makeList(conversationService: service)
        sut.conversations = [makeConversation(id: "c1"), makeConversation(id: "c2"), makeConversation(id: "c3")]

        let succeeded = await ConversationObsolescence(list: sut).perform(conversationId: "c2")

        XCTAssertFalse(succeeded)
        XCTAssertEqual(sut.conversations.map(\.id), ["c1", "c2", "c3"])
    }

    func test_perform_unknownConversation_callsNothing() async {
        let service = MockConversationService()
        let sut = makeList(conversationService: service)
        sut.conversations = [makeConversation(id: "c1")]

        let succeeded = await ConversationObsolescence(list: sut).perform(conversationId: "ghost")

        XCTAssertFalse(succeeded)
        XCTAssertEqual(service.obsoleteCallCount, 0)
    }

    // MARK: - conversation:obsoleted, fil ouvert

    private func makeHandler(socket: MockMessageSocket) -> (ConversationSocketHandler, MockConversationSocketDelegate) {
        let handler = ConversationSocketHandler(
            conversationId: conversationId,
            currentUserId: "000000000000000000000001",
            messageSocket: socket
        )
        let delegate = MockConversationSocketDelegate()
        handler.delegate = delegate
        handler.armSocketSubscriptions()
        return (handler, delegate)
    }

    func test_socketObsoleted_openConversation_closesTheScreen() async {
        let socket = MockMessageSocket()
        let (handler, delegate) = makeHandler(socket: socket)

        socket.conversationObsoleted.send(makeObsoletedEvent(conversationId: conversationId))
        await waitUntil { !delegate.accessRevokedReasons.isEmpty }

        XCTAssertEqual(delegate.accessRevokedReasons, [ConversationSocketHandler.obsoletedNotice])
        withExtendedLifetime(handler) {}
    }

    func test_socketObsoleted_anotherConversation_keepsTheScreenOpen() async {
        let socket = MockMessageSocket()
        let (handler, delegate) = makeHandler(socket: socket)

        socket.conversationObsoleted.send(makeObsoletedEvent(conversationId: "000000000000000000000042"))
        try? await Task.sleep(nanoseconds: 50_000_000)

        XCTAssertTrue(delegate.accessRevokedReasons.isEmpty)
        withExtendedLifetime(handler) {}
    }
}
