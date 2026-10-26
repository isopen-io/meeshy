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

    /// #13006 — deux tête-à-tête avec ce contact : l'appel part du chiffré de
    /// bout en bout, même s'il n'est pas le plus récent.
    func test_init_withTwoDirects_dialsTheEndToEndOne() {
        let readable = MeeshyConversation(id: "readable", identifier: "readable", type: .direct,
                                          lastMessageAt: Date(timeIntervalSince1970: 900), participantUserId: peer)
        let sealed = MeeshyConversation(id: "sealed", identifier: "sealed", type: .direct,
                                        lastMessageAt: Date(timeIntervalSince1970: 100), encryptionMode: "e2ee", participantUserId: peer)

        let request = ProfileCallRequest(userId: peer, displayName: "Alice", isVideo: false, sharedConversations: [readable, sealed])

        XCTAssertEqual(request?.conversationId, "sealed")
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
