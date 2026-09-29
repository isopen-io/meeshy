import XCTest
import SwiftUI
import MeeshySDK
@testable import Meeshy

/// **#6738 — le texte alternatif d'un média de post est lu par VoiceOver.**
///
/// `PostMedia.alt` était décodé sur `APIPostMedia` puis jeté par
/// `toFeedMedia()` : aucune surface ne pouvait le rendre.
final class PostMediaAccessibilityTests: XCTestCase {

    private func apiMedia(alt: String?, caption: String? = nil) throws -> APIPostMedia {
        var json: [String: Any] = ["id": "pm-1", "mimeType": "image/jpeg", "fileUrl": "https://cdn/p.jpg"]
        if let alt { json["alt"] = alt }
        if let caption { json["caption"] = caption }
        return try JSONDecoder().decode(APIPostMedia.self, from: JSONSerialization.data(withJSONObject: json))
    }

    func test_toFeedMedia_porteLeTexteAlternatif() throws {
        XCTAssertEqual(try apiMedia(alt: "Un chat roux sur un toit").toFeedMedia().alt,
                       "Un chat roux sur un toit")
    }

    func test_accessibilityDescription_altPrimeSurLaLegende() throws {
        let media = try apiMedia(alt: "Un chat roux", caption: "Dimanche").toFeedMedia()
        XCTAssertEqual(media.accessibilityDescription(preferredLanguages: ["fr"]), "Un chat roux")
    }

    func test_accessibilityDescription_sansAlt_repliSurLaLegende() throws {
        let media = try apiMedia(alt: "  ", caption: "Dimanche").toFeedMedia()
        XCTAssertEqual(media.accessibilityDescription(preferredLanguages: ["fr"]), "Dimanche")
    }

    func test_accessibilityDescription_rien_rendNil() throws {
        XCTAssertNil(try apiMedia(alt: nil).toFeedMedia().accessibilityDescription(preferredLanguages: ["fr"]))
    }

    /// Un fil persisté garde l'alternative au démarrage à froid.
    func test_feedMedia_codable_conserveLAlt() throws {
        let media = FeedMedia(id: "m", type: .image, alt: "Un phare")
        let relu = try JSONDecoder().decode(FeedMedia.self, from: JSONEncoder().encode(media))
        XCTAssertEqual(relu.alt, "Un phare")
    }

    func test_sceneDescription_lAltDuMediaDeLaScene() {
        let document = CanvasV3(v: 3, scenes: [
            SceneV3(id: "s1", objects: []),
            SceneV3(id: "s2", objects: [
                ObjectV3(id: "o", kind: .media, anchor: .free(x: 0.5, y: 0.5), plane: .content, z: 0,
                         transform: TransformV3(), payload: ["postMediaId": .string("pm-2")])
            ])
        ])
        let media = [FeedMedia(id: "pm-2", type: .image, alt: "Une plage au couchant")]

        XCTAssertEqual(PostMediaAccessibility.sceneDescription(sceneIndex: 1, document: document, media: media),
                       "Une plage au couchant")
        XCTAssertNil(PostMediaAccessibility.sceneDescription(sceneIndex: 0, document: document, media: media))
    }

    /// Les trois surfaces du fil consultent le site unique.
    func test_surfacesDuFil_consultentLeTexteAlternatif() throws {
        let vues = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Views")
        let lire = { (nom: String) in try String(contentsOf: vues.appendingPathComponent(nom), encoding: .utf8) }
        XCTAssertTrue(try lire("FeedPostCard+Media.swift").contains(".postMediaAccessibility(media)"))
        XCTAssertTrue(try lire("FeedPostCardCarousel.swift").contains("PostMediaAccessibility.alt(item)"))
        XCTAssertTrue(try lire("PostSceneMosaic.swift").contains("PostMediaAccessibility.sceneDescription("))
    }
}
