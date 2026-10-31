import XCTest
import QuartzCore
@testable import MeeshyUI
@testable import MeeshySDK

/// #13864 (R4) — **une pastille de son est un objet de la scène comme les
/// autres** : peinte à son rang sous le sticker qui la recouvre (#13901), elle
/// se saisit, se déplace, s'agrandit et pivote depuis le canvas, comme sur
/// Android (`StorySceneStack`). La toucher la ramène devant, comme tout objet.
@MainActor
final class StoryCanvasBuriedSoundChipTests: XCTestCase {

    private func makeCanvas() -> StoryCanvasUIView {
        var effects = StoryEffects()
        effects.stickerObjects = [StorySticker(id: "sticker", emoji: "🔥", x: 0.5, y: 0.25, zIndex: 3)]
        var son = StoryAudioPlayerObject(id: "son", x: 0.5, y: 0.7)
        son.zIndex = 1
        effects.audioPlayerObjects = [son]
        let canvas = StoryCanvasUIView(slide: StorySlide(id: "s", effects: effects, duration: 6, order: 0),
                                       mode: .edit)
        canvas.frame = CGRect(x: 0, y: 0, width: 412, height: 732)
        canvas.rebuildLayers()
        return canvas
    }

    private func chipLayer(_ canvas: StoryCanvasUIView) -> CALayer? {
        canvas.itemsContainer.sublayers?.first { $0.name == "son" }
    }

    private func son(_ canvas: StoryCanvasUIView) throws -> StoryAudioPlayerObject {
        try XCTUnwrap(canvas.slide.effects.audioPlayerObjects?.first { $0.id == "son" })
    }

    func test_aBuriedChip_isGrabbedByTheCanvas() throws {
        let canvas = makeCanvas()
        let pastille = try XCTUnwrap(chipLayer(canvas), "la pastille enfouie se peint dans le canvas")

        XCTAssertEqual(canvas.resolveManipulationTarget(at: pastille.position), "son")
        XCTAssertEqual(canvas.itemKind(forId: "son"), .audio)
        let position = try XCTUnwrap(canvas.currentItemNormalizedPosition(forId: "son"),
                                     "sans position, le glissé est annulé au premier doigt")
        XCTAssertEqual(position.0, 0.5, accuracy: 0.0001)
        XCTAssertEqual(position.1, 0.7, accuracy: 0.0001)
        XCTAssertEqual(canvas.currentScale(forId: "son") ?? -1, 1, accuracy: 0.0001)
        XCTAssertEqual(canvas.currentRotation(forId: "son") ?? -1, 0, accuracy: 0.0001)
    }

    func test_draggingABuriedChip_movesItsLayerDuringTheGesture() throws {
        let canvas = makeCanvas()
        canvas.manipulatedItemId = "son"

        canvas.slide = canvas.updatePosition(slideId: "son", x: 0.3, y: 0.4)
        canvas.slide = canvas.updateScale(slideId: "son", scale: 1.5)
        canvas.slide = canvas.updateRotation(slideId: "son", rotation: 20)

        let pastille = try XCTUnwrap(chipLayer(canvas), "le geste ne reconstruit pas l'arbre")
        let pose = StoryAudioChipPainter.placement(for: try son(canvas), renderSize: canvas.bounds.size,
                                                   elapsed: 0)
        XCTAssertEqual(pastille.position.x, pose.center.x, accuracy: 0.5, "la pastille suit le doigt")
        XCTAssertEqual(pastille.position.y, pose.center.y, accuracy: 0.5)
        XCTAssertEqual(pastille.bounds.width, pose.size.width, accuracy: 0.5, "et la pince")
        XCTAssertEqual(pastille.bounds.height, pose.size.height, accuracy: 0.5)
        let angle = atan2(pastille.transform.m12, pastille.transform.m11)
        XCTAssertEqual(Double(angle), 20 * .pi / 180, accuracy: 0.001, "et la rotation")
    }

    func test_touchingABuriedChip_bringsItInFrontOfEverything() throws {
        let canvas = makeCanvas()

        canvas.bringForegroundToFront(id: "son")
        canvas.rebuildLayers()

        XCTAssertNil(chipLayer(canvas), "devant tout, la pastille rejoint la surcouche")
        XCTAssertEqual(SceneAudioStageRule.overlaidAudios(in: canvas.slide.effects).map(\.id), ["son"])
    }
}
