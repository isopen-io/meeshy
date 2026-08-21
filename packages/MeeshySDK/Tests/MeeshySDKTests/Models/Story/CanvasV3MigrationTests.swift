import Testing
import Foundation
import CoreGraphics
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

    // ------------------------------------------------------------------
    // Rattrapage F7e (addendum rév. 2, arbitrage 11, constat 25) — `bounds`
    // ne s'émet QUE comme un intervalle complet et valide, miroir du
    // convertisseur gateway durci (`storyEffectsV3.ts:234-250`). Une seule
    // borne, ou un intervalle inversé, dégrade en « pas de trim » (bounds
    // nil = clip entier), jamais en `{start, end: 0}` refusé par
    // `BOUNDS_END_BEFORE_START` (`canvas-v3.ts:76-79`).
    // ------------------------------------------------------------------

    @Test func boundsWithOnlyAStart_omitsBoundsRatherThanFabricatingAnInvertedEnd() throws {
        var fx = StoryEffects()
        fx.backgroundAudioId = "snd_x"
        fx.backgroundAudioStart = 3
        #expect(CanvasV3(migrating: fx).sound?.bounds == nil)
    }

    @Test func boundsWithOnlyAnEnd_omitsBounds() throws {
        var fx = StoryEffects()
        fx.backgroundAudioId = "snd_x"
        fx.backgroundAudioEnd = 9
        #expect(CanvasV3(migrating: fx).sound?.bounds == nil)
    }

    @Test func boundsInverted_endBeforeStart_omitsBounds() throws {
        var fx = StoryEffects()
        fx.backgroundAudioId = "snd_x"
        fx.backgroundAudioStart = 9
        fx.backgroundAudioEnd = 3
        #expect(CanvasV3(migrating: fx).sound?.bounds == nil)
    }

    @Test func boundsWithBothEndsAndEndAfterStart_stillEmitsBounds() throws {
        var fx = StoryEffects()
        fx.backgroundAudioId = "snd_x"
        fx.backgroundAudioStart = 2
        fx.backgroundAudioEnd = 9
        #expect(CanvasV3(migrating: fx).sound?.bounds == BackgroundSoundV3.Bounds(start: 2, end: 9))
    }

    @Test func boundsWithBothEndsEqual_isAValidZeroLengthIntervalAndIsEmitted() throws {
        var fx = StoryEffects()
        fx.backgroundAudioId = "snd_x"
        fx.backgroundAudioStart = 5
        fx.backgroundAudioEnd = 5
        #expect(CanvasV3(migrating: fx).sound?.bounds == BackgroundSoundV3.Bounds(start: 5, end: 5))
    }

    // ------------------------------------------------------------------
    // Rattrapage B8b (addendum rév. 3) — le pont LOGE tout ce que le
    // runtime porte. Second juge partagé avec le convertisseur gateway :
    // `v1-legacy-rich.json` → `v1-legacy-rich.v3.json`, les DEUX
    // convertisseurs sur la MÊME fixture.
    // ------------------------------------------------------------------

    private func richRuntime() throws -> StoryEffects {
        try JSONDecoder().decode(StoryEffects.self, from: fixture("v1-legacy-rich"))
    }

    private func richGolden() throws -> CanvasV3 {
        try JSONDecoder().decode(CanvasV3.self, from: fixture("v1-legacy-rich.v3"))
    }

    private func object(_ document: CanvasV3, _ id: String) -> ObjectV3? {
        document.scenes.first?.objects.first { $0.id == id }
    }

    // MARK: - Le juge partagé

    @Test func richV1FixtureMigratesToTheSharedGolden() throws {
        #expect(CanvasV3(migrating: try richRuntime()) == (try richGolden()))
    }

    @Test func richRoundTrip_documentRuntimeDocument_isStable() throws {
        let golden = try richGolden()
        #expect(CanvasV3(migrating: StoryEffects(rendering: golden, sceneIndex: 0)) == golden)
    }

    // MARK: - Restitution intégrale au rendu

    @Test func richDocument_restoresTheMediaFidelity() throws {
        let fx = StoryEffects(rendering: try richGolden(), sceneIndex: 0)
        let media = try #require(fx.mediaObjects?.first)
        #expect(media.aspectRatio == 1.7777)
        #expect(media.anchor == CGPoint(x: 0.25, y: 0.75))
        #expect(media.mediaType == "video")
        #expect(media.volume == 0)
        #expect(media.isMuted)
        #expect(media.loop)
        #expect(media.isBackground)
        #expect(media.duration == 12.5)
        #expect(media.startTime == 0.5)
        #expect(media.sourceLanguage == "fr")
    }

    @Test func richDocument_restoresTheBorrowedSoundProvenance() throws {
        let fx = StoryEffects(rendering: try richGolden(), sceneIndex: 0)
        let audio = try #require(fx.audioPlayerObjects?.first)
        #expect(audio.soundId == "64b0000000000000000000dd")
        #expect(audio.soundAuthorUsername == "sam")
        #expect(audio.name == "Pluie en forêt")
        #expect(audio.volume == 0.35)
        #expect(audio.isBackground == true)
        #expect(audio.loop == true)
        #expect(audio.duration == 18)
        #expect(audio.fadeIn == 0.5)
        #expect(audio.fadeOut == 1.25)
        #expect(audio.zIndex == 6)
    }

    @Test func richDocument_restoresDrawingStrokesAndLegacyData() throws {
        let fx = StoryEffects(rendering: try richGolden(), sceneIndex: 0)
        #expect(fx.drawingStrokes?.map(\.id) == ["stroke-1"])
        #expect(fx.drawingStrokes?.first?.colorHex == "FF3B30")
        #expect(fx.drawingStrokes?.first?.points.count == 2)
        #expect(fx.drawingData == Data(base64Encoded: "AQIDBA=="))
    }

    @Test func richDocument_restoresVariantsAndThumbHash() throws {
        let fx = StoryEffects(rendering: try richGolden(), sceneIndex: 0)
        #expect(fx.backgroundAudioVariants?.map(\.language) == ["fr", "en"])
        #expect(fx.backgroundAudioVariants?.first?.postMediaId == "64b0000000000000000000e1")
        #expect(fx.backgroundAudioVariants?.first?.isAutoGenerated == true)
        #expect(fx.thumbHash == "1QcSHQRnh493V4dIh4eXh0h4kJUI")
        #expect(fx.backgroundAudioId == "snd_forest_rain")
        #expect(fx.backgroundAudioVolume == 0.45)
    }

    // MARK: - Champs auteur-locaux (le brouillon est la seule copie)

    @Test func authorLocalMediaFields_surviveTheBridge() throws {
        var media = StoryMediaObject(id: "m9", postMediaId: "64b000000000000000000099",
                                     mediaType: "video", placement: "clip",
                                     aspectRatio: 0.5625,
                                     anchor: CGPoint(x: 0.1, y: 0.9),
                                     volume: 0.8,
                                     intrinsicDuration: 31.5,
                                     fadeIn: 0.2, fadeOut: 0.9,
                                     thumbHash: "1QcSHQRnh493V4dIh4eXh0h4kJUI",
                                     name: "prise 3",
                                     isDuckingDisabled: true)
        media.setVolumePreservingMuteMemento(0)
        var effects = StoryEffects()
        effects.mediaObjects = [media]

        let restored = try #require(StoryEffects(rendering: CanvasV3(migrating: effects), sceneIndex: 0)
            .mediaObjects?.first)
        #expect(restored.aspectRatio == 0.5625)
        #expect(restored.anchor == CGPoint(x: 0.1, y: 0.9))
        #expect(restored.mutedVolumeMemento == 0.8)
        #expect(restored.volume == 0)
        #expect(restored.intrinsicDuration == 31.5)
        #expect(restored.isDuckingDisabled == true)
        #expect(restored.placement == "clip")
        #expect(restored.fadeIn == 0.2)
        #expect(restored.fadeOut == 0.9)
        #expect(restored.name == "prise 3")
        #expect(restored.thumbHash == "1QcSHQRnh493V4dIh4eXh0h4kJUI")
    }

    @Test func perObjectAudioVariants_surviveTheBridge() throws {
        var audio = StoryAudioPlayerObject(id: "a9", postMediaId: "64b0000000000000000000ab",
                                           backgroundAudioVariants: [
                                            StoryAudioVariant(postMediaId: "64b0000000000000000000ac",
                                                              language: "de",
                                                              isAutoGenerated: false)
                                           ])
        audio.setVolumePreservingMuteMemento(0)
        var effects = StoryEffects()
        effects.audioPlayerObjects = [audio]

        let restored = try #require(StoryEffects(rendering: CanvasV3(migrating: effects), sceneIndex: 0)
            .audioPlayerObjects?.first)
        #expect(restored.backgroundAudioVariants?.map(\.language) == ["de"])
        #expect(restored.backgroundAudioVariants?.first?.isAutoGenerated == false)
        #expect(restored.mutedVolumeMemento == 1)
    }

    @Test func drawingDataAlone_travelsAsADrawingObject() throws {
        var effects = StoryEffects()
        effects.drawingData = Data([1, 2, 3, 4])
        let document = CanvasV3(migrating: effects)
        #expect(object(document, "drawing")?.payload["data"] == .string("AQIDBA=="))
        #expect(StoryEffects(rendering: document, sceneIndex: 0).drawingData == Data([1, 2, 3, 4]))
    }

    // MARK: - Mémos wire (bande, borne de fin) et clés jamais fabriquées

    @Test func bandAnchorsAndTimingEnd_surviveTheRoundTrip() throws {
        let served = try JSONDecoder().decode(CanvasV3.self, from: fixture("reel-16x9-bands"))
        let back = CanvasV3(migrating: StoryEffects(rendering: served, sceneIndex: 0))
        #expect(object(back, "t1")?.anchor == .band(.top))
        #expect(object(back, "t2")?.anchor == .band(.bottom))
        #expect(object(back, "t1")?.timing?.end == 4.0)
        #expect(object(back, "t1")?.timing?.start == 0.5)
    }

    @Test func stickerWithoutWireAnchorPoint_neverFabricatesOne() throws {
        var effects = StoryEffects()
        effects.stickerObjects = [StorySticker(id: "st9", emoji: "🌍", zIndex: 2,
                                               baseSize: 300, fadeIn: 0.4)]
        let payload = try #require(object(CanvasV3(migrating: effects), "st9")?.payload)
        #expect(payload["anchorPoint"] == nil)
        #expect(payload["baseSize"] == .number(300))
        #expect(payload["fadeIn"] == .number(0.4))
    }

    @Test func stickerWithAWireAnchorPoint_reEmitsItVerbatim() throws {
        let json = #"{"stickerObjects":[{"id":"st8","emoji":"🌍","anchorPoint":"topLeft","baseSize":200}]}"#
        let effects = try JSONDecoder().decode(StoryEffects.self, from: Data(json.utf8))
        #expect(object(CanvasV3(migrating: effects), "st8")?.payload["anchorPoint"] == .string("topLeft"))
    }

    // MARK: - O3 (jamais de cadre vide) et prédicat de version

    @Test func emptyRuntime_emitsNoScene() throws {
        let document = CanvasV3(migrating: StoryEffects())
        #expect(document.scenes.isEmpty)
        let json = String(decoding: try JSONEncoder().encode(document), as: UTF8.self)
        #expect(!json.contains("scenes"))
    }

    @Test func documentBelowV3_isRefusedAtDecode() throws {
        let json = #"{"v":2,"scenes":[{"id":"s","objects":[]}]}"#
        #expect(throws: DecodingError.self) {
            try JSONDecoder().decode(CanvasV3.self, from: Data(json.utf8))
        }
    }

    @Test func documentAboveV3_decodesAndKeepsItsMark() throws {
        let json = #"{"v":4,"scenes":[{"id":"s","objects":[],"thumbHash":"abc"}]}"#
        let document = try JSONDecoder().decode(CanvasV3.self, from: Data(json.utf8))
        #expect(document.v == 4)
        #expect(document.scenes.first?.thumbHash == "abc")
    }

    @Test func reservedKind_isReEmittedAsIs() throws {
        let json = #"{"v":3,"scenes":[{"id":"s","objects":[{"id":"o","kind":"interactive","anchor":{"t":"free","x":0.5,"y":0.5},"plane":"fg","z":0,"transform":{"scale":1,"rotation":0,"opacity":1},"payload":{}}]}]}"#
        let document = try JSONDecoder().decode(CanvasV3.self, from: Data(json.utf8))
        let re = try JSONDecoder().decode(CanvasV3.self, from: JSONEncoder().encode(document))
        #expect(re == document)
        #expect(re.scenes[0].objects[0].kind == .reserved("interactive"))
    }

    // MARK: - Rattrapage de revue B8b — le son vit au DOCUMENT

    @Test func soundWithoutAnyObject_survivesTheRoundTrip() throws {
        let json = #"""
        {"backgroundAudioId":"snd_x","backgroundAudioVolume":0.4,
         "backgroundAudioStart":2,"backgroundAudioEnd":9,
         "voiceTranscriptions":[{"language":"fr","content":"Salut"}],
         "backgroundAudioVariants":[{"postMediaId":"64b0000000000000000000ff","language":"en","isAutoGenerated":true}]}
        """#
        let effects = try JSONDecoder().decode(StoryEffects.self, from: Data(json.utf8))
        let document = CanvasV3(migrating: effects)
        #expect(document.scenes.isEmpty)

        let back = StoryEffects(rendering: document, sceneIndex: 0)
        #expect(back.backgroundAudioId == "snd_x")
        #expect(back.backgroundAudioVolume == 0.4)
        #expect(back.backgroundAudioStart == 2)
        #expect(back.backgroundAudioEnd == 9)
        #expect(back.voiceTranscriptions?.map(\.content) == ["Salut"])
        #expect(back.backgroundAudioVariants?.map(\.postMediaId) == ["64b0000000000000000000ff"])
        #expect(CanvasV3(migrating: back) == document)
    }

    // MARK: - z de repli = compteur d'insertion, pour TOUTES les familles

    @Test func objectsWithoutZIndex_fallBackToTheInsertionCounter() throws {
        let json = #"""
        {"background":"color:#000",
         "textObjects":[{"id":"t1","text":"Salut"}],
         "mediaObjects":[{"id":"m1","postMediaId":"64b0000000000000000000aa"}],
         "stickerObjects":[{"id":"st1","emoji":"🌍"}],
         "locationObjects":[{"id":"L1","place":{"latitude":4.05,"longitude":9.76,"name":"Douala"}}],
         "audioPlayerObjects":[{"id":"a1","postMediaId":"64b0000000000000000000bb","placement":"canvas","x":0.5,"y":0.6,"volume":1,"waveformSamples":[0.2]}]}
        """#
        let effects = try JSONDecoder().decode(StoryEffects.self, from: Data(json.utf8))
        let document = CanvasV3(migrating: effects)
        #expect(object(document, "bg")?.z == 0)
        #expect(object(document, "t1")?.z == 1)
        #expect(object(document, "m1")?.z == 2)
        #expect(object(document, "st1")?.z == 3)
        #expect(object(document, "L1")?.z == 4)
        #expect(object(document, "a1")?.z == 5)
    }

    @Test func declaredZIndexOfZero_isNeverReplacedByTheCounter() throws {
        let json = #"""
        {"textObjects":[{"id":"t1","text":"a","zIndex":0},{"id":"t2","text":"b","zIndex":0}]}
        """#
        let effects = try JSONDecoder().decode(StoryEffects.self, from: Data(json.utf8))
        let document = CanvasV3(migrating: effects)
        #expect(object(document, "t1")?.z == 0)
        #expect(object(document, "t2")?.z == 0)
    }

    @Test func composedRuntimeKeepsItsOwnZIndexes() throws {
        var effects = StoryEffects()
        effects.textObjects = [StoryTextObject(id: "t1", text: "Salut", zIndex: 7)]
        effects.mediaObjects = [StoryMediaObject(id: "m1", kind: .image, aspectRatio: 1, zIndex: 9)]
        let document = CanvasV3(migrating: effects)
        #expect(object(document, "t1")?.z == 7)
        #expect(object(document, "m1")?.z == 9)
    }
}
