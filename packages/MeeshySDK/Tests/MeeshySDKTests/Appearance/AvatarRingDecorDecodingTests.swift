import XCTest
@testable import MeeshySDK

/// #13960 — les calques illustrés d'un contour : un film DERRIÈRE l'avatar, un film AU-DESSUS,
/// et leur débordement. Lus quand ils sont valides, ignorés sinon — jamais cause de refus du contour,
/// dont l'anneau fixe reste l'image de repli.
final class AvatarRingDecorDecodingTests: XCTestCase {

    private func reference(_ letter: String) -> [String: Any] {
        ["src": String(repeating: letter, count: 16) + ".json", "bytes": 1200, "sha256": String(repeating: letter, count: 64)]
    }

    private func ring(decor: Any?) throws -> AvatarRingDesign {
        var object: [String: Any] = ["key": "masque-felin", "stroke": ["style": "solid", "width": 0.04, "colors": ["#2A1840"]]]
        if let decor { object["decor"] = decor }
        return try JSONDecoder().decode(AvatarRingDesign.self, from: JSONSerialization.data(withJSONObject: object))
    }

    func test_decode_readsBackFrontAndReach() throws {
        let decor = try XCTUnwrap(try ring(decor: ["reach": 1.4, "back": reference("a"), "front": reference("b")]).decor)
        XCTAssertEqual(decor.reach, 1.4)
        XCTAssertEqual(decor.back?.src, "aaaaaaaaaaaaaaaa.json")
        XCTAssertEqual(decor.front?.src, "bbbbbbbbbbbbbbbb.json")
    }

    func test_decode_withoutDecor_staysTheRingOfBefore() throws {
        XCTAssertNil(try ring(decor: nil).decor)
    }

    func test_decode_unreadableDecor_isIgnoredAndTheRingStays() throws {
        XCTAssertNil(try ring(decor: ["reach": 3, "front": reference("b")]).decor, "débordement hors bornes")
        XCTAssertNil(try ring(decor: ["reach": 1.2]).decor, "aucun film")
        XCTAssertNil(try ring(decor: ["reach": 1.2, "front": ["src": "../x"]]).decor, "film illisible")
        XCTAssertEqual(try ring(decor: "x").stroke.colors, ["#2A1840"])
    }

    func test_decor_survivesARoundTrip() throws {
        let original = try ring(decor: ["reach": 1.4, "front": reference("b")])
        let again = try JSONDecoder().decode(AvatarRingDesign.self, from: JSONEncoder().encode(original))
        XCTAssertEqual(again, original)
        XCTAssertNotEqual(again, try ring(decor: nil))
    }

    private func masque(reach: Double = 1.4) -> AvatarRingDecor {
        AvatarRingDecor(reach: reach, back: nil, front: PackAssetRef(src: "bbbbbbbbbbbbbbbb.json", bytes: 1, sha256: String(repeating: "b", count: 64)))!
    }

    /// #15157 — miroir de `ringDecorFit` : sans place déclarée, le cadre tient dans la boîte de l'anneau seul.
    func test_fit_withoutRoom_shrinksEverythingIntoTheRingBox() {
        let fit = masque().fit(box: 100)
        XCTAssertEqual(fit.scale, 1 / 1.4, accuracy: 1e-9)
        XCTAssertEqual(fit.side, 100, accuracy: 1e-9)
        XCTAssertEqual(fit.offset, 0, accuracy: 1e-9)
    }

    func test_fit_takesTheDeclaredRoom_neverMoreThanTheFilmAsks() {
        let partial = masque().fit(box: 100, room: 10)
        XCTAssertEqual(partial.side, 120, accuracy: 1e-9)
        XCTAssertEqual(partial.scale, 120.0 / 140, accuracy: 1e-9)
        XCTAssertEqual(partial.offset, -10, accuracy: 1e-9)
        let full = masque().fit(box: 100, room: 40)
        XCTAssertEqual(full.side, 140, accuracy: 1e-9)
        XCTAssertEqual(full.scale, 1, accuracy: 1e-9)
    }

    func test_fit_neverPaintsPastTheBoxPlusTheRoom_atEverySize() {
        for box in [18.0, 22, 28, 44, 62, 88, 107, 140] {
            for reach in [1.0, 1.2, 1.4, AvatarRingDecor.maxReach] {
                for room in [0.0, 4, 12] {
                    let fit = masque(reach: reach).fit(box: box, room: room)
                    XCTAssertLessThanOrEqual(fit.side, box + 2 * room + 1e-9)
                    XCTAssertEqual(fit.side, box * reach * fit.scale, accuracy: 1e-9)
                    XCTAssertLessThanOrEqual(fit.scale, 1)
                }
            }
        }
    }

    /// #16114 — le cadre se pose entier à toutes les tailles : liste, bulle, mini-avatar.
    func test_fit_atEverySize_keepsTheWholeFrame() {
        XCTAssertEqual(masque().fit(box: 52).side, 52, accuracy: 1e-9)
        XCTAssertEqual(masque().fit(box: 52).scale, 1 / 1.4, accuracy: 1e-9)
        XCTAssertEqual(masque(reach: 1).fit(box: 32).scale, 1, accuracy: 1e-9)
        XCTAssertEqual(masque(reach: AvatarRingDecor.maxReach).fit(box: 22).side, 22, accuracy: 1e-9)
    }

    func test_catalog_embedsTheShowcaseOfIllustratedFrames_eachWithBothFilms() throws {
        let pack = try XCTUnwrap(AvatarRingCatalog.shared.packs.first { $0.slug == "cadres-illustres" })
        XCTAssertTrue(pack.installedByDefault)
        XCTAssertEqual(pack.rings.map(\.key), ["masque-felin", "toile-araignee", "ailes-ange", "cercle-runique", "griffes-os", "ailes-demon"])
        for ring in pack.rings {
            XCTAssertEqual(ring.decor?.reach, 1.4, ring.key)
            XCTAssertNotNil(ring.decor?.back, ring.key)
            XCTAssertNotNil(ring.decor?.front, ring.key)
            XCTAssertNotNil(AvatarRingCatalog.shared.ringName(ring.key, language: "ar"), ring.key)
        }
    }

    /// #13962–#13970 — les familles culturelles de cadres illustrés : un pack installé d'office par
    /// famille, après la vitrine, de trois à quatre cadres qui portent chacun leurs deux films, nommés en arabe.
    static let culturalFamilies: [String] = ["cadres-asiatiques", "cadres-africains", "cadres-celtes", "cadres-nordiques", "cadres-egyptiens", "cadres-mayas", "cadres-indiens", "cadres-amerindiens", "cadres-australs"]

    func test_catalog_embedsTheCulturalFamilies_eachInstalledByDefault_withBothFilmsPerFrame() throws {
        let slugs = AvatarRingCatalog.shared.packs.map(\.slug).filter { $0.hasPrefix("cadres-") && $0 != "cadres-illustres" }
        XCTAssertEqual(slugs, Self.culturalFamilies)
        for slug in slugs {
            let pack = try XCTUnwrap(AvatarRingCatalog.shared.packs.first { $0.slug == slug })
            XCTAssertTrue(pack.installedByDefault, slug)
            XCTAssertTrue((3...4).contains(pack.rings.count), slug)
            for ring in pack.rings {
                XCTAssertEqual(ring.decor?.reach, 1.4, ring.key)
                XCTAssertNotNil(ring.decor?.back, ring.key)
                XCTAssertNotNil(ring.decor?.front, ring.key)
                XCTAssertNotNil(AvatarRingCatalog.shared.ringName(ring.key, language: "ar"), ring.key)
            }
        }
    }
}
