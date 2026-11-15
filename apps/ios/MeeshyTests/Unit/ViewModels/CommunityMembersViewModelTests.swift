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
}
