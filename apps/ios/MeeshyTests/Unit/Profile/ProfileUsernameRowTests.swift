import XCTest
import MeeshySDK
import MeeshyUI
@testable import Meeshy

/// Le pseudo de ma fiche (#19644, planche `Moi-Edition`) : il suit le nom affiché et, en édition, se voit verrouillé —
/// cadenas du kit et mention « Ne se modifie pas ici », lus ensemble par VoiceOver comme non modifiable.
@MainActor
final class ProfileUsernameRowTests: XCTestCase {

    private func code(_ path: String) throws -> String {
        AppSourceGuard.stripComments(try AppSourceGuard.unit(path))
    }

    func test_value_prefixesTheUsernameWithAnAt() {
        XCTAssertEqual(ProfileUsernameRow.value(of: "aissa"), "@aissa")
    }

    func test_value_withoutUsername_isADash_neverAnAtFollowedByADash() {
        XCTAssertEqual(ProfileUsernameRow.value(of: nil), "—")
        XCTAssertEqual(ProfileUsernameRow.value(of: ""), "—")
        XCTAssertEqual(ProfileUsernameRow.value(of: "  "), "—")
    }

    func test_editingContent_isTitledPseudo_andSaysTheValueThenThatItCannotBeChangedHere() throws {
        let content = ProfileUsernameRow.editingContent(username: "aissa")
        XCTAssertEqual(content.title, ProfileUsernameRow.title)
        let subtitle = try XCTUnwrap(content.subtitle)
        let value = try XCTUnwrap(subtitle.range(of: "@aissa"))
        let note = try XCTUnwrap(subtitle.range(of: ProfileUsernameRow.lockedNote))
        XCTAssertLessThan(value.lowerBound, note.lowerBound, "la valeur d'abord, la mention dessous, comme la planche")
        XCTAssertEqual(content.accessory, .none, "le cadenas est un médaillon muet, pas un accessoire actionnable")
    }

    func test_accessibilityLabel_readsTheRowAsOne_andSaysItIsNotEditable() throws {
        let label = ProfileUsernameRow.editingAccessibilityLabel(username: "aissa")
        let title = try XCTUnwrap(label.range(of: ProfileUsernameRow.title))
        let value = try XCTUnwrap(label.range(of: "@aissa"))
        let locked = try XCTUnwrap(label.range(of: ProfileUsernameRow.lockedWord))
        let note = try XCTUnwrap(label.range(of: ProfileUsernameRow.lockedNote))
        XCTAssertLessThan(title.lowerBound, value.lowerBound)
        XCTAssertLessThan(value.lowerBound, locked.lowerBound)
        XCTAssertLessThan(locked.lowerBound, note.lowerBound)
    }

    func test_lockedWords_areDistinctAndPresent() {
        XCTAssertFalse(ProfileUsernameRow.lockedNote.isEmpty)
        XCTAssertFalse(ProfileUsernameRow.lockedWord.isEmpty)
        XCTAssertNotEqual(ProfileUsernameRow.lockedNote, ProfileUsernameRow.lockedWord)
        XCTAssertEqual(ProfileUsernameRow.title, String(localized: "profile.username", bundle: .main))
    }

    func test_identity_placesThePseudoAfterTheDisplayName() throws {
        let identity = try code("Meeshy/Features/Profile/Views/ProfileIdentitySection.swift")
        let body = try XCTUnwrap(identity.components(separatedBy: "struct ProfileCityField").first)
        let displayName = try XCTUnwrap(body.range(of: "\"profile.display_name\""))
        let username = try XCTUnwrap(body.range(of: "usernameRow\n"))
        let bio = try XCTUnwrap(body.range(of: "\"profile.bio\""))
        XCTAssertLessThan(displayName.lowerBound, username.lowerBound, "le pseudo suit le nom affiché")
        XCTAssertLessThan(username.lowerBound, bio.lowerBound, "et précède la bio")
    }

    func test_identity_drawsTheLockWithTheMedallionOfTheKit_onTheRowOfTheKit() throws {
        let identity = try code("Meeshy/Features/Profile/Views/ProfileIdentitySection.swift")
        XCTAssertTrue(identity.contains("MeeshyMedallion(systemImage: ProfileUsernameRow.lockGlyph"),
                      "le cadenas est le médaillon K45")
        XCTAssertTrue(identity.contains("ProfileUsernameRow.editingContent(username: username)"),
                      "en édition, la rangée K06 porte la valeur et la mention")
        XCTAssertTrue(identity.contains("ProfileUsernameRow.editingAccessibilityLabel(username: username)"),
                      "VoiceOver lit la rangée d'un seul tenant")
        XCTAssertFalse(identity.contains("Image(systemName: \"lock"), "aucun cadenas redessiné sur place")
    }
}
