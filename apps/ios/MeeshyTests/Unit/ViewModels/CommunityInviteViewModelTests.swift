import XCTest
import MeeshySDK
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
    }
}
