import XCTest
@testable import Meeshy

/// `ConversationAvatarMenu` — construction pure des entrées du menu contextuel
/// de l'avatar d'une ligne de conversation. Garde-fou contre la régression du
/// « double Voir le profil » sur les DM : le menu direct ne doit contenir
/// QU'UNE entrée profil, et le menu de groupe AUCUNE.
@MainActor
final class ConversationAvatarMenuTests: XCTestCase {

    func test_directRoles_areInfoThenProfile() {
        XCTAssertEqual(ConversationAvatarMenu.directRoles(), [.conversationInfo, .profile])
    }

    func test_directRoles_containExactlyOneProfileEntry() {
        let profileCount = ConversationAvatarMenu.directRoles().filter { $0 == .profile }.count
        XCTAssertEqual(profileCount, 1)
    }

    func test_groupRoles_neverContainProfile() {
        XCTAssertFalse(ConversationAvatarMenu.groupRoles(canShare: false).contains(.profile))
        XCTAssertFalse(ConversationAvatarMenu.groupRoles(canShare: true).contains(.profile))
    }

    func test_groupRoles_includeShareLinkOnlyWhenShareable() {
        XCTAssertEqual(ConversationAvatarMenu.groupRoles(canShare: false), [.conversationInfo])
        XCTAssertEqual(ConversationAvatarMenu.groupRoles(canShare: true), [.conversationInfo, .shareLink])
    }
}
