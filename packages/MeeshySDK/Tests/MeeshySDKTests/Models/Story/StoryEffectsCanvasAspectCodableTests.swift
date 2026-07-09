import Testing
import Foundation
@testable import MeeshySDK

/// `StoryEffects.canvasAspectRatio` persiste la forme du canvas choisie à la
/// composition. Contraintes de compat : les stories antérieures (sans la clé)
/// décodent en `nil` = portrait 9:16 par défaut ; un ratio paysage round-trip.
struct StoryEffectsCanvasAspectCodableTests {

    private func roundTrip(_ effects: StoryEffects) throws -> StoryEffects {
        let data = try JSONEncoder().encode(effects)
        return try JSONDecoder().decode(StoryEffects.self, from: data)
    }

    @Test func encodeDecode_landscapeRatio_roundTrips() throws {
        var effects = StoryEffects()
        effects.canvasAspectRatio = 16.0 / 9.0
        let decoded = try roundTrip(effects)
        #expect(decoded.canvasAspectRatio != nil)
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
