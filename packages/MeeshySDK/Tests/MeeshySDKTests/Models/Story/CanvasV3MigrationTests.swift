import Testing
import Foundation
@testable import MeeshySDK

/// Pont bidirectionnel `StoryEffects ⇄ CanvasV3` (Task B2) — le juge est le
/// golden PARTAGÉ avec le convertisseur gateway (`v1-legacy-full.v3.json`).
struct CanvasV3MigrationTests {
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

    @Test func v1FixtureMigratesToTheSharedGolden() throws {
        let legacy = try JSONDecoder().decode(StoryEffects.self, from: fixture("v1-legacy-full"))
        let migrated = CanvasV3(migrating: legacy)
        let golden = try JSONDecoder().decode(CanvasV3.self, from: fixture("v1-legacy-full.v3"))
        #expect(migrated == golden)
    }

    @Test func renderingBridge_reconstructsTheRuntimeFamilies() throws {
        let doc = try JSONDecoder().decode(CanvasV3.self, from: fixture("v1-legacy-full.v3"))
        let fx = StoryEffects(rendering: doc, sceneIndex: 0)
        #expect(fx.textObjects.count == 1)
        #expect(fx.textObjects[0].textStyle == "retro")
        #expect(fx.textObjects[0].sourceLanguage == "fr")
        #expect(fx.textObjects[0].translations?["en"] == "Hi")
        #expect(fx.stickerObjects?.count == 2)
        #expect(fx.stickerObjects?[0].baseSize == 300)
        #expect(fx.voiceTranscriptions?.map(\.language) == ["fr", "en"])
        #expect(fx.locationObjects.count == 1)
        #expect(fx.locationObjects[0].place.name == "Douala")
        #expect(fx.audioPlayerObjects?.count == 1)
        #expect(fx.audioPlayerObjects?[0].postMediaId == "64b0000000000000000000aa")
        #expect(fx.backgroundAudioId == "snd_nuits_ete")
        #expect(fx.backgroundAudioVolume == 0.6)
        #expect(fx.timelineDuration == 9.5)
    }

    @Test func roundTrip_v3_runtime_v3_isStableOnCoveredFields() throws {
        let doc = try JSONDecoder().decode(CanvasV3.self, from: fixture("v1-legacy-full.v3"))
        let back = CanvasV3(migrating: StoryEffects(rendering: doc, sceneIndex: 0))
        #expect(back == doc)
    }

    @Test func originalSound_mapsFromOwnVoiceTrack() throws {
        var fx = StoryEffects()
        fx.voiceAttachmentId = "att-1"
        #expect(CanvasV3(migrating: fx).sound?.source == .original)
    }
}
