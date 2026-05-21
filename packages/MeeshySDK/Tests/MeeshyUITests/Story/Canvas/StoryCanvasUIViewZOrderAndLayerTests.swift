import XCTest
import UIKit
@testable import MeeshyUI
@testable import MeeshySDK

/// Couvre les fixes du sprint « video-layers-text » :
///
/// 1. `bringForegroundToFront(id:)` doit assigner `zIndex = nextTopZ()` à
///    l'élément touché ET réordonner le tableau (sinon le rendu trié par
///    zIndex ne reflète pas le tap).
/// 2. `resolveManipulationLayer(for:)` doit retourner la bonne couche selon
///    le contenu des effets — règle : fg (media non-bg / text / sticker)
///    domine, sinon bg, sinon canvas.
/// 3. `emitCurrentManipulationLayer()` doit appeler le callback avec la
///    valeur courante de `currentManipulationLayer` (force-emit utilisé par
///    le `UIViewRepresentable.updateUIView` pour resync SwiftUI).
@MainActor
final class StoryCanvasUIViewZOrderAndLayerTests: XCTestCase {

    // MARK: - Factories

    private func makeMedia(id: String, isBackground: Bool = false, zIndex: Int = 0) -> StoryMediaObject {
        StoryMediaObject(
            id: id,
            postMediaId: "post-\(id)",
            mediaURL: "https://cdn.example.test/\(id)",
            kind: .image,
            aspectRatio: 1.0,
            isBackground: isBackground,
            zIndex: zIndex
        )
    }

    private func makeText(id: String, zIndex: Int = 0) -> StoryTextObject {
        StoryTextObject(
            id: id,
            text: "Hello",
            zIndex: zIndex
        )
    }

    private func makeSticker(id: String, zIndex: Int = 0) -> StorySticker {
        StorySticker(
            id: id,
            emoji: "✨",
            x: 0.5, y: 0.5,
            scale: 1.0, rotation: 0,
            zIndex: zIndex
        )
    }

    private func makeSlide(effects: StoryEffects) -> StorySlide {
        StorySlide(id: UUID().uuidString, effects: effects, duration: 12, order: 0)
    }

    private func makeCanvas(slide: StorySlide) -> StoryCanvasUIView {
        let view = StoryCanvasUIView(slide: slide, mode: .edit)
        view.frame = CGRect(x: 0, y: 0, width: 412, height: 732)
        return view
    }

    // MARK: - bringForegroundToFront assigne zIndex

    func test_bringForegroundToFront_assignsNextTopZIndex_toMedia() {
        var effects = StoryEffects()
        effects.mediaObjects = [
            makeMedia(id: "a", zIndex: 1),
            makeMedia(id: "b", zIndex: 2),
            makeMedia(id: "c", zIndex: 3)
        ]
        let canvas = makeCanvas(slide: makeSlide(effects: effects))

        canvas.bringForegroundToFront(id: "a")

        let mediasAfter = canvas.slide.effects.mediaObjects ?? []
        // L'item touché a maintenant le zIndex le plus haut (max + 1 = 4).
        XCTAssertEqual(mediasAfter.first(where: { $0.id == "a" })?.zIndex, 4)
        // Les autres conservent leurs zIndex.
        XCTAssertEqual(mediasAfter.first(where: { $0.id == "b" })?.zIndex, 2)
        XCTAssertEqual(mediasAfter.first(where: { $0.id == "c" })?.zIndex, 3)
        // L'ordre du tableau reflète aussi le mouvement (cohérent avec l'inspecteur).
        XCTAssertEqual(mediasAfter.last?.id, "a")
    }

    func test_bringForegroundToFront_skipsBackgroundMedia() {
        var effects = StoryEffects()
        effects.mediaObjects = [
            makeMedia(id: "bg", isBackground: true, zIndex: 0),
            makeMedia(id: "fg", isBackground: false, zIndex: 1)
        ]
        let canvas = makeCanvas(slide: makeSlide(effects: effects))

        // Tap sur le bg → ne doit pas modifier le zIndex (skip background).
        canvas.bringForegroundToFront(id: "bg")

        let mediasAfter = canvas.slide.effects.mediaObjects ?? []
        XCTAssertEqual(mediasAfter.first(where: { $0.id == "bg" })?.zIndex, 0)
    }

    func test_bringForegroundToFront_assignsNextTopZIndex_toText() {
        var effects = StoryEffects()
        effects.textObjects = [
            makeText(id: "t1", zIndex: 1),
            makeText(id: "t2", zIndex: 5)
        ]
        let canvas = makeCanvas(slide: makeSlide(effects: effects))

        canvas.bringForegroundToFront(id: "t1")

        let texts = canvas.slide.effects.textObjects
        XCTAssertEqual(texts.first(where: { $0.id == "t1" })?.zIndex, 6)
        XCTAssertEqual(texts.last?.id, "t1")
    }

    func test_bringForegroundToFront_assignsNextTopZIndex_toSticker() {
        var effects = StoryEffects()
        effects.stickerObjects = [
            makeSticker(id: "s1", zIndex: 1),
            makeSticker(id: "s2", zIndex: 3)
        ]
        let canvas = makeCanvas(slide: makeSlide(effects: effects))

        canvas.bringForegroundToFront(id: "s1")

        let stickers = canvas.slide.effects.stickerObjects ?? []
        XCTAssertEqual(stickers.first(where: { $0.id == "s1" })?.zIndex, 4)
        XCTAssertEqual(stickers.last?.id, "s1")
    }

    func test_bringForegroundToFront_noopWhenAlreadyTopAndLast() {
        var effects = StoryEffects()
        effects.mediaObjects = [
            makeMedia(id: "a", zIndex: 1),
            makeMedia(id: "b", zIndex: 5)
        ]
        let canvas = makeCanvas(slide: makeSlide(effects: effects))
        let beforeFingerprint = canvas.slide.effects.mediaObjects?.map { "\($0.id):\($0.zIndex)" }

        canvas.bringForegroundToFront(id: "b") // déjà top + déjà last

        let afterFingerprint = canvas.slide.effects.mediaObjects?.map { "\($0.id):\($0.zIndex)" }
        XCTAssertEqual(beforeFingerprint, afterFingerprint)
    }

    // MARK: - resolveManipulationLayer (pure)

    func test_resolveManipulationLayer_emptyEffects_returnsCanvas() {
        XCTAssertEqual(StoryCanvasUIView.resolveManipulationLayer(for: StoryEffects()), .canvas)
    }

    func test_resolveManipulationLayer_onlyBackgroundMedia_returnsBackground() {
        var effects = StoryEffects()
        effects.mediaObjects = [makeMedia(id: "bg", isBackground: true)]
        XCTAssertEqual(StoryCanvasUIView.resolveManipulationLayer(for: effects), .background)
    }

    func test_resolveManipulationLayer_onlyForegroundMedia_returnsForeground() {
        var effects = StoryEffects()
        effects.mediaObjects = [makeMedia(id: "fg", isBackground: false)]
        XCTAssertEqual(StoryCanvasUIView.resolveManipulationLayer(for: effects), .foreground)
    }

    func test_resolveManipulationLayer_textWithoutMedia_returnsForeground() {
        var effects = StoryEffects()
        effects.textObjects = [makeText(id: "t1")]
        XCTAssertEqual(StoryCanvasUIView.resolveManipulationLayer(for: effects), .foreground)
    }

    func test_resolveManipulationLayer_stickerWithoutMedia_returnsForeground() {
        var effects = StoryEffects()
        effects.stickerObjects = [makeSticker(id: "s1")]
        XCTAssertEqual(StoryCanvasUIView.resolveManipulationLayer(for: effects), .foreground)
    }

    func test_resolveManipulationLayer_fgAndBgMix_returnsForeground() {
        var effects = StoryEffects()
        effects.mediaObjects = [
            makeMedia(id: "bg", isBackground: true),
            makeMedia(id: "fg", isBackground: false)
        ]
        XCTAssertEqual(StoryCanvasUIView.resolveManipulationLayer(for: effects), .foreground)
    }

    // MARK: - emitCurrentManipulationLayer

    func test_emitCurrentManipulationLayer_firesCallbackWithCurrentValue() {
        var effects = StoryEffects()
        effects.mediaObjects = [makeMedia(id: "fg", isBackground: false)]
        let canvas = makeCanvas(slide: makeSlide(effects: effects))
        // L'init de StoryCanvasUIView a déjà appelé updateManipulationLayer
        // donc currentManipulationLayer == .foreground.
        XCTAssertEqual(canvas.currentManipulationLayer, .foreground)

        var received: [CanvasManipulationLayer] = []
        canvas.onManipulationLayerChanged = { received.append($0) }
        canvas.emitCurrentManipulationLayer()

        XCTAssertEqual(received, [.foreground])
    }

    func test_emitCurrentManipulationLayer_isIdempotentWhenCallbackNil() {
        let canvas = makeCanvas(slide: makeSlide(effects: StoryEffects()))
        canvas.onManipulationLayerChanged = nil
        // Ne doit pas crasher quand le callback est nil.
        canvas.emitCurrentManipulationLayer()
    }

    func test_slideMutation_emitsNewLayerThroughCallback() {
        let canvas = makeCanvas(slide: makeSlide(effects: StoryEffects())) // .canvas
        var received: [CanvasManipulationLayer] = []
        canvas.onManipulationLayerChanged = { received.append($0) }

        var effects = StoryEffects()
        effects.mediaObjects = [makeMedia(id: "fg", isBackground: false)]
        canvas.slide = StorySlide(id: canvas.slide.id, effects: effects, duration: 12, order: 0)

        XCTAssertEqual(received.last, .foreground)
        XCTAssertEqual(canvas.currentManipulationLayer, .foreground)
    }
}
