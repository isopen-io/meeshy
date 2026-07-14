import XCTest
@testable import MeeshyUI
@testable import MeeshySDK

/// Directive user 2026-07-14 : effet snap pour cadrer le contenu d'arrière-plan
/// — snap au CENTRE (0.5) et aux BORDS (0.0 / 1.0) quand l'utilisateur approche.
/// Distinct des rails de snap foreground (0.18/0.25/0.5/0.75/0.82).
@MainActor
final class StoryCanvasBackgroundSnapTests: XCTestCase {

    private func makeCanvas() -> StoryCanvasUIView {
        var bg = StoryMediaObject(id: "bg1", postMediaId: "bg1", kind: .image, aspectRatio: 1)
        bg.isBackground = true
        var slide = StorySlide(id: "s")
        slide.effects.mediaObjects = [bg]
        let canvas = StoryCanvasUIView(slide: slide, mode: .edit)
        canvas.frame = CGRect(x: 0, y: 0, width: 412, height: 732)
        canvas.rebuildLayers()
        return canvas
    }

    func test_snapsToCenter_whenNear() {
        let canvas = makeCanvas()
        let (snapped, didSnap) = canvas.snapBackground(0.51)
        XCTAssertTrue(didSnap)
        XCTAssertEqual(snapped, 0.5, accuracy: 0.0001, "Proche du centre → snap 0.5")
    }

    func test_snapsToLeadingEdge_whenNear() {
        let canvas = makeCanvas()
        let (snapped, didSnap) = canvas.snapBackground(0.02)
        XCTAssertTrue(didSnap)
        XCTAssertEqual(snapped, 0.0, accuracy: 0.0001, "Proche du bord → snap 0.0")
    }

    func test_snapsToTrailingEdge_whenNear() {
        let canvas = makeCanvas()
        let (snapped, didSnap) = canvas.snapBackground(0.98)
        XCTAssertTrue(didSnap)
        XCTAssertEqual(snapped, 1.0, accuracy: 0.0001)
    }

    func test_doesNotSnap_whenFarFromAnyTarget() {
        let canvas = makeCanvas()
        let (snapped, didSnap) = canvas.snapBackground(0.3)
        XCTAssertFalse(didSnap)
        XCTAssertEqual(snapped, 0.3, accuracy: 0.0001, "Loin de toute cible → valeur inchangée")
    }

    func test_backgroundSnapTargets_areCenterAndEdges() {
        XCTAssertEqual(StoryCanvasUIView.backgroundSnapTargets, [0.0, 0.5, 1.0])
    }
}
