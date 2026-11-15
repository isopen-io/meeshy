import XCTest
@testable import MeeshySDK

/// **Un pack de la vitrine se nomme dans la langue du lecteur et dit où son cadre sert** (#10711).
///
/// La vitrine unique a remplacé le magasin des cadres, qui lisait `names` et `usage` sur `FramePack`.
/// `/packs/shop` sert les mêmes champs (la passerelle relaie le résumé du catalogue tel quel), et le
/// web lit déjà `names` : `ShopPack` les porte, tolérant champ par champ, et l'instantané les garde.
final class ShopPackLocalizedTests: XCTestCase {

    private func decode(_ json: String) throws -> ShopPack {
        try JSONDecoder().decode(ShopPack.self, from: Data(json.utf8))
    }

    func test_aPackIsNamedInTheReadersLanguage_thenFallsBackToTheServedName() throws {
        let pack = try decode("""
        {"slug":"or","name":"Or","description":"Cadres d'or",
         "names":{"en":{"name":"Gold","description":"Golden frames"},"fr":{"name":"Or","description":"Cadres d'or"}}}
        """)

        XCTAssertEqual(pack.localizedName(language: "en"), "Gold")
        XCTAssertEqual(pack.localizedDescription(language: "en-GB"), "Golden frames")
        XCTAssertEqual(pack.localizedName(language: "de"), "Or")
        XCTAssertEqual(pack.localizedDescription(language: "de"), "Cadres d'or")
    }

    func test_anUnreadableName_dropsAloneAndAnUnreadableUsage_neverDropsThePack() throws {
        let pack = try decode("""
        {"slug":"or","name":"Or","names":{"en":{"name":"Gold"},"es":"roto"},"usage":{"kind":"hologram"}}
        """)

        XCTAssertEqual(pack.localizedName(language: "en"), "Gold")
        XCTAssertEqual(pack.localizedName(language: "es"), "Or")
        XCTAssertNil(pack.usage)
    }

    func test_aFramePackCarriesItsUsage() throws {
        let pack = try decode(#"{"slug":"elite","name":"Élite","usage":{"kind":"prestige"}}"#)

        XCTAssertEqual(pack.usage, .prestige)
    }

    func test_theSnapshotKeepsNamesAndUsage() throws {
        let pack = ShopPack(slug: "or", name: "Or", names: ["en": PackLocalizedName(name: "Gold")], usage: .prestige)

        let reread = try JSONDecoder().decode(ShopPack.self, from: JSONEncoder().encode(pack))

        XCTAssertEqual(reread, pack)
    }
}
