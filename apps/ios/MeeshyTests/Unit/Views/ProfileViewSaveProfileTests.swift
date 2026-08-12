import XCTest
@testable import Meeshy

/// Verrouille la sémantique de `ProfileView.changedOrNil`, le mécanisme qui
/// distingue « champ inchangé » (nil → omis du PATCH) de « champ effacé
/// intentionnellement » ("" → envoyé verbatim). Depuis 2026-07-24 il route
/// aussi `regionalLanguage` : effacer la langue secondaire doit propager "" au
/// serveur (qui le mappe à null), pas être avalé en nil comme avant.
@MainActor
final class ProfileViewSaveProfileTests: XCTestCase {

    func test_changedOrNil_unchangedValue_returnsNil() {
        XCTAssertNil(ProfileView.changedOrNil("en", original: "en"))
    }

    func test_changedOrNil_alreadyEmpty_returnsNil() {
        XCTAssertNil(ProfileView.changedOrNil("", original: nil))
        XCTAssertNil(ProfileView.changedOrNil("", original: ""))
    }

    func test_changedOrNil_clearedRegionalLanguage_returnsEmptyStringNotNil() {
        // "en" → "" : effacement intentionnel de la langue régionale.
        XCTAssertEqual(ProfileView.changedOrNil("", original: "en"), "")
    }

    func test_changedOrNil_changedValue_returnsNewValue() {
        XCTAssertEqual(ProfileView.changedOrNil("es", original: "en"), "es")
    }
}
