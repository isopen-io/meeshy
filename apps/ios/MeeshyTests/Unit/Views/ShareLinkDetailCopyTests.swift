import XCTest
@testable import Meeshy
import MeeshySDK

/// La carte « Configuration » de la fiche d'un lien (#7797) dit ce qui sera
/// demandé à l'arrivée en UNE phrase : « Prénom, nom et pseudo », jamais
/// « Prénom et nom et Pseudo » (relevé au simulateur).
@MainActor
final class ShareLinkDetailCopyTests: XCTestCase {

    func test_sentence_joinsWithTheLocaleConjunction_andCapitalizesOnlyTheFirstWord() {
        XCTAssertEqual(
            ShareLinkDetailCopy.sentence(["prénom", "nom", "pseudo"], locale: Locale(identifier: "fr_FR")),
            "Prénom, nom et pseudo"
        )
        XCTAssertEqual(
            ShareLinkDetailCopy.sentence(["first name", "last name"], locale: Locale(identifier: "en_US")),
            "First name and last name"
        )
    }

    func test_sentence_keepsTheCatalogCasing_ofLaterWords() {
        XCTAssertEqual(
            ShareLinkDetailCopy.sentence(["Vorname", "Nachname", "Benutzername"], locale: Locale(identifier: "de_DE")),
            "Vorname, Nachname und Benutzername"
        )
    }

    func test_sentence_singleItem_isJustCapitalized() {
        XCTAssertEqual(ShareLinkDetailCopy.sentence(["pseudo"], locale: Locale(identifier: "fr_FR")), "Pseudo")
    }

    func test_nameField_asksForFirstAndLastNameSeparately() {
        XCTAssertEqual(ShareLinkDetailCopy.fieldNames(.name).count, 2)
    }
}
