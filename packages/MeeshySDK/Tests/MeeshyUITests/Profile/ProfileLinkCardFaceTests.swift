import XCTest
import MeeshySDK
@testable import MeeshyUI

/// #19519 — ce que la carte d'un lien de fiche montre (planche `Apercu-Lien` § 2) : l'accent SERVI, le pseudo,
/// la bio dans la langue du lecteur, la présence servie seulement, et « Écrire » absent de sa propre carte.
final class ProfileLinkCardFaceTests: XCTestCase {

    private func card(accent: String? = "#A855F7", isOnline: Bool? = nil, isSelf: Bool = false) -> ProfileLinkCard {
        ProfileLinkCard(userId: "u1", username: "aissa", name: "Aïssa Ndiaye", bio: "Designer sonore à Dakar.",
                        profileAccentColor: accent, isOnline: isOnline, isSelf: isSelf,
                        bioOriginalLanguage: "fr", bioTranslations: ["it": "Sound designer a Dakar."])
    }

    func test_face_takesTheChosenAccent_elseTheComputedOne() {
        let chosen = ProfileLinkCardFace(card: card(), prism: ["fr"])
        let computed = ProfileLinkCardFace(card: card(accent: nil), prism: ["fr"])

        XCTAssertEqual(chosen.accentHex, "A855F7")
        XCTAssertEqual(computed.accentHex, ProfileAccent.hex(chosen: nil, userId: "u1", name: "Aïssa Ndiaye"))
    }

    func test_face_namesTheHandle_andServesTheBioInTheReadersLanguage() {
        let face = ProfileLinkCardFace(card: card(), prism: ["it", "fr"])

        XCTAssertEqual(face.handleText, "@aissa")
        XCTAssertEqual(face.bio?.text(showingOriginal: false), "Sound designer a Dakar.")
        XCTAssertEqual(face.bio?.translation?.originalLanguage, "fr")
    }

    func test_face_showsOnlyServedPresence() {
        XCTAssertNil(ProfileLinkCardFace(card: card(), prism: []).presence)
        XCTAssertEqual(ProfileLinkCardFace(card: card(isOnline: true), prism: []).presence, .online)
    }

    func test_face_ownCard_offersNoWrite() {
        XCTAssertTrue(ProfileLinkCardFace(card: card(), prism: []).offersWrite)
        XCTAssertFalse(ProfileLinkCardFace(card: card(isSelf: true), prism: []).offersWrite)
    }
}
