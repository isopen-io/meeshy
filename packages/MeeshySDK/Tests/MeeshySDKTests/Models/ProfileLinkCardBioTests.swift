import XCTest
@testable import MeeshySDK

/// #19519 — la bio d'une carte de lien arrive dans la langue du LECTEUR : le Prisme descendu dans l'ordre, la
/// langue d'origine concourant à son rang (CLAUDE.md, règle 3 du Prisme) ; rien de servi ⇒ l'original, sans marque.
final class ProfileLinkCardBioTests: XCTestCase {

    private func card(bio: String? = "Designer sonore à Dakar.", source: String? = "fr",
                      translations: [String: String] = ["it": "Sound designer a Dakar.", "en": "Sound designer in Dakar."])
        -> ProfileLinkCard {
        ProfileLinkCard(userId: "u1", username: "aissa", name: "Aïssa", bio: bio,
                        bioOriginalLanguage: source, bioTranslations: translations)
    }

    func test_servedBio_readerPrimaryLanguageTranslated_servesTheTranslation() throws {
        let bio = try XCTUnwrap(card().servedBio(prism: ["it", "fr"]))

        XCTAssertEqual(bio.text(showingOriginal: false), "Sound designer a Dakar.")
        XCTAssertEqual(bio.translation?.originalLanguage, "fr")
        XCTAssertEqual(bio.translation?.language, "it")
        XCTAssertEqual(bio.text(showingOriginal: true), "Designer sonore à Dakar.")
    }

    func test_servedBio_originalLanguageAtAHigherRank_winsOverALowerTranslation() throws {
        let bio = try XCTUnwrap(card().servedBio(prism: ["fr", "en"]))

        XCTAssertNil(bio.translation)
        XCTAssertEqual(bio.text(showingOriginal: false), "Designer sonore à Dakar.")
    }

    func test_servedBio_translationAtALowerRank_isServedWhenTheFirstRanksAreMissing() throws {
        let bio = try XCTUnwrap(card().servedBio(prism: ["de", "en", "fr"]))

        XCTAssertEqual(bio.translation?.language, "en")
    }

    func test_servedBio_noServedLanguageOrTranslations_isTheOriginalWithoutMark() throws {
        let untagged = try XCTUnwrap(card(source: nil).servedBio(prism: ["it"]))
        let untranslated = try XCTUnwrap(card(translations: [:]).servedBio(prism: ["it"]))

        XCTAssertNil(untagged.translation)
        XCTAssertNil(untranslated.translation)
    }

    func test_servedBio_blankBio_isAbsent() {
        XCTAssertNil(card(bio: "  ").servedBio(prism: ["fr"]))
        XCTAssertNil(card(bio: nil).servedBio(prism: ["fr"]))
    }

    func test_decode_anOldServerWithoutBioFields_stillReadsTheCard() throws {
        let json = #"{"id":"u1","username":"aissa","firstName":"Aïssa","lastName":"Ndiaye","bio":"Bonjour"}"#
        let decoded = try JSONDecoder().decode(ProfileLinkCard.self, from: Data(json.utf8))

        XCTAssertEqual(decoded.name, "Aïssa Ndiaye")
        XCTAssertNil(decoded.bioOriginalLanguage)
        XCTAssertEqual(decoded.bioTranslations, [:])
        XCTAssertNil(decoded.isOnline)
        XCTAssertFalse(decoded.isSelf)
    }

    func test_decode_anUnlistedAccent_isDropped() throws {
        let json = ##"{"id":"u1","username":"aissa","profileAccentColor":"#123456","isSelf":true}"##
        let decoded = try JSONDecoder().decode(ProfileLinkCard.self, from: Data(json.utf8))

        XCTAssertNil(decoded.profileAccentColor)
        XCTAssertTrue(decoded.isSelf)
        XCTAssertEqual(decoded.name, "aissa")
    }
}
