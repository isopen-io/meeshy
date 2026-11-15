import XCTest
import MeeshySDK
@testable import MeeshyUI

@MainActor
final class UserProfileSheetSessionTests: XCTestCase {

    private func makeSheet(
        user: ProfileSheetUser,
        currentUser: MeeshyUser?
    ) -> UserProfileSheet {
        UserProfileSheet(user: user, dependencies: ProfileDependencyDoubles.make(currentUser: currentUser))
    }

    func test_isCurrentUser_memeId_vrai() {
        let sut = makeSheet(
            user: ProfileSheetUser(userId: "u-me", username: "autre"),
            currentUser: MeeshyUser(id: "u-me", username: "me")
        )
        XCTAssertTrue(sut.isCurrentUser)
    }

    func test_isCurrentUser_memeUsername_vrai() {
        let sut = makeSheet(
            user: ProfileSheetUser(userId: "u-autre", username: "me"),
            currentUser: MeeshyUser(id: "u-me", username: "me")
        )
        XCTAssertTrue(sut.isCurrentUser)
    }

    func test_isCurrentUser_sessionVide_faux() {
        let sut = makeSheet(
            user: ProfileSheetUser(userId: "u-me", username: "me"),
            currentUser: nil
        )
        XCTAssertFalse(sut.isCurrentUser)
        XCTAssertEqual(sut.currentUserId, "")
    }

    func test_connectionStatus_depuisFriendshipStatus_pendingReceived_porteLeRequestId() {
        XCTAssertEqual(ConnectionStatus(friendship: .pendingReceived(requestId: "req-3")), .pendingReceived(requestId: "req-3"))
        XCTAssertEqual(ConnectionStatus(friendship: .pendingSent(requestId: "req-4")), .pendingSent(requestId: "req-4"))
        XCTAssertEqual(ConnectionStatus(friendship: .friend), .connected)
        XCTAssertEqual(ConnectionStatus(friendship: .none), ConnectionStatus.none)
    }
}
