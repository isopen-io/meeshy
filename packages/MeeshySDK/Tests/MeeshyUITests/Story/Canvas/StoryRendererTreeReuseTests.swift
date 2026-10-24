import XCTest
import CoreMedia
import QuartzCore
@testable import MeeshyUI
@testable import MeeshySDK

/// **#9865, tranche 3 — `rebuildLayers` ne reconstruit plus l'arbre à chaque
/// image.**
///
/// Avant : chaque appel de `StoryRenderer.render` bâtissait une racine neuve,
/// y re-parentait chaque calque caché, puis le canevas les re-parentait dans
/// `itemsContainer` — et le calque de DESSIN était rastérisé à neuf
/// (1080×1920 × l'échelle de l'écran) dans un calque neuf, à chaque image de
/// lecture et à chaque image d'export.
@MainActor
final class StoryRendererTreeReuseTests: XCTestCase {

    private let geometry = CanvasGeometry(renderSize: CGSize(width: 1080, height: 1920))
    private static let drawingZ: CGFloat = 9999

    private static func stroke(_ id: String = "s1", toX: Double = 900) -> StoryDrawingStroke {
        StoryDrawingStroke(id: id,
                           points: [StoryDrawingStrokePoint(x: 100, y: 100), StoryDrawingStrokePoint(x: toX, y: 1500)],
                           colorHex: "FF0000", width: 12)
    }

    private static func slide() -> StorySlide {
        slide(strokes: [stroke()])
    }

    private static func slide(strokes: [StoryDrawingStroke]?) -> StorySlide {
        StorySlide(id: "s-tree",
                   effects: StoryEffects(
                    drawingStrokes: strokes,
                    textObjects: [
                        StoryTextObject(id: "still", text: "IMMOBILE", y: 0.2),
                        StoryTextObject(id: "moving", text: "BOUGE", x: 0.0, y: 0.6, keyframes: [
                            StoryKeyframe(time: 0, x: 0.0, y: 0.6),
                            StoryKeyframe(time: 2, x: 1.0, y: 0.6),
                        ]),
                    ],
                    timelineDuration: 10),
                   duration: 10)
    }

    private func liveCache(coreAnimation: Bool = true) -> StoryRendererCache {
        let cache = StoryRendererCache(keyframesPlayedByCoreAnimation: coreAnimation)
        cache.invalidateIfNeeded(slideId: "s-tree", languages: [], mode: .play)
        return cache
    }

    @discardableResult
    private func render(_ slide: StorySlide, at seconds: Double, cache: StoryRendererCache?,
                        reusing container: CALayer? = nil, suppressDrawing: Bool = false) -> CALayer {
        StoryRenderer.render(slide: slide, into: geometry,
                             at: CMTime(seconds: seconds, preferredTimescale: 600_000),
                             mode: .play, languages: [], cache: cache,
                             contentsScale: 1, suppressDrawingOverlay: suppressDrawing,
                             reusing: container)
    }

    private static func identities(_ layer: CALayer) -> [ObjectIdentifier] {
        (layer.sublayers ?? []).map(ObjectIdentifier.init)
    }

    private static func drawingLayer(in root: CALayer) -> CALayer? {
        root.sublayers?.first { $0.zPosition == drawingZ }
    }

    // MARK: - Le conteneur vivant garde ses calques

    func test_render_reusingAContainer_returnsIt_andKeepsTheSameLayersAcrossFrames() {
        let cache = liveCache()
        let container = CALayer()
        let story = Self.slide()

        let first = render(story, at: 0.5, cache: cache, reusing: container)
        let before = Self.identities(container)
        render(story, at: 0.6, cache: cache, reusing: container)
        render(story, at: 0.7, cache: cache, reusing: container)

        XCTAssertTrue(first === container, "le rendu se réconcilie dans le conteneur fourni")
        XCTAssertEqual(before.count, 3, "deux textes et le dessin")
        XCTAssertEqual(Self.identities(container), before, "aucun calque n'est remplacé d'une image à l'autre")
    }

    func test_render_reusingAContainer_keepsTheCoreAnimationOfAMovingText() throws {
        let cache = liveCache()
        let container = CALayer()
        let story = Self.slide()
        render(story, at: 0.5, cache: cache, reusing: container)
        let moving = try XCTUnwrap(container.sublayers?.first { $0.name == "moving" })

        render(story, at: 1.5, cache: cache, reusing: container)

        XCTAssertTrue(moving.superlayer === container)
        XCTAssertNotNil(moving.animation(forKey: "\(StoryRenderer.keyframeAnimationKey).0"))
        XCTAssertEqual(moving.timeOffset, 1.5, accuracy: 1e-9)
    }

    // MARK: - Le dessin se rastérise une fois

    func test_drawing_isRasterizedOnce_acrossLiveFrames() throws {
        let cache = liveCache()
        let container = CALayer()
        let story = Self.slide()

        render(story, at: 0.1, cache: cache, reusing: container)
        let drawing = try XCTUnwrap(Self.drawingLayer(in: container))
        for tick in 2...60 { render(story, at: Double(tick) / 60, cache: cache, reusing: container) }

        XCTAssertEqual(cache.drawingBuildCount, 1, "soixante images, une seule rastérisation")
        XCTAssertTrue(Self.drawingLayer(in: container) === drawing)
    }

    /// L'export rend chaque image dans une racine neuve (`layer.render(in:)`) :
    /// le calque de dessin y est le même, rastérisé une fois pour tout le fichier.
    func test_drawing_isRasterizedOnce_acrossExportFrames() throws {
        let cache = liveCache(coreAnimation: false)
        let story = Self.slide()

        let first = try XCTUnwrap(Self.drawingLayer(in: render(story, at: 0, cache: cache)))
        let later = try XCTUnwrap(Self.drawingLayer(in: render(story, at: 1.0 / 30, cache: cache)))

        XCTAssertTrue(first === later)
        XCTAssertEqual(cache.drawingBuildCount, 1)
    }

    func test_editedStrokes_rasterizeANewDrawing() throws {
        let cache = liveCache()
        let container = CALayer()
        render(Self.slide(), at: 0.1, cache: cache, reusing: container)
        let before = try XCTUnwrap(Self.drawingLayer(in: container))

        render(Self.slide(strokes: [Self.stroke(toX: 300)]), at: 0.2, cache: cache, reusing: container)

        XCTAssertFalse(Self.drawingLayer(in: container) === before)
        XCTAssertEqual(cache.drawingBuildCount, 2)
    }

    func test_suppressedDrawing_leavesTheContainer() {
        let cache = liveCache()
        let container = CALayer()
        render(Self.slide(), at: 0.1, cache: cache, reusing: container)

        render(Self.slide(), at: 0.2, cache: cache, reusing: container, suppressDrawing: true)

        XCTAssertNil(Self.drawingLayer(in: container))
        XCTAssertEqual(container.sublayers?.count, 2)
    }

    /// Le composer masque le dessin pendant que l'auteur dessine : son bitmap
    /// (1080×1920 × l'échelle de l'écran, ~75 Mo en 3x) n'est pas retenu par le
    /// cache pendant ce temps, et se rastérise de nouveau quand il réapparaît.
    func test_suppressedDrawing_releasesItsBitmap_untilItShowsAgain() {
        let cache = liveCache()
        let container = CALayer()
        render(Self.slide(), at: 0.1, cache: cache, reusing: container)

        render(Self.slide(), at: 0.2, cache: cache, reusing: container, suppressDrawing: true)
        render(Self.slide(), at: 0.3, cache: cache, reusing: container)

        XCTAssertEqual(cache.drawingBuildCount, 2, "le bitmap masqué n'est pas resté dans le cache")
        XCTAssertNotNil(Self.drawingLayer(in: container))
    }

    func test_erasedDrawing_leavesTheContainer() {
        let cache = liveCache()
        let container = CALayer()
        render(Self.slide(), at: 0.1, cache: cache, reusing: container)

        render(Self.slide(strokes: nil), at: 0.2, cache: cache, reusing: container)

        XCTAssertNil(Self.drawingLayer(in: container))
    }

    /// Contrat historique : sans cache (instantanés, capture du verre), chaque
    /// appel rend une racine neuve avec son dessin.
    func test_withoutCache_eachCallRendersAFreshRootWithItsDrawing() {
        let story = Self.slide()

        let first = render(story, at: 0.1, cache: nil)
        let second = render(story, at: 0.1, cache: nil)

        XCTAssertFalse(first === second)
        XCTAssertNotNil(Self.drawingLayer(in: first))
        XCTAssertNotNil(Self.drawingLayer(in: second))
    }

    // MARK: - À travers le canevas

    func test_playingCanvas_keepsItsItemsTreeAcrossTicks_drawingIncluded() throws {
        let canvas = StoryCanvasUIView(slide: Self.slide(), mode: .play, startsPaused: true)
        canvas.frame = CGRect(x: 0, y: 0, width: 390, height: 693)
        canvas.simulateTickAt(seconds: 0.1)
        let before = Self.identities(canvas.itemsContainer)
        let drawing = try XCTUnwrap(Self.drawingLayer(in: canvas.itemsContainer))

        for tick in 2...30 { canvas.simulateTickAt(seconds: Double(tick) * 0.1) }

        XCTAssertEqual(Self.identities(canvas.itemsContainer), before,
                       "trois secondes de lecture ne remplacent aucun calque")
        XCTAssertTrue(Self.drawingLayer(in: canvas.itemsContainer) === drawing,
                      "le dessin n'est pas rastérisé à chaque image")
    }
}
