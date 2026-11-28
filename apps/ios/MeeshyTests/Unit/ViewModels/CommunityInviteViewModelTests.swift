import XCTest
import MeeshySDK
import MeeshyUI
@testable import Meeshy

@MainActor
final class CommunityInviteViewModelTests: XCTestCase {

    func test_searchUsers_requeteTropCourte_viderLesResultats() async {
        let users = MockUserService()
        let sut = CommunityInviteViewModel(communityId: "c1", communityService: MockCommunityService(), userService: users)
        sut.searchText = "a"

        await sut.searchUsers()

        XCTAssertTrue(sut.searchResults.isEmpty)
        XCTAssertEqual(users.searchUsersCallCount, 0)
    }

    func test_inviteUser_succes_memoriseLInviteEtLeRangeParmiLesRecents() async {
        let users = MockUserService()
        users.searchUsersResult = .success([UserSearchResult(id: "u1", username: "aiko")])
        let service = MockCommunityService()
        let sut = CommunityInviteViewModel(communityId: "c1", communityService: service, userService: users)
        sut.searchText = "ai"
        await sut.searchUsers()

        await sut.inviteUser(userId: "u1")

        XCTAssertEqual(sut.invitedUserIds, ["u1"])
        XCTAssertEqual(sut.recentlyInvited.map(\.id), ["u1"])
        XCTAssertNil(sut.invitingUserId)
        XCTAssertEqual(service.inviteCallCount, 1)
    }

    func test_inviteUser_echec_neMemorisePas() async {
        let service = MockCommunityService()
        service.inviteResult = .failure(MeeshyError.server(statusCode: 500, message: "x"))
        let sut = CommunityInviteViewModel(communityId: "c1", communityService: service, userService: MockUserService())

        await sut.inviteUser(userId: "u1")

        XCTAssertTrue(sut.invitedUserIds.isEmpty)
        XCTAssertEqual(sut.inviteNotice, .failed)
    }

    func test_inviteUser_budgetDAjoutsAtteint_ditReessayezPlusTardSansRelire() async {
        let service = MockCommunityService()
        service.inviteResult = .failure(MeeshyError.rejected(APIRejection(
            statusCode: 429, code: CommunityAdditionBudget.refusalCode, message: "Trop d'ajouts"
        )))
        let sut = CommunityInviteViewModel(communityId: "c1", communityService: service, userService: MockUserService())

        await sut.inviteUser(userId: "u1")

        XCTAssertEqual(sut.inviteNotice, .throttled)
        XCTAssertTrue(sut.invitedUserIds.isEmpty)
        XCTAssertTrue(sut.recentlyInvited.isEmpty)
        XCTAssertNil(sut.invitingUserId)
        XCTAssertEqual(service.inviteCallCount, 1)
    }

    func test_inviteUser_429SansLeCodeDuBudget_resteUnePanne() async {
        let service = MockCommunityService()
        service.inviteResult = .failure(MeeshyError.server(statusCode: 429, message: "Trop de requetes"))
        let sut = CommunityInviteViewModel(communityId: "c1", communityService: service, userService: MockUserService())

        await sut.inviteUser(userId: "u1")

        XCTAssertEqual(sut.inviteNotice, .failed)
    }

    func test_inviteUser_succesApresUnRefus_effaceLaPhrase() async {
        let service = MockCommunityService()
        service.inviteResult = .failure(MeeshyError.rejected(APIRejection(
            statusCode: 429, code: CommunityAdditionBudget.refusalCode, message: "x"
        )))
        let sut = CommunityInviteViewModel(communityId: "c1", communityService: service, userService: MockUserService())
        await sut.inviteUser(userId: "u1")
        service.inviteResult = .success(CommunityStubs.member(id: "m", userId: "u2", role: "member"))

        await sut.inviteUser(userId: "u2")

        XCTAssertNil(sut.inviteNotice)
        XCTAssertEqual(sut.invitedUserIds, ["u2"])
    }
}
