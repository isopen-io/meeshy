import XCTest
import MeeshySDK
@testable import Meeshy

@MainActor
final class CommunityCreateViewModelTests: XCTestCase {

    func test_createCommunity_nomVide_neTouchePasLeReseau() async {
        let service = MockCommunityService()
        let sut = CommunityCreateViewModel(communityService: service, userService: MockUserService())

        let created = await sut.createCommunity()

        XCTAssertNil(created)
        XCTAssertEqual(service.createCallCount, 0)
    }

    func test_createCommunity_creeEtAjouteChaqueMembreSelectionne() async {
        let service = MockCommunityService()
        let sut = CommunityCreateViewModel(communityService: service, userService: MockUserService())
        sut.name = "Alpha"
        sut.selectedMembers = [UserSearchResult(id: "u1", username: "a"), UserSearchResult(id: "u2", username: "b")]

        let created = await sut.createCommunity()

        XCTAssertNotNil(created)
        XCTAssertEqual(service.createCallCount, 1)
        XCTAssertEqual(service.addMemberCallCount, sut.selectedMembers.count)
    }

    func test_createCommunity_echec_afficheLErreur() async {
        let service = MockCommunityService()
        service.createResult = .failure(MeeshyError.server(statusCode: 409, message: "pris"))
        let sut = CommunityCreateViewModel(communityService: service, userService: MockUserService())
        sut.name = "Alpha"

        let created = await sut.createCommunity()

        XCTAssertNil(created)
        XCTAssertTrue(sut.showError)
        XCTAssertEqual(sut.errorMessage, "pris")
    }
}
