import XCTest
import MeeshySDK
@testable import Meeshy

/// Le profil d'un Ami ou d'un Proche montre le niveau COMMUN (#13940) — celui que `GET /relations` sert à l'appelant
/// seul, donc visible des deux seuls — et l'action de montée quand la loi de demande la laisse proposer. Rien n'est
/// fabriqué : sans lien servi, le profil garde le badge « Connectés » d'avant.
@MainActor
final class ProfileCircleViewModelTests: XCTestCase {

    private struct Rig {
        let sut: ProfileCircleViewModel
        let relations: MockRelationsService
        let friends: MockFriendService
        let queue: MockOfflineQueue
    }

    override func setUp() async throws {
        try await super.setUp()
        await CacheCoordinator.shared.relationLinks.invalidate(for: CirclesViewModel.cacheKey)
    }

    override func tearDown() async throws {
        await CacheCoordinator.shared.relationLinks.invalidate(for: CirclesViewModel.cacheKey)
        try await super.tearDown()
    }

    private func makeRig(userId: String = "a") -> Rig {
        let relations = MockRelationsService()
        let friends = MockFriendService()
        let queue = MockOfflineQueue()
        let sut = ProfileCircleViewModel(
            userId: userId,
            relations: relations,
            friendService: friends,
            offlineQueue: queue,
            networkMonitor: FakeNetworkMonitor(isOnline: true)
        )
        return Rig(sut: sut, relations: relations, friends: friends, queue: queue)
    }

    private func link(_ userId: String, _ level: RelationLevel, eligibleFor: RelationLevel? = nil) -> RelationLink {
        RelationLink(userId: userId, effectiveLevel: level, grantedByMe: level, eligibleFor: eligibleFor)
    }

    private func sentRequest(to receiverId: String, level: String) -> FriendRequest {
        JSONStub.decode("""
        {"id":"s1","senderId":"me","receiverId":"\(receiverId)","status":"pending",
         "createdAt":"2026-11-01T10:00:00Z","targetLevel":"\(level)"}
        """)
    }

    func test_load_showsTheCommonLevelOfThisPersonOnly() async {
        let rig = makeRig()
        rig.relations.linksResult = .success([link("b", .blood), link("a", .close)])

        await rig.sut.load()

        XCTAssertEqual(rig.sut.shownLevel, .close)
    }

    func test_withoutAServedLink_nothingIsInvented() async {
        let rig = makeRig()
        rig.relations.linksResult = .success([link("b", .friend)])

        await rig.sut.load()

        XCTAssertNil(rig.sut.shownLevel, "aucun lien servi : le profil garde son badge d'avant")
    }

    func test_aLinkBelowAcquaintance_isNotShown() async {
        let rig = makeRig()
        rig.relations.linksResult = .success([link("a", .community)])

        await rig.sut.load()

        XCTAssertNil(rig.sut.shownLevel)
    }

    func test_theRaise_isNotOfferedWithoutTheServedSeries() async {
        let rig = makeRig()
        rig.relations.linksResult = .success([link("a", .friend)])

        await rig.sut.load()

        XCTAssertNil(rig.sut.offeredRaise, "Proche exige sa série : rien n'est proposé sans éligibilité servie")
    }

    func test_theRaise_isOfferedWhenTheServerServesTheSeriesAsReached() async {
        let rig = makeRig()
        rig.relations.linksResult = .success([link("a", .friend, eligibleFor: .close)])

        await rig.sut.load()

        XCTAssertEqual(rig.sut.offeredRaise, .close)
    }

    func test_requestRaise_isAppliedLocallyThenQueuedWithTheTargetLevel() async throws {
        let rig = makeRig()
        rig.relations.linksResult = .success([link("a", .friend, eligibleFor: .close)])
        await rig.sut.load()

        let queued = await rig.sut.requestRaise()

        XCTAssertTrue(queued)
        XCTAssertEqual(rig.sut.pendingLevel, .close)
        XCTAssertNil(rig.sut.offeredRaise, "une demande en attente ne se propose pas deux fois")
        let payload = try XCTUnwrap(rig.queue.lastPayload as? SendFriendRequestPayload)
        XCTAssertEqual(payload.targetUserId, "a")
        XCTAssertEqual(payload.targetLevel, "CLOSE")
    }

    func test_requestRaise_enqueueFailure_rollsBack() async {
        let rig = makeRig()
        rig.relations.linksResult = .success([link("a", .friend, eligibleFor: .close)])
        await rig.sut.load()
        rig.queue.enqueueResult = .failure(NSError(domain: "test", code: 1))

        let queued = await rig.sut.requestRaise()

        XCTAssertFalse(queued)
        XCTAssertNil(rig.sut.pendingLevel)
        XCTAssertNotNil(rig.sut.notice)
    }

    func test_aServedPendingRequest_isShownAsWaiting() async {
        let rig = makeRig()
        rig.relations.linksResult = .success([link("a", .friend, eligibleFor: .close)])
        rig.friends.sentRequestsResult = .success(
            OffsetPaginatedAPIResponse(success: true, data: [sentRequest(to: "a", level: "CLOSE")], pagination: nil, error: nil)
        )

        await rig.sut.load()

        XCTAssertEqual(rig.sut.pendingLevel, .close)
        XCTAssertNil(rig.sut.offeredRaise)
    }
}
