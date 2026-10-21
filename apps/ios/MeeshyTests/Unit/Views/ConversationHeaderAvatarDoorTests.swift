import XCTest
@testable import Meeshy

/// #10300 — toucher l'avatar de l'en-tête ouvre la fiche : le profil du pair d'un
/// direct, les détails de toute autre conversation ; un visiteur sans compte n'ouvre
/// rien de neuf (#10205) et garde la bascule.
@MainActor
final class ConversationHeaderAvatarDoorTests: XCTestCase {

    func test_resolve_directWithPeer_opensTheProfile() {
        XCTAssertEqual(
            ConversationHeaderAvatarDoor.resolve(isDirect: true, isGuest: false, peerUserId: "u1", hasConversation: true),
            .profile
        )
    }

    func test_resolve_group_opensTheConversationDetails() {
        XCTAssertEqual(
            ConversationHeaderAvatarDoor.resolve(isDirect: false, isGuest: false, peerUserId: nil, hasConversation: true),
            .details
        )
    }

    func test_resolve_nonDirectCarryingAPeerId_stillOpensTheDetails() {
        XCTAssertEqual(
            ConversationHeaderAvatarDoor.resolve(isDirect: false, isGuest: false, peerUserId: "u1", hasConversation: true),
            .details
        )
    }

    func test_resolve_directWithoutPeerAccount_opensTheDetails() {
        XCTAssertEqual(
            ConversationHeaderAvatarDoor.resolve(isDirect: true, isGuest: false, peerUserId: nil, hasConversation: true),
            .details
        )
        XCTAssertEqual(
            ConversationHeaderAvatarDoor.resolve(isDirect: true, isGuest: false, peerUserId: "", hasConversation: true),
            .details
        )
    }

    func test_resolve_guest_keepsTheToggle_inEveryConversationKind() {
        XCTAssertEqual(
            ConversationHeaderAvatarDoor.resolve(isDirect: false, isGuest: true, peerUserId: nil, hasConversation: true),
            .toggle
        )
        XCTAssertEqual(
            ConversationHeaderAvatarDoor.resolve(isDirect: true, isGuest: true, peerUserId: "u1", hasConversation: true),
            .toggle
        )
    }

    func test_resolve_withoutConversation_keepsTheToggle() {
        XCTAssertEqual(
            ConversationHeaderAvatarDoor.resolve(isDirect: false, isGuest: false, peerUserId: nil, hasConversation: false),
            .toggle
        )
    }

    func test_bandToggles_whenTheAvatarOpensAFiche_outsideThePreview() {
        XCTAssertTrue(ConversationHeaderAvatarDoor.details.bandToggles(isPreview: false))
        XCTAssertTrue(ConversationHeaderAvatarDoor.profile.bandToggles(isPreview: false))
    }

    func test_bandToggles_neverInThePreview_norWhenTheAvatarKeepsTheToggle() {
        XCTAssertFalse(ConversationHeaderAvatarDoor.details.bandToggles(isPreview: true))
        XCTAssertFalse(ConversationHeaderAvatarDoor.toggle.bandToggles(isPreview: false))
    }

    func test_accessibilityLabel_namesWhatTheTouchOpens() {
        XCTAssertTrue(ConversationHeaderAvatarDoor.profile.accessibilityLabel(name: "Awa", expanded: false).contains("Awa"))
        XCTAssertTrue(ConversationHeaderAvatarDoor.details.accessibilityLabel(name: "Les Amis", expanded: true).contains("Les Amis"))
        XCTAssertNotEqual(
            ConversationHeaderAvatarDoor.profile.accessibilityLabel(name: "X", expanded: false),
            ConversationHeaderAvatarDoor.details.accessibilityLabel(name: "X", expanded: false)
        )
    }

    func test_accessibilityLabel_toggle_saysTheDirection() {
        XCTAssertNotEqual(
            ConversationHeaderAvatarDoor.toggle.accessibilityLabel(name: "X", expanded: true),
            ConversationHeaderAvatarDoor.toggle.accessibilityLabel(name: "X", expanded: false)
        )
    }
}
