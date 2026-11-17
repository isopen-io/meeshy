import XCTest
import MeeshySDK
@testable import MeeshyUI

/// LA CARTE COMME ACTION (#18872, planche iPad-Split) : la fiche remet à la carte qui regarder, de quoi écrire et
/// appeler, et la même fiche à poser à côté de la carte — jamais sur sa propre fiche.
@MainActor
final class ProfileBesideTheMapTests: XCTestCase {

    private let peer = "64b000000000000000000001"

    func test_request_carriesTheSameProfileToPoseBesideTheMap() {
        let user = ProfileSheetUser(userId: peer, username: "alice")
        let sheet = UserProfileSheet(user: user, onCall: { _ in }, dependencies: ProfileDependencyDoubles.make())

        let request = ProfileBesideTheMap.request(of: sheet, onCall: nil)
        let beside = request?.profile?()

        XCTAssertEqual(request?.userId, peer)
        XCTAssertEqual(beside?.user.userId, peer)
        XCTAssertEqual(beside?.offersCall, true)
    }

    func test_request_withoutAnyone_offersNoMap() {
        let sheet = UserProfileSheet(user: ProfileSheetUser(userId: "", username: "alice"),
                                     dependencies: ProfileDependencyDoubles.make())

        XCTAssertNil(ProfileBesideTheMap.request(of: sheet, onCall: nil))
    }
}
