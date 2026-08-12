import Testing
import Foundation
@testable import MeeshySDK

/// Couverture des nouveaux champs de mise en forme texte (#7) :
/// `fontWeight` (graisse indépendante) et `frameShape` (forme du cadrage).
/// Round-trip Codable + valeurs par défaut backward-compatibles.
struct StoryTextStylingCodableTests {

    @Test func fontWeight_and_frameShape_roundTrip() throws {
        let text = StoryTextObject(
            id: "t1", text: "Bonjour",
            backgroundStyle: .solid(hex: "000000"),
            fontWeight: "semibold",
            frameShape: "pill"
        )
        let data = try JSONEncoder().encode(text)
        let decoded = try JSONDecoder().decode(StoryTextObject.self, from: data)

        #expect(decoded.fontWeight == "semibold")
        #expect(decoded.frameShape == "pill")
        #expect(decoded.parsedFontWeight == .semibold)
        #expect(decoded.parsedFrameShape == .pill)
    }

    @Test func defaults_areBackwardCompatible_whenAbsent() throws {
        // Legacy JSON without the new keys must decode and fall back sanely.
        let json = #"{"id":"t2","text":"Salut","x":0.5,"y":0.5,"scale":1,"rotation":0,"zIndex":0,"fontSize":96,"fontFamily":"system"}"#
        let decoded = try JSONDecoder().decode(StoryTextObject.self, from: Data(json.utf8))

        #expect(decoded.fontWeight == nil)
        #expect(decoded.frameShape == nil)
        #expect(decoded.parsedFontWeight == nil)      // ⇒ weight derives from style
        #expect(decoded.parsedFrameShape == .rounded) // ⇒ legacy default shape
    }

    @Test func parsedFontWeight_ignoresUnknownRawValue() {
        var text = StoryTextObject(id: "t3", text: "X")
        text.fontWeight = "ultra-heavy-bogus"
        #expect(text.parsedFontWeight == nil)
    }
}
