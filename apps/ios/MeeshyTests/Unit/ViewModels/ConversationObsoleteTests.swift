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

        let outcome = await ConversationObsolescence(list: sut).perform(conversationId: "c1")

        XCTAssertEqual(outcome, .obsoleted)
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

        let outcome = await ConversationObsolescence(list: sut).perform(conversationId: "c2")

        XCTAssertEqual(outcome, .refused(.other), "un 403 sur un groupe n'est pas une demande de message")
        XCTAssertEqual(sut.conversations.map(\.id), ["c1", "c2", "c3"])
    }

    func test_perform_unknownConversation_callsNothing() async {
        let service = MockConversationService()
        let sut = makeList(conversationService: service)
        sut.conversations = [makeConversation(id: "c1")]

        let outcome = await ConversationObsolescence(list: sut).perform(conversationId: "ghost")

        XCTAssertEqual(outcome, .absent)
        XCTAssertEqual(service.obsoleteCallCount, 0)
    }

    // MARK: - Le refus dit pourquoi (#14690)

    private func makeDirect(id: String) -> Conversation {
        MeeshyConversation(id: id, identifier: id, type: .direct, title: "Ada", participantUserId: "peer", currentUserRole: "member")
    }

    func test_perform_directRefusedWith403_putsTheRowBackAndSaysOnlyTheRecipientCan() async {
        let service = MockConversationService()
        service.obsoleteResult = .failure(MeeshyError.forbidden(reason: nil, body: nil))
        let sut = makeList(conversationService: service)
        sut.conversations = [makeConversation(id: "c1"), makeDirect(id: "d1")]

        let outcome = await ConversationObsolescence(list: sut).perform(conversationId: "d1")

        XCTAssertEqual(outcome, .refused(.pendingRequest))
        XCTAssertEqual(sut.conversations.map(\.id), ["c1", "d1"])
    }

    func test_perform_directRefusedForAnotherReason_isTheGenericFailure() async {
        let service = MockConversationService()
        service.obsoleteResult = .failure(MeeshyError.server(statusCode: 500, message: "boom"))
        let sut = makeList(conversationService: service)
        sut.conversations = [makeDirect(id: "d1")]

        let outcome = await ConversationObsolescence(list: sut).perform(conversationId: "d1")

        XCTAssertEqual(outcome, .refused(.other))
        XCTAssertEqual(sut.conversations.map(\.id), ["d1"])
    }

    func test_refusal_pendingRequestMessage_isNotTheGenericFailure() {
        XCTAssertEqual(ConversationObsolescence.Refusal.other.message, ConversationObsolescence.failureMessage)
        XCTAssertNotEqual(ConversationObsolescence.Refusal.pendingRequest.message, ConversationObsolescence.failureMessage)
        XCTAssertFalse(ConversationObsolescence.Refusal.pendingRequest.message.isEmpty)
    }

    func test_refusal_of_readsA403OnlyOnADirect() {
        let forbidden = MeeshyError.forbidden(reason: nil, body: nil)
        XCTAssertEqual(ConversationObsolescence.Refusal.of(isDirect: true, error: forbidden), .pendingRequest)
        XCTAssertEqual(ConversationObsolescence.Refusal.of(isDirect: false, error: forbidden), .other)
        XCTAssertEqual(ConversationObsolescence.Refusal.of(isDirect: true, error: URLError(.notConnectedToInternet)), .other)
    }

    // MARK: - Au balayage de fin (#14645)

    func test_trailingSwipePlan_obsoleteNotGranted_keepsArchiveReadHide() {
        XCTAssertEqual(
            ConversationTrailingSwipe.plan(isArchived: false, isArchiveImposed: false, hasUnread: true, obsolete: false),
            [.archive, .markRead, .hide]
        )
    }

    func test_trailingSwipePlan_obsoleteGranted_comesLastAndTheEdgeKeepsThree() {
        let plan = ConversationTrailingSwipe.plan(isArchived: false, isArchiveImposed: false, hasUnread: false, obsolete: true)

        XCTAssertEqual(plan, [.archive, .hide, .obsolete])
        XCTAssertLessThanOrEqual(plan.count, SwipeRowRules.maxActionsPerSide)
    }

    func test_trailingSwipePlan_archiveImposed_obsoleteFitsBesideTheReadToggle() {
        XCTAssertEqual(
            ConversationTrailingSwipe.plan(isArchived: true, isArchiveImposed: true, hasUnread: false, obsolete: true),
            [.markUnread, .hide, .obsolete]
        )
    }

    private func makeSwipeActions(
        list: ConversationListViewModel,
        currentUser: MeeshyUser?,
        onObsolete: @escaping (Conversation) -> Void
    ) -> ConversationSwipeActions {
        ConversationSwipeActions(
            viewModel: list,
            lockManager: ConversationLockManager(
                vault: InMemoryConversationLockVault(),
                defaults: UserDefaults(suiteName: "swipe-obsolete-\(UUID().uuidString)")!,
                biometrics: StubBiometricUnlocker(),
                iterations: 1_000
            ),
            currentUser: currentUser,
            onLockRequest: { _, _ in },
            onMasterPinMissing: {},
            onHide: { _ in },
            onObsolete: onObsolete
        )
    }

    private let reader = MeeshyUser(id: "me", username: "me", displayName: "Me", role: "USER", isAnonymous: false)

    func test_trailingSwipeActions_groupAdmin_lastActionArmsTheMenuConfirmation() {
        let service = MockConversationService()
        let list = makeList(conversationService: service)
        var armed: [String] = []
        let sut = makeSwipeActions(list: list, currentUser: reader) { armed.append($0.id) }

        let actions = sut.trailingSwipeActions(for: makeConversation(id: "c1"))

        XCTAssertEqual(actions.last?.label, ConversationMenuEntry.obsolete.label)
        XCTAssertEqual(actions.last?.icon, ConversationMenuEntry.obsolete.symbol)
        XCTAssertLessThanOrEqual(actions.count, SwipeRowRules.maxActionsPerSide)
        actions.last?.action()
        XCTAssertEqual(armed, ["c1"], "le balayage arme la confirmation du menu")
        XCTAssertEqual(service.obsoleteCallCount, 0, "jamais l'effet sans confirmation")
    }

    func test_trailingSwipeActions_groupMember_offersNoObsolete() {
        let list = makeList()
        let member = MeeshyConversation(id: "c1", identifier: "c1", type: .group, title: "Groupe", currentUserRole: "member")
        let sut = makeSwipeActions(list: list, currentUser: reader) { _ in }

        let labels = sut.trailingSwipeActions(for: member).map(\.label)

        XCTAssertFalse(labels.contains(ConversationMenuEntry.obsolete.label))
        XCTAssertEqual(labels.count, 3)
    }

    func test_trailingSwipeActions_readerNotLoaded_offersNoObsolete() {
        let sut = makeSwipeActions(list: makeList(), currentUser: nil) { _ in }

        XCTAssertFalse(sut.trailingSwipeActions(for: makeDirect(id: "d1")).map(\.label).contains(ConversationMenuEntry.obsolete.label))
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
