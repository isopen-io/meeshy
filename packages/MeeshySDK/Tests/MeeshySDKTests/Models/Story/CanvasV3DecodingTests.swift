import Testing
import Foundation
@testable import MeeshySDK

/// Décode les fixtures GELÉES du lot A — la source de vérité inter-lots
/// (`packages/shared/fixtures/canvas-v3/`, spec §C4).
struct CanvasV3DecodingTests {
    private enum FixtureError: Error, CustomStringConvertible {
        case missing(String)

        var description: String {
            switch self {
            case .missing(let path):
                return "Fixture introuvable à \(path) — ajuster deletingLastPathComponent dans fixture(_:)"
            }
        }
    }

    private func fixture(_ name: String) throws -> Data {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent() // → Story/
            .deletingLastPathComponent() // → Models/
            .deletingLastPathComponent() // → MeeshySDKTests/
            .deletingLastPathComponent() // → Tests/
            .deletingLastPathComponent() // → MeeshySDK/
            .deletingLastPathComponent() // → packages/
            .appendingPathComponent("shared/fixtures/canvas-v3/\(name).json")
        guard FileManager.default.fileExists(atPath: url.path) else {
            throw FixtureError.missing(url.path)
        }
        return try Data(contentsOf: url)
    }

    @Test func minimalTextDecodes() throws {
        let doc = try JSONDecoder().decode(CanvasV3.self, from: fixture("minimal-text"))
        #expect(doc.v == 3)
        #expect(doc.scenes.count == 1)
        #expect(doc.scenes[0].objects[0].kind == .text)
        #expect(doc.scenes[0].objects[0].locale == "fr")
    }

    @Test func reelFixture_bandsAndOriginalSound() throws {
        let doc = try JSONDecoder().decode(CanvasV3.self, from: fixture("reel-16x9-bands"))
        let anchors = doc.scenes[0].objects.map(\.anchor)
        #expect(anchors.contains(.band(.top)))
        #expect(anchors.contains(.band(.bottom)))
        #expect(doc.sound?.source == .original)
        #expect(doc.scenes[0].timelineDuration == 12.0)
    }

    @Test func librarySound_carriesProvenanceAndBounds() throws {
        let doc = try JSONDecoder().decode(CanvasV3.self, from: fixture("post-carousel-sound-library"))
        #expect(doc.sound?.source == .library(soundId: "snd_nuits_ete"))
        #expect(doc.sound?.bounds?.start == 2)
    }

    @Test func timingNil_meansFollowsTheSlide() throws {
        let doc = try JSONDecoder().decode(CanvasV3.self, from: fixture("minimal-text"))
        #expect(doc.scenes[0].objects[0].timing == nil)
    }

    @Test func reservedKind_decodesWithoutCrash_asReserved() throws {
        let json = #"{"v":3,"scenes":[{"id":"s","objects":[{"id":"o","kind":"interactive","anchor":{"t":"free","x":0.5,"y":0.5},"plane":"fg","z":0,"transform":{"scale":1,"rotation":0,"opacity":1},"payload":{}}]}]}"#
        let doc = try JSONDecoder().decode(CanvasV3.self, from: Data(json.utf8))
        #expect(doc.scenes[0].objects[0].kind == .reserved("interactive"))
    }

    @Test func roundTripsThroughCodable() throws {
        let doc = try JSONDecoder().decode(CanvasV3.self, from: fixture("story-3-slides"))
        let re = try JSONDecoder().decode(CanvasV3.self, from: JSONEncoder().encode(doc))
        #expect(re == doc)
    }

    @Test func allFrozenV3FixturesDecode() throws {
        let names = ["minimal-text", "story-3-slides", "reel-16x9-bands",
                     "post-carousel-sound-library", "post-sound-original", "v1-legacy-full.v3"]
        for name in names {
            let doc = try JSONDecoder().decode(CanvasV3.self, from: fixture(name))
            #expect(doc.v == 3, "fixture \(name)")
            #expect(!doc.scenes.isEmpty, "fixture \(name)")
        }
    }

    /// Le kind `place` transporte son `SharedPlace` ENVELOPPÉ sous la clé
    /// `place`, jamais à plat. Les deux lecteurs l'exigent indépendamment :
    /// `CanvasV3Migration` lit `payload.object("place")` et le web lit
    /// `o.payload.place` (`CanvasV3Scene.tsx:622`). Un payload posé à plat
    /// décode SANS BRONCHER en `CanvasV3` — `payload` y est un dictionnaire
    /// opaque — et ne rend aucun lieu à l'écran : c'est pourquoi ce test
    /// descend jusqu'à `SharedPlace` au lieu de s'arrêter à `scenes` non vide.
    @Test func placeObject_carriesItsSharedPlaceUnderThePlaceKey() throws {
        struct PlaceEnvelope: Decodable { let place: SharedPlace }

        let doc = try JSONDecoder().decode(CanvasV3.self, from: fixture("story-3-slides"))
        let places = doc.scenes.flatMap(\.objects).filter { $0.kind == .place }
        #expect(places.count == 1)

        let payload = try #require(places.first?.payload)
        let envelope = try JSONDecoder().decode(PlaceEnvelope.self,
                                                from: JSONEncoder().encode(payload))
        #expect(envelope.place.name == "Douala")
    }

    @Test func goldenFixture_preservesSoundTranscriptionsAndSceneTransitions() throws {
        let doc = try JSONDecoder().decode(CanvasV3.self, from: fixture("v1-legacy-full.v3"))
        #expect(doc.sound?.transcriptions?.map(\.language) == ["fr", "en"])
        #expect(doc.scenes[0].opening?["type"] == .string("fade"))
        #expect(doc.scenes[0].clipTransitions?.count == 1)
        let re = try JSONDecoder().decode(CanvasV3.self, from: JSONEncoder().encode(doc))
        #expect(re == doc)
    }
}
