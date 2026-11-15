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

    /// #10381 — l'expiration choisie à la création se lit dans la liste des liens, pas seulement dans la fiche.
    func test_rowExpiry_namesTheChosenDay_saysExpiredOncePast_andStaysSilentWithoutExpiry() {
        let now = Date(timeIntervalSince1970: 1_792_000_000)
        let inSevenDays = now.addingTimeInterval(7 * 86_400)

        XCTAssertNil(ShareLinkDetailCopy.rowExpiry(nil, now: now))
        XCTAssertEqual(
            ShareLinkDetailCopy.rowExpiry(inSevenDays, now: now),
            "\(ShareLinkDetailCopy.expiresOn) \(ShareLinkDateFormat.day(inSevenDays))"
        )
        XCTAssertEqual(ShareLinkDetailCopy.rowExpiry(now.addingTimeInterval(-60), now: now), ShareLinkDetailCopy.linkExpired)
    }

    func test_nameField_asksForFirstAndLastNameSeparately() {
        XCTAssertEqual(ShareLinkDetailCopy.fieldNames(.name).count, 2)
    }
}
