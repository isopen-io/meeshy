import XCTest
@testable import MeeshyUI

/// #17202 — la fiche d'un profil range ses onglets Détails, Conversations, Publications ; Détails s'ouvre d'abord.
final class ProfileTabOrderTests: XCTestCase {

    func test_allCases_readDetailsThenConversationsThenPosts() {
        XCTAssertEqual(ProfileTab.allCases, [.details, .conversations, .posts])
    }
}
