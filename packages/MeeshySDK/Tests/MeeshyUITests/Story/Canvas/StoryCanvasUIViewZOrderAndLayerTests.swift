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

    func test_bringForegroundToFront_text_triggersOnlyOneSlideDidSet() {
        var effects = StoryEffects()
        effects.textObjects = [
            makeText(id: "t1", zIndex: 1),
            makeText(id: "t2", zIndex: 2)
        ]
        let canvas = makeCanvas(slide: makeSlide(effects: effects))
        let before = canvas.slideContentRevision

        canvas.bringForegroundToFront(id: "t1")

        // Régression : sans copie locale, la triple mutation directe via
        // subscript (`text[i].zIndex = …` + `remove` + `append`)
        // déclenchait `slide.didSet` 3 fois — donc 3 `rebuildLayers()`
        // par tap. Avec la copie locale, un seul write au `slide.effects.
        // textObjects = local` ⇒ une seule incrémentation de la révision.
        XCTAssertEqual(canvas.slideContentRevision - before, 1)
    }

    func test_bringForegroundToFront_sticker_triggersOnlyOneSlideDidSet() {
        var effects = StoryEffects()
        effects.stickerObjects = [
            makeSticker(id: "s1", zIndex: 1),
            makeSticker(id: "s2", zIndex: 2)
        ]
        let canvas = makeCanvas(slide: makeSlide(effects: effects))
        let before = canvas.slideContentRevision

        canvas.bringForegroundToFront(id: "s1")

        XCTAssertEqual(canvas.slideContentRevision - before, 1)
    }

    func test_bringForegroundToFront_media_triggersOnlyOneSlideDidSet() {
        var effects = StoryEffects()
        effects.mediaObjects = [
            makeMedia(id: "a", zIndex: 1),
            makeMedia(id: "b", zIndex: 2)
        ]
        let canvas = makeCanvas(slide: makeSlide(effects: effects))
        let before = canvas.slideContentRevision

        canvas.bringForegroundToFront(id: "a")

        XCTAssertEqual(canvas.slideContentRevision - before, 1)
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

    // MARK: - resolveManipulationTarget : pas de fallback bg (règle 2026-07-11)

    /// RÈGLE PRODUIT (user 2026-07-11, remplace l'UX 2026-05-22) : le fond
    /// n'est manipulable QUE via le chip Background. En mode `.foreground`,
    /// rater un item ne doit RIEN manipuler — l'ancien fallback bg faisait
    /// bouger le fond au moindre raté de hit-test (dessin pleine toile qui
    /// avalait les hits) alors que le chip affichait Foreground.
    func test_resolveManipulationTarget_foregroundMode_missDoesNotTouchBackground() {
        var effects = StoryEffects()
        // BG image qui couvre toute la slide + sticker minuscule au centre.
        effects.mediaObjects = [
            makeMedia(id: "bg", isBackground: true, zIndex: 0)
        ]
        effects.stickerObjects = [makeSticker(id: "sticker", zIndex: 1)]
        let canvas = makeCanvas(slide: makeSlide(effects: effects))
        // Couche calculée à init = .foreground (le sticker compte comme fg).
        XCTAssertEqual(canvas.currentManipulationLayer, .foreground)

        // Touche en (5, 5) — coin haut-gauche, là où le sticker (au centre)
        // n'est jamais. Foreground hit-test rate → AUCUNE cible.
        let target = canvas.resolveManipulationTarget(at: CGPoint(x: 5, y: 5))

        XCTAssertNil(target,
            "En couche Foreground, un raté de hit-test ne doit pas manipuler le fond (chip Background = seul chemin)")
    }

    func test_resolveManipulationTarget_foregroundMode_foregroundUnderTouchTakesPriority() {
        var effects = StoryEffects()
        effects.mediaObjects = [makeMedia(id: "bg", isBackground: true, zIndex: 0)]
        // Sticker positionné explicitement au centre (default x=0.5, y=0.5).
        effects.stickerObjects = [makeSticker(id: "sticker", zIndex: 1)]
        let canvas = makeCanvas(slide: makeSlide(effects: effects))
        // Le hit-test repose sur les CALayers construits par `rebuildLayers()`
        // qui s'exécute dans `layoutSubviews`. Sans frame attachée à une window
        // ou layout forcé, les layers du sticker ne sont pas en place et le
        // hit-test ne retournerait jamais le sticker.
        canvas.layoutIfNeeded()

        // Tap au centre — le sticker (z=1) est sous le doigt → priorité fg.
        let centerX = canvas.bounds.midX
        let centerY = canvas.bounds.midY
        let target = canvas.resolveManipulationTarget(at: CGPoint(x: centerX, y: centerY))

        XCTAssertEqual(target, "sticker",
            "Le foreground sous le doigt doit gagner sur le fallback bg.")
    }

    func test_resolveManipulationTarget_canvasMode_returnsNil() {
        let canvas = makeCanvas(slide: makeSlide(effects: StoryEffects())) // .canvas
        let target = canvas.resolveManipulationTarget(at: CGPoint(x: 100, y: 100))
        XCTAssertNil(target, "Mode `.canvas` doit absorber tous les gestures (rien à manipuler).")
    }

    func test_resolveManipulationTarget_backgroundMode_returnsBgRegardlessOfLocation() {
        var effects = StoryEffects()
        effects.mediaObjects = [makeMedia(id: "bg", isBackground: true)]
        let canvas = makeCanvas(slide: makeSlide(effects: effects))
        XCTAssertEqual(canvas.currentManipulationLayer, .background)

        // N'importe où sur le canvas → toujours le bg.
        XCTAssertEqual(canvas.resolveManipulationTarget(at: CGPoint(x: 5, y: 5)), "bg")
        XCTAssertEqual(canvas.resolveManipulationTarget(at: CGPoint(x: 200, y: 400)), "bg")
    }

    // MARK: - ThreeFingerPinchGestureRecognizer.averageDistance (pure)

    func test_threeFingerPinch_averageDistance_threePointsCentered() {
        // 3 points formant un triangle équilatéral centré → distance moyenne
        // au centroïde = rayon du cercle circonscrit (≈ 1.0 pour ce triangle).
        let points: [CGPoint] = [
            CGPoint(x: 0, y: 1),
            CGPoint(x: -sqrt(3)/2, y: -0.5),
            CGPoint(x: sqrt(3)/2, y: -0.5)
        ]
        let dist = ThreeFingerPinchGestureRecognizer.averageDistance(points: points)
        XCTAssertEqual(dist, 1.0, accuracy: 0.001)
    }

    func test_threeFingerPinch_averageDistance_emptyReturnsZero() {
        XCTAssertEqual(ThreeFingerPinchGestureRecognizer.averageDistance(points: []), 0)
    }

    func test_threeFingerPinch_averageDistance_scalesLinearlyWithSpread() {
        let small: [CGPoint] = [CGPoint(x: 0, y: 1), CGPoint(x: -1, y: -1), CGPoint(x: 1, y: -1)]
        let large: [CGPoint] = [CGPoint(x: 0, y: 2), CGPoint(x: -2, y: -2), CGPoint(x: 2, y: -2)]
        let dSmall = ThreeFingerPinchGestureRecognizer.averageDistance(points: small)
        let dLarge = ThreeFingerPinchGestureRecognizer.averageDistance(points: large)
        // Doubler les écarts double la distance moyenne au centroïde.
        XCTAssertEqual(dLarge / dSmall, 2.0, accuracy: 0.001)
    }
}
