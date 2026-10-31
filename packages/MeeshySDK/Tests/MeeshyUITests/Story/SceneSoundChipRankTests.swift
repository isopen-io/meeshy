import XCTest
import CoreMedia
import SwiftUI
@testable import MeeshyUI
@testable import MeeshySDK

/// #13901 — **une pastille de son se peint à son RANG**, comme sur Android
/// (`StorySceneStack`) : sous le sticker posé au-dessus d'elle, au-dessus de
/// ce qu'elle recouvre. Une pastille sans rang reste au-dessus de tout.
@MainActor
final class SceneSoundChipRankTests: XCTestCase {

    private let geometry = CanvasGeometry(renderSize: CGSize(width: 390, height: 693))

    private func chip(_ id: String = "son", z: Int?) -> StoryAudioPlayerObject {
        var audio = StoryAudioPlayerObject(id: id, x: 0.5, y: 0.5)
        audio.zIndex = z
        return audio
    }

    private func effects(chips: [StoryAudioPlayerObject], stickerZ: Int?) -> StoryEffects {
        var effects = StoryEffects()
        effects.textObjects = []
        effects.stickerObjects = stickerZ.map { [StorySticker(id: "sticker", emoji: "🔥", zIndex: $0)] }
        effects.audioPlayerObjects = chips
        return effects
    }

    private func slide(_ effects: StoryEffects) -> StorySlide {
        StorySlide(id: "rang", effects: effects, duration: 6, order: 0)
    }

    private func at(_ seconds: Double) -> CMTime { CMTime(seconds: seconds, preferredTimescale: 600) }

    // MARK: - La loi

    func test_aChipRankedUnderASticker_isBuried_andLeavesTheOverlay() {
        let scene = effects(chips: [chip(z: 1)], stickerZ: 3)

        XCTAssertTrue(SceneAudioStageRule.isBuried(chip(z: 1), in: scene))
        XCTAssertEqual(SceneAudioStageRule.buriedAudios(in: scene).map(\.id), ["son"])
        XCTAssertTrue(SceneAudioStageRule.overlaidAudios(in: scene).isEmpty)
    }

    func test_aChipWithoutRank_staysAboveEverything() {
        let scene = effects(chips: [chip(z: nil)], stickerZ: 99)

        XCTAssertFalse(SceneAudioStageRule.isBuried(chip(z: nil), in: scene))
        XCTAssertEqual(SceneAudioStageRule.overlaidAudios(in: scene).map(\.id), ["son"])
    }

    func test_aChipRankedAboveTheSticker_orTiedWithIt_staysInTheOverlay() {
        XCTAssertEqual(SceneAudioStageRule.overlaidAudios(in: effects(chips: [chip(z: 4)], stickerZ: 3)).map(\.id),
                       ["son"])
        XCTAssertEqual(SceneAudioStageRule.overlaidAudios(in: effects(chips: [chip(z: 3)], stickerZ: 3)).map(\.id),
                       ["son"], "à rang égal, la pastille passe devant, comme l'objet ajouté le dernier")
    }

    func test_onlyAnotherForegroundFamily_buriesAChip() {
        var scene = effects(chips: [chip("bas", z: 1), chip("haut", z: 5)], stickerZ: nil)
        var fond = StoryMediaObject(id: "fond", kind: .image, aspectRatio: 1)
        fond.isBackground = true
        fond.zIndex = 9
        scene.mediaObjects = [fond]

        XCTAssertTrue(SceneAudioStageRule.buriedAudios(in: scene).isEmpty,
                      "ni une autre pastille ni le fond ne recouvrent une pastille")
        XCTAssertEqual(SceneAudioStageRule.overlaidAudios(in: scene).map(\.id), ["bas", "haut"],
                       "la surcouche les peint de la plus basse à la plus haute")
    }

    // MARK: - Le moteur de scène

    func test_theRenderer_paintsABuriedChip_atItsRank_underTheSticker() throws {
        for mode in [RenderMode.play, .edit] {
            let root = StoryRenderer.render(slide: slide(effects(chips: [chip(z: 1)], stickerZ: 3)),
                                            into: geometry, at: at(1), mode: mode)

            let calques = root.sublayers ?? []
            let pastille = try XCTUnwrap(calques.firstIndex { $0.name == "son" }, "mode \(mode)")
            let sticker = try XCTUnwrap(calques.firstIndex { $0.name == "sticker" })
            XCTAssertTrue(calques[pastille] is StoryAudioChipLayer)
            XCTAssertLessThan(pastille, sticker, "la pastille se peint SOUS le sticker (mode \(mode))")
            XCTAssertEqual(calques[pastille].zPosition, 1)
            XCTAssertNotNil(calques[pastille].contents, "la capsule est peinte")
        }
    }

    func test_theRenderer_leavesAChipWithoutRank_toTheOverlay() {
        let root = StoryRenderer.render(slide: slide(effects(chips: [chip(z: nil)], stickerZ: 3)),
                                        into: geometry, at: at(1), mode: .play)

        XCTAssertNil(root.sublayers?.first { $0.name == "son" })
    }

    func test_theExportPainter_doesNotPaintABuriedChipTwice() {
        let enfouie = slide(effects(chips: [chip(z: 1)], stickerZ: 3))
        let dessus = slide(effects(chips: [chip(z: 4)], stickerZ: 3))

        XCTAssertTrue(StoryAudioChipPainter.placements(for: enfouie, into: geometry, at: at(1)).isEmpty)
        XCTAssertEqual(StoryAudioChipPainter.placements(for: dessus, into: geometry, at: at(1)).map(\.audioId),
                       ["son"])
    }

    // MARK: - Le lecteur

    private func player(chipZ: Int) throws -> MeeshyScenePlayer {
        var scene = effects(chips: [chip(z: chipZ)], stickerZ: 3)
        scene.audioPlayerObjects?[0].mediaURL = "/son.m4a"
        let document = CanvasV3(scenes: [try XCTUnwrap(CanvasV3.migratedScene(scene, id: "s1"))])
        return MeeshyScenePlayer(document: document, mode: .reader, sceneIndex: .constant(0),
                                 isPlaying: .constant(false), accentColorHex: "#7C3AED")
    }

    func test_theScenePlayer_overlaysOnlyTheChipsNothingCovers() throws {
        XCTAssertTrue(try player(chipZ: 1).overlaidSceneAudios.isEmpty,
                      "la pastille sous le sticker n'est pas peinte au-dessus de tout")
        XCTAssertEqual(try player(chipZ: 7).overlaidSceneAudios.map(\.id), ["son"])
    }
}
