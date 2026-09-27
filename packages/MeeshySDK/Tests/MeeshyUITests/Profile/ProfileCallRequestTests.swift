import XCTest
import MeeshySDK
@testable import MeeshyUI

@MainActor
final class ProfileCallRequestTests: XCTestCase {

    private let peer = "64b000000000000000000001"

    private func direct(_ id: String, with userId: String?) -> MeeshyConversation {
        MeeshyConversation(id: id, identifier: id, type: .direct, participantUserId: userId)
    }

    func test_init_withSharedDirectConversation_dialsItDirectly() {
        let request = ProfileCallRequest(
            userId: peer,
            displayName: "Alice",
            isVideo: true,
            sharedConversations: [MeeshyConversation(id: "g1", identifier: "g1", type: .group), direct("d1", with: peer)]
        )

        XCTAssertEqual(request, ProfileCallRequest(userId: peer, displayName: "Alice", isVideo: true, conversationId: "d1"))
    }

    func test_init_withoutDirectConversation_letsTheStarterResolveIt() {
        let request = ProfileCallRequest(
            userId: peer,
            displayName: "Alice",
            isVideo: false,
            sharedConversations: [MeeshyConversation(id: "g1", identifier: "g1", type: .group), direct("d2", with: "someone-else")]
        )

        XCTAssertEqual(request?.conversationId, nil)
        XCTAssertEqual(request?.isVideo, false)
    }

    func test_init_withoutUserId_offersNoCall() {
        XCTAssertNil(ProfileCallRequest(userId: nil, displayName: "Alice", isVideo: false, sharedConversations: []))
        XCTAssertNil(ProfileCallRequest(userId: "  ", displayName: "Alice", isVideo: false, sharedConversations: []))
    }

    func test_sheet_offersTheCallOnlyWhenTheAppWiresIt() {
        let user = ProfileSheetUser(userId: peer, username: "alice")

        XCTAssertFalse(UserProfileSheet(user: user).offersCall)
        XCTAssertTrue(UserProfileSheet(user: user, onCall: { _ in }).offersCall)
    }
}
