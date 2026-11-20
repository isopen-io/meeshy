import Combine
import XCTest
import MeeshySDK
import MeeshyUI
@testable import Meeshy

@MainActor
final class CommunityMembersViewModelTests: XCTestCase {

    private func makeSUT(
        members: [APICommunityMember],
        hasMore: Bool = false
    ) -> (CommunityMembersViewModel, MockCommunityService) {
        let service = MockCommunityService()
        service.membersResult = .success(CommunityStubs.page(members, hasMore: hasMore))
        let sut = CommunityMembersViewModel(communityId: "c1", service: service, currentUserId: { "u-admin" })
        return (sut, service)
    }

    private func threeRoles() -> [APICommunityMember] {
        [
            CommunityStubs.member(id: "m1", userId: "u-member", role: "member"),
            CommunityStubs.member(id: "m2", userId: "u-admin", role: "admin"),
            CommunityStubs.member(id: "m3", userId: "u-creator", role: "creator")
        ]
    }

    func test_load_precalculeLesSections() async {
        let (sut, _) = makeSUT(members: threeRoles())

        await sut.loadIfNeeded()

        XCTAssertEqual(sut.sections.map(\.role), [.creator, .admin, .member])
        XCTAssertTrue(sut.isMember)
        XCTAssertTrue(sut.isCurrentUserAdmin)
        XCTAssertFalse(sut.isEmpty)
    }

    func test_load_utilisateurAbsent_nEstNiMembreNiAdmin() async {
        let service = MockCommunityService()
        service.membersResult = .success(CommunityStubs.page(threeRoles()))
        let sut = CommunityMembersViewModel(communityId: "c1", service: service, currentUserId: { "u-stranger" })

        await sut.loadIfNeeded()

        XCTAssertFalse(sut.isMember)
        XCTAssertFalse(sut.isCurrentUserAdmin)
        XCTAssertFalse(sut.canInvite)
    }

    func test_loadMore_dedoublonne_etRecalculeLesSections() async {
        let (sut, service) = makeSUT(members: threeRoles(), hasMore: true)
        await sut.loadIfNeeded()
        service.membersResult = .success(CommunityStubs.page([
            CommunityStubs.member(id: "m1", userId: "u-member", role: "member"),
            CommunityStubs.member(id: "m4", userId: "u-mod", role: "moderator")
        ]))

        await sut.loadMore()

        XCTAssertEqual(sut.sections.map(\.role), [.creator, .admin, .moderator, .member])
        XCTAssertEqual(sut.sections.flatMap(\.members).count, 4)
    }

    func test_removeMember_retireDeLaSection() async {
        let (sut, service) = makeSUT(members: threeRoles())
        await sut.loadIfNeeded()

        await sut.removeMember(userId: "u-member")

        XCTAssertEqual(sut.sections.map(\.role), [.creator, .admin])
        XCTAssertEqual(service.removeMemberCallCount, 1)
    }

    func test_loadIfNeeded_secondAppel_neRechargePas() async {
        let (sut, service) = makeSUT(members: threeRoles())
        await sut.loadIfNeeded()
        service.membersResult = .success(CommunityStubs.page([APICommunityMember]()))

        await sut.loadIfNeeded()

        XCTAssertEqual(sut.sections.map(\.role), [.creator, .admin, .member])
    }

    // MARK: - community:member-* (#18767)

    private func liveSUT() -> (CommunityMembersViewModel, MockCommunityService) {
        let service = MockCommunityService()
        service.membersResult = .success(CommunityStubs.page(threeRoles()))
        let sut = CommunityMembersViewModel(
            communityId: "c1", service: service, currentUserId: { "u-admin" }, memberChanges: Empty().eraseToAnyPublisher()
        )
        return (sut, service)
    }

    func test_memberChange_listeOuverte_seRelit() async {
        let (sut, service) = liveSUT()
        await sut.loadIfNeeded()
        service.membersResult = .success(CommunityStubs.page(threeRoles() + [CommunityStubs.member(id: "m4", userId: "u-new", role: "member")]))

        await sut.apply(CommunityStubs.memberChange(userId: "u-new", role: .member))

        XCTAssertEqual(service.getMembersCallCount, 2)
        XCTAssertEqual(sut.members.map(\.userId).last, "u-new")
    }

    func test_memberChange_lecteurDestitue_perdLaGestion() async {
        let (sut, service) = liveSUT()
        await sut.loadIfNeeded()
        service.membersResult = .success(CommunityStubs.page([CommunityStubs.member(id: "m2", userId: "u-admin", role: "member")]))

        await sut.apply(CommunityStubs.memberChange(userId: "u-admin", role: .member))

        XCTAssertFalse(sut.isCurrentUserAdmin)
    }

    func test_memberChange_autreCommunauteOuListeJamaisChargee_neRelitRien() async {
        let (sut, service) = liveSUT()

        await sut.apply(CommunityStubs.memberChange(userId: "u-new", role: .member))
        await sut.loadIfNeeded()
        await sut.apply(CommunityStubs.memberChange(communityId: "c2", userId: "u-new", role: .member))

        XCTAssertEqual(service.getMembersCallCount, 1)
    }

    // MARK: - Demandes d'entrée (#19877)

    private func stewardSUT(
        role: String? = "moderator",
        createdBy: String = "u-creator",
        requests: [APICommunityJoinRequest] = [
            CommunityStubs.joinRequest(id: "r1", userId: "u-ana", name: "Ana"),
            CommunityStubs.joinRequest(id: "r2", userId: "u-bob", name: "Bob")
        ],
        nextCursor: String? = nil
    ) -> (CommunityMembersViewModel, MockCommunityService) {
        let service = MockCommunityService()
        service.membersResult = .success(CommunityStubs.page(threeRoles()))
        service.getResult = .success(CommunityStubs.community(createdBy: createdBy, currentUserRole: role, requiresJoinApproval: true))
        service.joinRequestsResult = .success(CommunityJoinRequestPage(requests: requests, nextCursor: nextCursor))
        let sut = CommunityMembersViewModel(
            communityId: "c1", service: service, currentUserId: { "u-admin" },
            memberChanges: Empty().eraseToAnyPublisher(), joinRequested: Empty().eraseToAnyPublisher()
        )
        return (sut, service)
    }

    func test_load_intendant_litLesDemandes() async {
        let (sut, service) = stewardSUT(nextCursor: "cur-2")

        await sut.loadIfNeeded()

        XCTAssertEqual(sut.joinRequests.map(\.id), ["r1", "r2"])
        XCTAssertTrue(sut.hasMoreJoinRequests)
        XCTAssertEqual(service.joinRequestsCallCount, 1)
    }

    func test_load_createurSansRoleServi_litLesDemandes() async {
        let (sut, _) = stewardSUT(role: nil, createdBy: "u-admin")

        await sut.loadIfNeeded()

        XCTAssertEqual(sut.joinRequests.count, 2)
    }

    func test_load_membreSimple_neDemandeJamaisLaListe() async {
        let (sut, service) = stewardSUT(role: "member")

        await sut.loadIfNeeded()

        XCTAssertTrue(sut.joinRequests.isEmpty)
        XCTAssertEqual(service.joinRequestsCallCount, 0, "un non-intendant recevrait le 404 générique")
    }

    func test_load_detailIllisible_neDemandeJamaisLaListe() async {
        let (sut, service) = stewardSUT()
        service.getResult = .failure(MeeshyError.network(.noConnection))

        await sut.loadIfNeeded()

        XCTAssertEqual(service.joinRequestsCallCount, 0)
    }

    func test_loadMoreJoinRequests_suitLeCurseur_etDedoublonne() async {
        let (sut, service) = stewardSUT(nextCursor: "cur-2")
        await sut.loadIfNeeded()
        service.joinRequestsResult = .success(CommunityJoinRequestPage(requests: [
            CommunityStubs.joinRequest(id: "r2", userId: "u-bob"),
            CommunityStubs.joinRequest(id: "r3", userId: "u-cy")
        ], nextCursor: nil))

        await sut.loadMoreJoinRequests()

        XCTAssertEqual(service.lastJoinRequestsCursor, "cur-2")
        XCTAssertEqual(sut.joinRequests.map(\.id), ["r1", "r2", "r3"])
        XCTAssertFalse(sut.hasMoreJoinRequests)
    }

    func test_accept_retireLaLigne_etFaitEntrerLeMembre() async {
        let (sut, service) = stewardSUT()
        await sut.loadIfNeeded()
        service.decideResult = .success(CommunityStubs.member(id: "m9", userId: "u-ana", role: "member"))

        await sut.decide(sut.joinRequests[0], .accept)

        XCTAssertEqual(sut.joinRequests.map(\.id), ["r2"])
        XCTAssertEqual(service.decisions.map(\.decision), [.accept])
        XCTAssertTrue(sut.members.contains { $0.userId == "u-ana" })
        XCTAssertEqual(sut.joinRequestNotice, .accepted(name: "Ana"))
        XCTAssertNil(sut.decidingJoinRequestId)
    }

    func test_reject_retireLaLigne_sansFaireEntrerPersonne() async {
        let (sut, service) = stewardSUT()
        await sut.loadIfNeeded()

        await sut.decide(sut.joinRequests[1], .reject)

        XCTAssertEqual(sut.joinRequests.map(\.id), ["r1"])
        XCTAssertEqual(service.decisions.map(\.requestId), ["r2"])
        XCTAssertFalse(sut.members.contains { $0.userId == "u-bob" })
        XCTAssertNil(sut.joinRequestNotice)
    }

    func test_decide_echec_rendLaListeTelleQuelle() async {
        let (sut, service) = stewardSUT()
        await sut.loadIfNeeded()
        service.decideResult = .failure(MeeshyError.server(statusCode: 500, message: "boom"))

        await sut.decide(sut.joinRequests[0], .accept)

        XCTAssertEqual(sut.joinRequests.map(\.id), ["r1", "r2"])
        XCTAssertEqual(sut.joinRequestNotice, .failed)
        XCTAssertFalse(sut.members.contains { $0.userId == "u-ana" })
    }

    func test_decide_dejaTranchee_laLigneResteSortie_etToutSeRelit() async {
        let (sut, service) = stewardSUT()
        await sut.loadIfNeeded()
        service.decideResult = .failure(MeeshyError.server(statusCode: 404, message: "Not found"))
        service.joinRequestsResult = .success(CommunityJoinRequestPage(requests: [CommunityStubs.joinRequest(id: "r2", userId: "u-bob")], nextCursor: nil))

        await sut.decide(sut.joinRequests[0], .accept)

        XCTAssertEqual(sut.joinRequests.map(\.id), ["r2"])
        XCTAssertEqual(sut.joinRequestNotice, .gone)
        XCTAssertEqual(service.getMembersCallCount, 2)
        XCTAssertEqual(service.joinRequestsCallCount, 2)
    }

    func test_decide_nonIntendant_neTrancheRien() async {
        let (sut, service) = stewardSUT(role: "member")
        await sut.loadIfNeeded()

        await sut.decide(CommunityStubs.joinRequest(id: "r1", userId: "u-ana"), .accept)

        XCTAssertTrue(service.decisions.isEmpty)
    }

    func test_joinRequested_listeOuverte_seRelit_autreCommunaute_non() async {
        let (sut, service) = stewardSUT()
        await sut.apply(CommunityStubs.joinRequested())
        XCTAssertEqual(service.joinRequestsCallCount, 0, "une liste jamais chargée ne se charge pas sur un événement")
        await sut.loadIfNeeded()

        await sut.apply(CommunityStubs.joinRequested(communityId: "c2"))
        XCTAssertEqual(service.joinRequestsCallCount, 1)

        await sut.apply(CommunityStubs.joinRequested())
        XCTAssertEqual(service.joinRequestsCallCount, 2)
    }

    func test_memberJoined_relitAussiLesDemandes() async {
        let (sut, service) = stewardSUT()
        await sut.loadIfNeeded()
        service.joinRequestsResult = .success(CommunityJoinRequestPage(requests: [CommunityStubs.joinRequest(id: "r2", userId: "u-bob")], nextCursor: nil))

        await sut.apply(CommunityStubs.memberChange(userId: "u-ana", role: .member))

        XCTAssertEqual(sut.joinRequests.map(\.id), ["r2"], "une demande acceptée par un autre intendant s'efface")
    }
}
