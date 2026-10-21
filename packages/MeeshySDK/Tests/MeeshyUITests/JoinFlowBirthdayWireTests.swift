import XCTest
@testable import MeeshyUI

/// #6611 — la date de naissance d'une adhésion anonyme part vers la passerelle
/// comme une date-heure (`POST /anonymous/join/:linkId`, `z.iso.datetime()` +
/// `format: 'date-time'`) : le même contrat que toute date du fil, donc `WireDate`.
final class JoinFlowBirthdayWireTests: XCTestCase {

    private static let naissance = Date(timeIntervalSince1970: 1_789_464_863.563)

    func test_birthdayField_requis_voyageEnDateHeureAMillisecondes() {
        XCTAssertEqual(
            JoinFlowWire.birthdayField(Self.naissance, required: true),
            "2026-09-15T09:34:23.563Z"
        )
    }

    func test_birthdayField_nonRequis_neVoyagePas() {
        XCTAssertNil(JoinFlowWire.birthdayField(Self.naissance, required: false))
    }
}

/// #10216 — la page d'invitation ne montre jamais « 0 personnes » : un
/// effectif tu ou neutre (visiteur sans compte) retire sa tuile.
@MainActor
final class InviteGroupFactsShownCountTests: XCTestCase {

    func test_shownCount_zero_isNotShown() {
        XCTAssertNil(InviteGroupFacts.shownCount(0))
    }

    func test_shownCount_positive_isShown() {
        XCTAssertEqual(InviteGroupFacts.shownCount(16), 16)
    }
}

/// #9944 — le formulaire invité partait toujours sur « fr » : un invité
/// anglophone, coréen ou arabe qui ne touchait pas au sélecteur rejoignait la
/// conversation en français. Il part désormais sur la langue de l'appareil,
/// ramenée aux langues du sélecteur ; « fr » n'est que le dernier recours.
final class JoinFlowDefaultLanguageTests: XCTestCase {

    func test_defaultLanguage_englishDevice_offersEnglish() {
        XCTAssertEqual(JoinFlowLanguages.defaultLanguage(for: ["en-US", "en_US"]), "en")
    }

    func test_defaultLanguage_normalizesScriptAndRegion() {
        XCTAssertEqual(JoinFlowLanguages.defaultLanguage(for: ["zh-Hans-CN"]), "zh")
        XCTAssertEqual(JoinFlowLanguages.defaultLanguage(for: ["ko_KR"]), "ko")
    }

    func test_defaultLanguage_deviceLanguageNotOffered_fallsBackToFrench() {
        XCTAssertEqual(JoinFlowLanguages.defaultLanguage(for: ["sv-SE", "sv_SE"]), "fr")
    }

    func test_defaultLanguage_firstOfferedPreferredLanguageWins() {
        XCTAssertEqual(JoinFlowLanguages.defaultLanguage(for: ["sv-SE", "ar-EG"]), "ar")
    }

    func test_defaultLanguage_noDeviceLanguage_fallsBackToFrench() {
        XCTAssertEqual(JoinFlowLanguages.defaultLanguage(for: []), "fr")
    }

    func test_defaultLanguage_isAlwaysOneOfThePickerLanguages() {
        let offered = JoinFlowLanguages.offered.map(\.code)
        for device in ["en-GB", "ja-JP", "pt-BR", "sv-SE", "", "x"] {
            XCTAssertTrue(offered.contains(JoinFlowLanguages.defaultLanguage(for: [device])), device)
        }
    }
}
