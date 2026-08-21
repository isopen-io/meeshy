import Testing
import Foundation
@testable import MeeshySDK

/// `StoryEffects.canvasAspectRatio` porte la forme du canvas choisie à la
/// composition. Contraintes de compat : les stories antérieures (sans la clé)
/// décodent en `nil` = portrait 9:16 par défaut ; un blob v1 qui porte la clé
/// décode en paysage. À l'ÉCRITURE le fil v3 absorbe le ratio (spec §C2, U20) :
/// la scène letterboxe et les ancres libres sont remappées dans son rect.
struct StoryEffectsCanvasAspectCodableTests {

    private func roundTrip(_ effects: StoryEffects) throws -> StoryEffects {
        let data = try JSONEncoder().encode(effects)
        return try JSONDecoder().decode(StoryEffects.self, from: data)
    }

    @Test func encode_landscapeRatio_isAbsorbedByTheAnchorRemap() throws {
        var effects = StoryEffects()
        effects.canvasAspectRatio = 16.0 / 9.0
        effects.textObjects = [StoryTextObject(id: "t1", text: "Salut", x: 0.5, y: 0.9)]
        let decoded = try roundTrip(effects)
        #expect(decoded.canvasAspectRatio == nil)
        #expect(decoded.canvasAspect == .portrait)
        // 9:16 dans 16:9 → hauteur utile 0.31640625, bande haute 0.341796875.
        #expect(abs((decoded.textObjects.first?.y ?? 0) - 0.6265625) < 0.000001)
    }

    @Test func decode_legacyJSONWithRatio_isLandscape() throws {
        let legacy = Data(#"{"textObjects":[],"canvasAspectRatio":1.7777777777777777}"#.utf8)
        let decoded = try JSONDecoder().decode(StoryEffects.self, from: legacy)
        #expect(abs((decoded.canvasAspectRatio ?? 0) - 16.0 / 9.0) < 0.0001)
        #expect(decoded.canvasAspect == .landscape)
    }

    @Test func encodeDecode_portraitDefault_omitsKeyAndDecodesNil() throws {
        let decoded = try roundTrip(StoryEffects())
        #expect(decoded.canvasAspectRatio == nil)
        #expect(decoded.canvasAspect == .portrait)
    }

    @Test func decode_legacyJSONWithoutKey_isPortrait() throws {
        // Une story publiée AVANT l'ajout du champ : aucune clé canvasAspectRatio.
        let legacy = Data(#"{"textObjects":[]}"#.utf8)
        let decoded = try JSONDecoder().decode(StoryEffects.self, from: legacy)
        #expect(decoded.canvasAspectRatio == nil)
        #expect(decoded.canvasAspect == .portrait)
    }
}
