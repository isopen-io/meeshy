import XCTest
@testable import MeeshySDK

/// Un contour vient d'un pack — parfois d'un VENDEUR TIERS (#10709) : ce sont des données non fiables. Une couleur
/// qui n'est pas un hexadécimal à 3, 6 ou 8 chiffres (« #FFF » mal servi, « red ») faisait sortir `lerpHex` de sa
/// chaîne et planter le dessin de l'avatar d'un AUTRE utilisateur. Le décodage échoue fermé, comme pour un trait
/// qui désigne une couleur absente.
final class AvatarRingColorValidationTests: XCTestCase {

    private func ring(_ colors: [String]) throws -> AvatarRingDesign {
        let list = colors.map { "\"\($0)\"" }.joined(separator: ",")
        let json = #"{"key":"k","stroke":{"style":"gradient","width":0.06,"colors":[\#(list)]}}"#
        return try JSONDecoder().decode(AvatarRingDesign.self, from: Data(json.utf8))
    }

    func test_wellFormedHexColours_decode() {
        XCTAssertNoThrow(try ring(["#2DD4BF", "7C3AED", "#FFF", "#11223344"]))
    }

    func test_aColourThatIsNotHex_failsClosed() {
        XCTAssertThrowsError(try ring(["#2DD4BF", "red"]))
        XCTAssertThrowsError(try ring(["#2DD4"]))
        XCTAssertThrowsError(try ring(["#GGGGGG"]))
        XCTAssertThrowsError(try ring([""]))
    }

    func test_theRule_isPure() {
        XCTAssertTrue(AvatarRingStroke.isWellFormedHex("#abc"))
        XCTAssertTrue(AvatarRingStroke.isWellFormedHex("A1B2C3"))
        XCTAssertFalse(AvatarRingStroke.isWellFormedHex("#12345"))
        XCTAssertFalse(AvatarRingStroke.isWellFormedHex("##123456"))
    }
    // MARK: Huit couleurs et le contour sans trait de base (#10936)

    private func ring(style: String, colors: Int, ornamentColor: Int) throws -> AvatarRingDesign {
        let palette = (0..<colors).map { "\"#1F4E\(String(format: "%02X", $0 * 16))\"" }.joined(separator: ",")
        let json = #"{"key":"rituel","stroke":{"style":"\#(style)","width":0.07,"colors":[\#(palette)]},"ornament":{"paths":[{"d":"M0 0 Z","color":\#(ornamentColor),"opacity":1}]}}"#
        return try JSONDecoder().decode(AvatarRingDesign.self, from: Data(json.utf8))
    }

    func test_aRingOfEightColours_withoutBaseStroke_decodes() throws {
        let decoded = try ring(style: "none", colors: 8, ornamentColor: 7)
        XCTAssertEqual(decoded.stroke.style, RingStrokeStyle.none)
        XCTAssertEqual(decoded.stroke.colors.count, 8)
        XCTAssertEqual(decoded.ornament.first?.color, 7)
    }

    func test_aRingOfNineColours_orAnOrnamentPastTheEighth_failsClosed() {
        XCTAssertThrowsError(try ring(style: "solid", colors: 9, ornamentColor: 0))
        XCTAssertThrowsError(try ring(style: "solid", colors: 8, ornamentColor: 8))
    }

    func test_theEmbeddedCatalog_carriesTheSevenStyleContours_fixedAndAnimated() {
        let styles = ["haussmannien", "arabe", "grec", "ancestral", "technologique", "rituel", "celte"]
        for style in styles {
            XCTAssertEqual(AvatarRingCatalog.shared.packs.first { $0.slug == "contours-\(style)" }?.rings.map(\.key), [style, style + "-anime"])
            XCTAssertNotNil(AvatarRingCatalog.shared.packName("contours-\(style)", language: "de"))
        }
    }
}
