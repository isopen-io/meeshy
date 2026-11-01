import Combine
import XCTest
import MeeshySDK
@testable import Meeshy

/// « Mes cercles » (#13938) : la liste par niveau, cache d'abord ; les demandes de
/// montée reçues et envoyées ; la demande de montée en optimiste
/// (instantané -> local -> réseau -> retour arrière). Le serveur reste l'autorité :
/// le client ne PROPOSE que ce que la loi de demande lui laisse espérer.
@MainActor
final class CirclesViewModelTests: XCTestCase {

    private struct Rig {
        let sut: CirclesViewModel
        let relations: MockRelationsService
        let friends: MockFriendService
        let queue: MockOfflineQueue
        let network: FakeNetworkMonitor
        let levelRaised: PassthroughSubject<RelationLevelRaisedEvent, Never>
    }

    override func setUp() async throws {
        try await super.setUp()
        await CacheCoordinator.shared.relationLinks.invalidate(for: CirclesViewModel.cacheKey)
    }

    override func tearDown() async throws {
        await CacheCoordinator.shared.relationLinks.invalidate(for: CirclesViewModel.cacheKey)
        try await super.tearDown()
    }

    private func makeRig(online: Bool = true, people: [CirclePerson] = []) -> Rig {
        let relations = MockRelationsService()
        let friends = MockFriendService()
        let queue = MockOfflineQueue()
        let network = FakeNetworkMonitor(isOnline: online)
        let levelRaised = PassthroughSubject<RelationLevelRaisedEvent, Never>()
        let sut = CirclesViewModel(
            relations: relations,
            friendService: friends,
            people: FakeCirclePeople(people),
            offlineQueue: queue,
            networkMonitor: network,
            languageCode: "fr",
            levelEvents: levelRaised.eraseToAnyPublisher()
        )
        return Rig(sut: sut, relations: relations, friends: friends, queue: queue, network: network, levelRaised: levelRaised)
    }

    private func link(
        _ userId: String,
        _ level: RelationLevel,
        eligibleFor: RelationLevel? = nil,
        weeks: Int = 0,
        needed: Int? = nil
    ) -> RelationLink {
        RelationLink(
            userId: userId, effectiveLevel: level, grantedByMe: level,
            progress: RelationProgress(activeWeeks: weeks, needed: needed, missing: []), eligibleFor: eligibleFor
        )
    }

    private func request(id: String, from senderId: String, to receiverId: String, level: String? = nil, status: String = "pending") -> FriendRequest {
        let levelJson = level.map { ",\n\"targetLevel\": \"\($0)\"" } ?? ""
        return JSONStub.decode("""
        {"id":"\(id)","senderId":"\(senderId)","receiverId":"\(receiverId)","status":"\(status)",
         "createdAt":"2026-11-01T10:00:00Z"\(levelJson)}
        """)
    }

    private func page(_ requests: [FriendRequest]) -> OffsetPaginatedAPIResponse<[FriendRequest]> {
        OffsetPaginatedAPIResponse(success: true, data: requests, pagination: nil, error: nil)
    }

    // MARK: - La liste par niveau

    func test_load_groupsLinksByLevel_highestFirst_andHidesPublicAndCommunity() async {
        let rig = makeRig()
        rig.relations.linksResult = .success([
            link("a", .friend), link("b", .blood), link("c", .acquaintance), link("d", .close),
            link("e", .community), link("f", .public), link("g", .friend),
        ])

        await rig.sut.load()

        XCTAssertEqual(rig.sut.sections.map(\.level), [.blood, .close, .friend, .acquaintance])
        XCTAssertEqual(rig.sut.sections.first { $0.level == .friend }?.rows.map(\.id).sorted(), ["a", "g"])
        XCTAssertEqual(rig.sut.visibleLinkCount, 5)
    }

    func test_load_resolvesTheNamesTheServerNeverSends() async {
        let rig = makeRig(people: [CirclePerson(id: "a", name: "Alice", username: "alice", avatarURL: nil)])
        rig.relations.linksResult = .success([link("a", .friend), link("z", .friend)])

        await rig.sut.load()

        let rows = rig.sut.sections.flatMap(\.rows)
        XCTAssertEqual(rows.first { $0.id == "a" }?.person?.name, "Alice")
        XCTAssertNil(rows.first { $0.id == "z" }?.person, "un inconnu garde un nom absent, jamais inventé")
    }

    func test_load_withAnEmptyServerList_isTheEmptyState_notASkeleton() async {
        let rig = makeRig()

        await rig.sut.load()

        XCTAssertTrue(rig.sut.sections.isEmpty)
        XCTAssertTrue(rig.sut.isEmptyState)
        XCTAssertFalse(rig.sut.showsSkeleton)
    }

    func test_load_withCachedLinks_showsThemEvenWhenTheNetworkFails() async throws {
        let rig = makeRig()
        try await CacheCoordinator.shared.relationLinks.save([link("cached", .close)], for: CirclesViewModel.cacheKey)
        rig.relations.linksResult = .failure(URLError(.notConnectedToInternet))

        await rig.sut.load()

        XCTAssertEqual(rig.sut.sections.flatMap(\.rows).map(\.id), ["cached"], "jamais de spinner ni d'écran vide sur un cache non vide")
        XCTAssertFalse(rig.sut.showsSkeleton)
    }

    func test_load_failureOnline_withoutCache_isAnErrorTheUserCanRetry() async {
        let rig = makeRig(online: true)
        rig.relations.linksResult = .failure(URLError(.badServerResponse))

        await rig.sut.load()

        XCTAssertNotNil(rig.sut.errorMessage)
        XCTAssertFalse(rig.sut.isOffline)
    }

    func test_load_failureOffline_withoutCache_isOffline() async {
        let rig = makeRig(online: false)
        rig.relations.linksResult = .failure(URLError(.notConnectedToInternet))

        await rig.sut.load()

        XCTAssertTrue(rig.sut.isOffline)
        XCTAssertNil(rig.sut.errorMessage)
    }

    func test_load_takesTheLevelLabelsFromTheServedConfig_inTheInterfaceLanguage() async {
        let rig = makeRig()
        rig.relations.configResult = .success(RelationsConfig(levels: [
            RelationLevelPresentation(level: "CLOSE", labelKey: "k", icon: "🔥", labels: ["fr": "Proche", "en": "Close"])
        ]))
        rig.relations.linksResult = .success([link("a", .close)])

        await rig.sut.load()

        XCTAssertEqual(rig.sut.title(of: .close), "Proche")
        XCTAssertEqual(rig.sut.icon(of: .close), "🔥")
    }

    func test_load_withoutAConfig_fallsBackToTheLocalNames() async {
        let rig = makeRig()
        rig.relations.configResult = .failure(URLError(.timedOut))
        rig.relations.linksResult = .success([link("a", .blood)])

        await rig.sut.load()

        XCTAssertFalse(rig.sut.title(of: .blood).isEmpty)
        XCTAssertFalse(rig.sut.icon(of: .blood).isEmpty)
    }

    // MARK: - La demande de montée, en optimiste

    func test_requestRaise_isAppliedLocallyThenQueued() async throws {
        let rig = makeRig()
        let acquaintance = link("a", .acquaintance)

        let queued = await rig.sut.requestRaise(acquaintance)

        XCTAssertTrue(queued)
        XCTAssertEqual(rig.sut.pendingTargets["a"], .friend, "l'état local précède le réseau")
        XCTAssertEqual(rig.queue.enqueueCalls.count, 1)
        XCTAssertEqual(rig.queue.enqueueCalls.first?.kind, .sendFriendRequest)
        let payload = try XCTUnwrap(rig.queue.lastPayload as? SendFriendRequestPayload)
        XCTAssertEqual(payload.targetUserId, "a")
        XCTAssertEqual(payload.targetLevel, "FRIEND")
    }

    func test_requestRaise_toCloseCarriesTheCloseLevel() async throws {
        let rig = makeRig()

        _ = await rig.sut.requestRaise(link("a", .friend, eligibleFor: .close, weeks: 4, needed: 4))

        let payload = try XCTUnwrap(rig.queue.lastPayload as? SendFriendRequestPayload)
        XCTAssertEqual(payload.targetLevel, "CLOSE")
    }

    func test_requestRaise_whenTheSeriesIsNotServedAsEligible_proposesNothing() async {
        let rig = makeRig()

        let queued = await rig.sut.requestRaise(link("a", .friend, weeks: 3, needed: 4))

        XCTAssertFalse(queued)
        XCTAssertTrue(rig.queue.enqueueCalls.isEmpty)
        XCTAssertTrue(rig.sut.pendingTargets.isEmpty)
    }

    func test_requestRaise_atTheTop_proposesNothing() async {
        let rig = makeRig()

        let queued = await rig.sut.requestRaise(link("a", .blood))

        XCTAssertFalse(queued)
        XCTAssertTrue(rig.queue.enqueueCalls.isEmpty)
    }

    func test_requestRaise_enqueueFailure_rollsBackAndSaysSo() async {
        let rig = makeRig()
        rig.queue.enqueueResult = .failure(NSError(domain: "test", code: 1))

        let queued = await rig.sut.requestRaise(link("a", .acquaintance))

        XCTAssertFalse(queued)
        XCTAssertNil(rig.sut.pendingTargets["a"], "le retour arrière efface l'état local")
        XCTAssertNotNil(rig.sut.notice)
    }

    func test_requestRaise_exhaustedOutcome_rollsBackLater() async throws {
        let rig = makeRig()
        _ = await rig.sut.requestRaise(link("a", .acquaintance))
        let cmid = try XCTUnwrap((rig.queue.lastPayload as? SendFriendRequestPayload)?.clientMutationId)
        try await waitForCondition(timeout: 2) { rig.queue.outcomeContinuations[cmid] != nil }

        rig.queue.emitOutcome(.exhausted(cmid: cmid), for: cmid)

        try await waitForCondition(timeout: 2) { rig.sut.pendingTargets["a"] == nil }
        XCTAssertNotNil(rig.sut.notice)
    }

    func test_requestRaise_twiceForTheSamePerson_queuesOnce() async {
        let rig = makeRig()
        let acquaintance = link("a", .acquaintance)

        _ = await rig.sut.requestRaise(acquaintance)
        let second = await rig.sut.requestRaise(acquaintance)

        XCTAssertFalse(second)
        XCTAssertEqual(rig.queue.enqueueCalls.count, 1)
    }

    func test_levelRaisedEvent_clearsThePendingRequestAndReloadsTheCircles() async {
        let rig = makeRig()
        rig.relations.linksResult = .success([link("a", .acquaintance)])
        await rig.sut.load()
        _ = await rig.sut.requestRaise(link("a", .acquaintance))
        rig.relations.linksResult = .success([link("a", .friend)])
        let before = rig.relations.linksCallCount

        await rig.sut.receive(levelRaised: RelationLevelRaisedEvent(userId: "a", level: .friend, at: nil))

        XCTAssertNil(rig.sut.pendingTargets["a"])
        XCTAssertGreaterThan(rig.relations.linksCallCount, before)
        XCTAssertEqual(rig.sut.sections.map(\.level), [.friend])
    }

    // MARK: - Les demandes de montée

    func test_requests_keepOnlyPendingOnesFromAndToPeopleAlreadyInTheCircles() async {
        let rig = makeRig()
        rig.relations.linksResult = .success([link("a", .friend), link("b", .friend)])
        rig.friends.receivedRequestsResult = .success(page([
            request(id: "r1", from: "a", to: "me", level: "CLOSE"),
            request(id: "r2", from: "stranger", to: "me"),
            request(id: "r3", from: "b", to: "me", level: "CLOSE", status: "accepted"),
        ]))
        rig.friends.sentRequestsResult = .success(page([
            request(id: "s1", from: "me", to: "b", level: "CLOSE"),
            request(id: "s2", from: "me", to: "stranger"),
        ]))

        await rig.sut.load()

        XCTAssertEqual(rig.sut.incomingRaises.map(\.id), ["r1"])
        XCTAssertEqual(rig.sut.outgoingRaises.map(\.id), ["s1"])
        XCTAssertEqual(rig.sut.pendingLevel(for: "b"), .close, "ma demande envoyée se lit sur la ligne de la personne")
    }

    func test_accept_aRaiseBelowBlood_isRemovedLocallyAndQueuedAsAnAcceptance() async throws {
        let rig = makeRig()
        rig.relations.linksResult = .success([link("a", .friend)])
        rig.friends.receivedRequestsResult = .success(page([request(id: "r1", from: "a", to: "me", level: "CLOSE")]))
        await rig.sut.load()

        await rig.sut.accept(try XCTUnwrap(rig.sut.incomingRaises.first))

        XCTAssertTrue(rig.sut.incomingRaises.isEmpty)
        XCTAssertEqual(rig.queue.enqueueCalls.first?.kind, .respondFriendRequest)
        let payload = try XCTUnwrap(rig.queue.lastPayload as? RespondFriendRequestPayload)
        XCTAssertEqual(payload.friendRequestId, "r1")
        XCTAssertEqual(payload.action, .accept)
    }

    func test_accept_aBloodRequest_opensTheRitualInsteadOfAcceptingByPatch() async throws {
        let rig = makeRig(people: [CirclePerson(id: "a", name: "Alice", username: nil, avatarURL: nil)])
        rig.relations.linksResult = .success([link("a", .close)])
        rig.friends.receivedRequestsResult = .success(page([request(id: "r1", from: "a", to: "me", level: "BLOOD")]))
        await rig.sut.load()

        await rig.sut.accept(try XCTUnwrap(rig.sut.incomingRaises.first))

        XCTAssertTrue(rig.queue.enqueueCalls.isEmpty, "le serveur répond RELATION_RITUAL_REQUIRED : on ouvre le rituel")
        XCTAssertEqual(rig.sut.ritualTarget?.userId, "a")
        XCTAssertEqual(rig.sut.ritualTarget?.name, "Alice")
        XCTAssertEqual(rig.sut.incomingRaises.map(\.id), ["r1"], "la demande reste tant que le rituel n'a pas scellé")
    }

    func test_decline_isQueuedAsARefusal_andRestoredWhenTheQueueRefuses() async throws {
        let rig = makeRig()
        rig.relations.linksResult = .success([link("a", .friend)])
        rig.friends.receivedRequestsResult = .success(page([request(id: "r1", from: "a", to: "me", level: "CLOSE")]))
        await rig.sut.load()
        rig.queue.enqueueResult = .failure(NSError(domain: "test", code: 1))

        await rig.sut.decline(try XCTUnwrap(rig.sut.incomingRaises.first))

        XCTAssertEqual(rig.sut.incomingRaises.map(\.id), ["r1"], "le retour arrière remet la demande")
        XCTAssertNotNil(rig.sut.notice)
    }

    func test_cancelOutgoing_removesItAndRestoresItWhenTheServerRefuses() async throws {
        let rig = makeRig()
        rig.relations.linksResult = .success([link("b", .friend)])
        rig.friends.sentRequestsResult = .success(page([request(id: "s1", from: "me", to: "b", level: "CLOSE")]))
        await rig.sut.load()
        rig.friends.deleteResult = .failure(NSError(domain: "test", code: 1))

        await rig.sut.cancel(try XCTUnwrap(rig.sut.outgoingRaises.first))

        XCTAssertEqual(rig.friends.deleteCallCount, 1)
        XCTAssertEqual(rig.sut.outgoingRaises.map(\.id), ["s1"])

        rig.friends.deleteResult = .success(())
        await rig.sut.cancel(try XCTUnwrap(rig.sut.outgoingRaises.first))
        XCTAssertTrue(rig.sut.outgoingRaises.isEmpty)
    }
}
