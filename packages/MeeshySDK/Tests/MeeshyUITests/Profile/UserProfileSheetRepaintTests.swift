import XCTest
import MeeshySDK
@testable import MeeshyUI

/// #9307 — la fiche OUVERTE d'un pair se repeint à `user:updated`, sans
/// relecture, et seulement quand l'annonce le désigne.
@MainActor
final class UserProfileSheetRepaintTests: XCTestCase {

    private func event(userId: String) throws -> UserUpdatedEvent {
        let json = #"{"userId":"\#(userId)","changes":{"displayName":"Bobby","firstName":null,"lastName":null,"username":"bobby","avatar":"https://cdn/new.png"}}"#
        return try JSONDecoder().decode(UserUpdatedEvent.self, from: Data(json.utf8))
    }

    func test_repaintedProfile_loadedPeerDesignated_takesTheNewNameAndPhoto() throws {
        let loaded = MeeshyUser(id: "u-bob", username: "bob", displayName: "Bob", bio: "salut",
                                avatar: "https://cdn/old.png")

        let repainted = try XCTUnwrap(UserProfileSheet.repaintedProfile(loaded, with: try event(userId: "u-bob")))
        let shown = ProfileSheetUser.from(user: repainted)

        XCTAssertEqual(shown.resolvedDisplayName, "Bobby")
        XCTAssertEqual(shown.username, "bobby")
        XCTAssertEqual(shown.avatarURL, "https://cdn/new.png")
        XCTAssertEqual(repainted.bio, "salut")
    }

    func test_repaintedProfile_otherPeer_isNil() throws {
        let loaded = MeeshyUser(id: "u-alice", username: "alice")
        XCTAssertNil(UserProfileSheet.repaintedProfile(loaded, with: try event(userId: "u-bob")))
    }

    func test_repaintedProfile_notLoadedYet_isNil() throws {
        XCTAssertNil(UserProfileSheet.repaintedProfile(nil, with: try event(userId: "u-bob")))
    }
}
