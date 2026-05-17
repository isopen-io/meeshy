import XCTest
@testable import MeeshySDK

/// Couvre les champs de contour (`borderColor` / `borderWidth`) ajoutés à
/// `StoryTextObject` pour le mode d'édition de texte flottant.
final class StoryTextObjectBorderTests: XCTestCase {

    func test_border_defaultsAreNil() {
        let t = StoryTextObject(text: "x")
        XCTAssertNil(t.borderColor)
        XCTAssertNil(t.borderWidth)
    }

    func test_border_codableRoundtrip() throws {
        let original = StoryTextObject(
            text: "Bordé",
            borderColor: "FF0000",
            borderWidth: 4.0
        )
        let data = try JSONEncoder().encode(original)
        let decoded = try JSONDecoder().decode(StoryTextObject.self, from: data)
        XCTAssertEqual(decoded.borderColor, "FF0000")
        XCTAssertEqual(decoded.borderWidth, 4.0)
    }

    func test_border_legacyJSON_decodesWithNilBorder() throws {
        // A story serialized before the border fields existed.
        let json = """
        {"id":"t1","text":"Hello","x":0.5,"y":0.5,"scale":1.0,"rotation":0.0,\
        "zIndex":0,"fontSize":64,"fontFamily":"system"}
        """
        let decoded = try JSONDecoder().decode(StoryTextObject.self, from: Data(json.utf8))
        XCTAssertNil(decoded.borderColor)
        XCTAssertNil(decoded.borderWidth)
    }

    func test_border_nilBorder_omittedFromEncodedJSON() throws {
        let t = StoryTextObject(text: "no border")
        let data = try JSONEncoder().encode(t)
        let json = String(decoding: data, as: UTF8.self)
        XCTAssertFalse(json.contains("borderColor"))
        XCTAssertFalse(json.contains("borderWidth"))
    }
}
