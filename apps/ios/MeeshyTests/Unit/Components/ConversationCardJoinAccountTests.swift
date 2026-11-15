import XCTest
@testable import Meeshy

/// #8726, correction porteur 2026-09-29 : le bouton du compte porte le NOM du
/// lecteur connecté, pas le libellé générique « Mon compte ».
final class ConversationCardJoinAccountTests: XCTestCase {

    func test_resolve_displayNamePresent_showsTheDisplayName() {
        let account = ConversationCardJoinAccount.resolve(displayName: "Awa Diallo", username: "awa", isAnonymous: false)
        XCTAssertEqual(account?.title, "Awa Diallo")
        XCTAssertEqual(account?.handle, "@awa")
    }

    func test_resolve_blankDisplayName_fallsBackToTheHandle() {
        let account = ConversationCardJoinAccount.resolve(displayName: "  ", username: "awa", isAnonymous: false)
        XCTAssertEqual(account?.title, "@awa")
        XCTAssertEqual(account?.handle, "@awa")
    }

    func test_resolve_noDisplayNameNorUsername_isNil() {
        XCTAssertNil(ConversationCardJoinAccount.resolve(displayName: nil, username: "", isAnonymous: false))
    }

    func test_resolve_guestSession_isNil() {
        XCTAssertNil(ConversationCardJoinAccount.resolve(displayName: "Invité", username: "guest_1", isAnonymous: true))
    }
}
