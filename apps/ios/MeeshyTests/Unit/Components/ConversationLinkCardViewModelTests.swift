import XCTest
import MeeshySDK
@testable import Meeshy

/// #8099 — la carte se rend cache d'abord, choisit ses boutons selon
/// `viewer`/`link`, et joint, quitte ou ouvre par les chemins existants.
@MainActor
final class ConversationLinkCardViewModelTests: XCTestCase {

    // MARK: - Doubles

    final class MockConversationCardService: ConversationCardServiceProviding, @unchecked Sendable {
        var cachedResult: CacheResult<ConversationCardResolution> = .empty
        var refreshResult: ConversationCardResolution = .unavailable
        private(set) var refreshCount = 0
        private(set) var stored: [ConversationCardResolution] = []
        private(set) var invalidateCount = 0

        func cached(_ target: ConversationCardTarget) -> CacheResult<ConversationCardResolution> { cachedResult }
        func refresh(_ target: ConversationCardTarget) async -> ConversationCardResolution {
            refreshCount += 1
            return refreshResult
        }
        func store(_ resolution: ConversationCardResolution, for target: ConversationCardTarget) { stored.append(resolution) }
        func invalidate(_ target: ConversationCardTarget) { invalidateCount += 1 }
        private(set) var invalidatedConversations: [ConversationCardChange] = []
        func invalidate(conversationId: String, from origin: ConversationCardTarget) {
            let change = ConversationCardChange(conversationId: conversationId, origin: origin)
            invalidatedConversations.append(change)
            NotificationCenter.default.post(name: ConversationCardChange.notification, object: change)
        }
    }

    @MainActor
    final class MockConversationCardActions: ConversationCardActionPerforming {
        var joinResult: Result<String, Error> = .success("conv-joined")
        var leaveResult: Result<Void, Error> = .success(())
        private(set) var joinCount = 0
        private(set) var joinedIdentifiers: [String] = []
        private(set) var anonymousIdentifiers: [String] = []
        private(set) var leftIds: [String] = []
        private(set) var openedIds: [String] = []

        func join(identifier: String) async throws -> String {
            joinCount += 1
            joinedIdentifiers.append(identifier)
            return try joinResult.get()
        }
        func joinAnonymously(identifier: String) { anonymousIdentifiers.append(identifier) }
        func leave(conversationId: String) async throws {
            leftIds.append(conversationId)
            try leaveResult.get()
        }
        func open(conversationId: String) { openedIds.append(conversationId) }
    }

    // MARK: - Fabriques

    private func makeCard(kind: ConversationCardKind = .shareLink,
                          conversationId: String? = nil,
                          isMember: Bool = false,
                          canJoinAnonymously: Bool = false,
                          isActive: Bool = true) -> ConversationCard {
        ConversationCard(
            kind: kind, conversationId: conversationId, title: "Club", description: "Un club",
            avatarUrl: nil, bannerUrl: nil, conversationType: "group",
            stats: ConversationCardStats(memberCount: 12, messageCount: nil, languages: ["fr", "en"]),
            viewer: ConversationCardViewer(isMember: isMember, canJoin: !isMember && kind == .shareLink && isActive,
                                           requiresAccount: false, canJoinAnonymously: canJoinAnonymously),
            link: kind == .shareLink ? ConversationCardLink(identifier: "abc", isActive: isActive, expiresAt: nil) : nil
        )
    }

    private func makeSUT(target: ConversationCardTarget = .shareLink(identifier: "abc"),
                         cached: CacheResult<ConversationCardResolution> = .empty,
                         refresh: ConversationCardResolution = .unavailable)
        -> (ConversationLinkCardViewModel, MockConversationCardService, MockConversationCardActions) {
        let service = MockConversationCardService()
        service.cachedResult = cached
        service.refreshResult = refresh
        let actions = MockConversationCardActions()
        let sut = ConversationLinkCardViewModel(target: target, service: service, performer: actions, viewerHasAccount: false)
        return (sut, service, actions)
    }

    // MARK: - Cache d'abord

    func test_init_freshCache_rendersCardWithoutLoadingAndSkipsNetwork() async {
        let card = makeCard()
        let (sut, service, _) = makeSUT(cached: .fresh(.card(card), age: 1))
        XCTAssertEqual(sut.phase, .card(card))
        await sut.load()
        XCTAssertEqual(service.refreshCount, 0)
    }

    func test_init_emptyCache_startsLoadingThenShowsCard() async {
        let card = makeCard()
        let (sut, service, _) = makeSUT(refresh: .card(card))
        XCTAssertEqual(sut.phase, .loading)
        await sut.load()
        XCTAssertEqual(service.refreshCount, 1)
        XCTAssertEqual(sut.phase, .card(card))
    }

    func test_load_staleCardAndUnavailableRefresh_keepsTheCard() async {
        let card = makeCard()
        let (sut, service, _) = makeSUT(cached: .stale(.card(card), age: 500), refresh: .unavailable)
        await sut.load()
        XCTAssertEqual(service.refreshCount, 1)
        XCTAssertEqual(sut.phase, .card(card))
    }

    // MARK: - Dégradation

    func test_load_serverWithoutRoute_fallsBackToGenericPreview() async {
        let (sut, _, _) = makeSUT(refresh: .unavailable)
        await sut.load()
        XCTAssertEqual(sut.phase, .unavailable)
        XCTAssertEqual(sut.actions, .none)
    }

    func test_load_direct404_rendersPrivateCardWithoutActions() async {
        let (sut, _, _) = makeSUT(target: .direct(conversationId: "c1"), refresh: .privateConversation)
        await sut.load()
        XCTAssertEqual(sut.phase, .privateConversation)
        XCTAssertEqual(sut.actions, .none)
    }

    // MARK: - Actions selon viewer / link

    func test_actions_nonMemberActiveLink_joinOnly() {
        let (sut, _, _) = makeSUT(cached: .fresh(.card(makeCard()), age: 1))
        XCTAssertEqual(sut.actions, .join(identifier: "abc", allowsAnonymous: false))
    }

    func test_actions_nonMemberLinkAllowingGuests_joinWithAnonymous() {
        let (sut, _, _) = makeSUT(cached: .fresh(.card(makeCard(canJoinAnonymously: true)), age: 1))
        XCTAssertEqual(sut.actions, .join(identifier: "abc", allowsAnonymous: true))
    }

    func test_actions_member_leaveOrOpen() {
        let card = makeCard(kind: .direct, conversationId: "c1", isMember: true)
        let (sut, _, _) = makeSUT(target: .direct(conversationId: "c1"), cached: .fresh(.card(card), age: 1))
        XCTAssertEqual(sut.actions, .leaveOrOpen(conversationId: "c1"))
    }

    func test_actions_expiredLink_none() {
        let (sut, _, _) = makeSUT(cached: .fresh(.card(makeCard(isActive: false)), age: 1))
        XCTAssertEqual(sut.actions, .none)
    }

    // MARK: - Rejoindre

    func test_join_success_flipsToMemberCachesAndOpens() async {
        let (sut, service, actions) = makeSUT(cached: .fresh(.card(makeCard()), age: 1))
        await sut.join()
        XCTAssertEqual(actions.joinedIdentifiers, ["abc"])
        XCTAssertEqual(actions.openedIds, ["conv-joined"])
        XCTAssertEqual(sut.actions, .leaveOrOpen(conversationId: "conv-joined"))
        XCTAssertEqual(sut.pending, .none)
        XCTAssertNil(sut.errorMessage)
        XCTAssertEqual(service.stored.count, 1)
    }

    func test_join_failure_rollsBackAndRendersError() async {
        let card = makeCard()
        let (sut, _, actions) = makeSUT(cached: .fresh(.card(card), age: 1))
        actions.joinResult = .failure(MeeshyError.server(statusCode: 410, message: ""))
        await sut.join()
        XCTAssertEqual(sut.phase, .card(card))
        XCTAssertEqual(sut.pending, .none)
        XCTAssertNotNil(sut.errorMessage)
        XCTAssertTrue(actions.openedIds.isEmpty)
    }

    func test_joinAnonymously_allowed_usesGuestPath() {
        let (sut, _, actions) = makeSUT(cached: .fresh(.card(makeCard(canJoinAnonymously: true)), age: 1))
        sut.joinAnonymously()
        XCTAssertEqual(actions.anonymousIdentifiers, ["abc"])
        XCTAssertEqual(actions.joinCount, 0)
    }

    func test_joinAnonymously_notAllowed_doesNothing() {
        let (sut, _, actions) = makeSUT(cached: .fresh(.card(makeCard(canJoinAnonymously: false)), age: 1))
        sut.joinAnonymously()
        XCTAssertTrue(actions.anonymousIdentifiers.isEmpty)
    }

    // MARK: - Quitter / Ouvrir

    func test_leave_shareLinkMember_becomesJoinableAgain() async {
        let card = makeCard(conversationId: "c1", isMember: true)
        let (sut, service, actions) = makeSUT(cached: .fresh(.card(card), age: 1))
        await sut.leave()
        XCTAssertEqual(actions.leftIds, ["c1"])
        XCTAssertEqual(service.invalidatedConversations.map(\.conversationId), ["c1"])
        XCTAssertEqual(sut.actions, .join(identifier: "abc", allowsAnonymous: false))
    }

    func test_leave_directMember_becomesPrivate() async {
        let card = makeCard(kind: .direct, conversationId: "c1", isMember: true)
        let (sut, _, _) = makeSUT(target: .direct(conversationId: "c1"), cached: .fresh(.card(card), age: 1))
        await sut.leave()
        XCTAssertEqual(sut.phase, .privateConversation)
    }

    func test_leave_failure_restoresMemberCardWithError() async {
        let card = makeCard(kind: .direct, conversationId: "c1", isMember: true)
        let (sut, _, actions) = makeSUT(target: .direct(conversationId: "c1"), cached: .fresh(.card(card), age: 1))
        actions.leaveResult = .failure(MeeshyError.server(statusCode: 500, message: "x"))
        await sut.leave()
        XCTAssertEqual(sut.phase, .card(card))
        XCTAssertNotNil(sut.errorMessage)
    }

    func test_open_member_navigatesToConversation() {
        let card = makeCard(kind: .direct, conversationId: "c1", isMember: true)
        let (sut, _, actions) = makeSUT(target: .direct(conversationId: "c1"), cached: .fresh(.card(card), age: 1))
        sut.open()
        XCTAssertEqual(actions.openedIds, ["c1"])
    }

    func test_open_nonMember_doesNothing() {
        let (sut, _, actions) = makeSUT(cached: .fresh(.card(makeCard()), age: 1))
        sut.open()
        XCTAssertTrue(actions.openedIds.isEmpty)
    }

    // MARK: - #8138 — les autres cartes de la même conversation suivent le geste

    func test_join_success_invalidatesEveryCardOfTheConversation() async {
        let (sut, service, _) = makeSUT(cached: .fresh(.card(makeCard()), age: 1))
        await sut.join()
        XCTAssertEqual(service.invalidatedConversations,
                       [ConversationCardChange(conversationId: "conv-joined", origin: .shareLink(identifier: "abc"))])
    }

    func test_leave_success_invalidatesEveryCardOfTheConversation() async {
        let card = makeCard(kind: .direct, conversationId: "c1", isMember: true)
        let (sut, service, _) = makeSUT(target: .direct(conversationId: "c1"), cached: .fresh(.card(card), age: 1))
        await sut.leave()
        XCTAssertEqual(service.invalidatedConversations,
                       [ConversationCardChange(conversationId: "c1", origin: .direct(conversationId: "c1"))])
    }

    func test_join_success_countsTheReaderAmongMembers() async {
        let (sut, _, _) = makeSUT(cached: .fresh(.card(makeCard()), age: 1))
        await sut.join()
        guard case .card(let joined) = sut.phase else { return XCTFail("la carte reste une carte") }
        XCTAssertEqual(joined.stats.memberCount, 13)
    }

    func test_conversationChange_fromAnotherCard_directPrivateCardReloadsAsMember() async {
        let member = makeCard(kind: .direct, conversationId: "c1", isMember: true)
        let (sut, service, _) = makeSUT(target: .direct(conversationId: "c1"),
                                        cached: .fresh(.privateConversation, age: 1), refresh: .card(member))
        XCTAssertEqual(sut.phase, .privateConversation)
        NotificationCenter.default.post(name: ConversationCardChange.notification,
                                        object: ConversationCardChange(conversationId: "c1", origin: .shareLink(identifier: "abc")))
        await waitUntil { sut.phase == .card(member) }
        XCTAssertEqual(service.refreshCount, 1)
    }

    func test_conversationChange_fromAnotherCard_shareMemberCardReloadsAsJoinable() async {
        let member = makeCard(conversationId: "c1", isMember: true)
        let joinable = makeCard()
        let (sut, _, _) = makeSUT(cached: .fresh(.card(member), age: 1), refresh: .card(joinable))
        NotificationCenter.default.post(name: ConversationCardChange.notification,
                                        object: ConversationCardChange(conversationId: "c1", origin: .direct(conversationId: "c1")))
        await waitUntil { sut.phase == .card(joinable) }
        XCTAssertEqual(sut.actions, .join(identifier: "abc", allowsAnonymous: false))
    }

    func test_conversationChange_fromItsOwnGesture_doesNotReload() async {
        let card = makeCard(kind: .direct, conversationId: "c1", isMember: true)
        let (sut, service, _) = makeSUT(target: .direct(conversationId: "c1"), cached: .fresh(.card(card), age: 1))
        await sut.leave()
        try? await Task.sleep(nanoseconds: 150_000_000)
        XCTAssertEqual(service.refreshCount, 0)
        XCTAssertEqual(sut.phase, .privateConversation)
    }

    func test_conversationChange_fromAnotherCardOfTheSameLink_reloads() async {
        let member = makeCard(conversationId: "c1", isMember: true)
        let (sut, service, _) = makeSUT(cached: .fresh(.card(makeCard()), age: 1), refresh: .card(member))
        NotificationCenter.default.post(name: ConversationCardChange.notification,
                                        object: ConversationCardChange(conversationId: "c1", origin: .shareLink(identifier: "abc")))
        await waitUntil { service.refreshCount == 1 }
    }

    // MARK: - « Rejoindre en anonyme » n'existe que pour un visiteur sans compte

    func test_actions_connectedAccountOnGuestFriendlyLink_joinsInItsOwnNameOnly() {
        let service = MockConversationCardService()
        service.cachedResult = .fresh(.card(makeCard(canJoinAnonymously: true)), age: 1)
        let sut = ConversationLinkCardViewModel(target: .shareLink(identifier: "abc"), service: service,
                                                performer: MockConversationCardActions(), viewerHasAccount: true)
        XCTAssertEqual(sut.actions, .join(identifier: "abc", allowsAnonymous: false))
    }

    func test_conversationChange_ofAnotherConversation_isIgnored() async {
        let (sut, service, _) = makeSUT(target: .direct(conversationId: "c1"), cached: .fresh(.privateConversation, age: 1))
        NotificationCenter.default.post(name: ConversationCardChange.notification,
                                        object: ConversationCardChange(conversationId: "c9", origin: .shareLink(identifier: "zz")))
        try? await Task.sleep(nanoseconds: 100_000_000)
        XCTAssertEqual(service.refreshCount, 0)
        XCTAssertEqual(sut.phase, .privateConversation)
    }

    private func waitUntil(timeout: TimeInterval = 5, _ condition: @MainActor () -> Bool) async {
        let deadline = Date().addingTimeInterval(timeout)
        while !condition(), Date() < deadline {
            try? await Task.sleep(nanoseconds: 20_000_000)
        }
        XCTAssertTrue(condition(), "la condition attendue n'est pas tenue")
    }
}
