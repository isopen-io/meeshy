import XCTest
import Metal
import QuartzCore
@testable import MeeshyUI
@testable import MeeshySDK

/// #9864 — les lois de `StoryCanvasPlaybackEnergyTests`, câblées dans le canvas.
///
/// Le canvas n'est attaché à aucune fenêtre (même motif que
/// `StoryCanvasUIViewReaderContextTests`) : les ticks sont rejoués par
/// `simulateTickAt`, qui reconstruit la scène exactement comme le lien.
@MainActor
final class StoryCanvasPlaybackEnergyCanvasTests: XCTestCase {

    private static func glassOverStillScene() -> StorySlide {
        StorySlide(id: "verre-immobile",
                   effects: StoryEffects(
                    textObjects: [
                        StoryTextObject(id: "glass", text: "VERRE", backgroundStyle: .glass(radius: 24)),
                        StoryTextObject(id: "plain", text: "TEXTE", y: 0.2, backgroundStyle: .solid(hex: "FFFFFF")),
                    ],
                    timelineDuration: 30),
                   duration: 30)
    }

    private static func playingCanvas(_ slide: StorySlide) -> StoryCanvasUIView {
        let canvas = StoryCanvasUIView(slide: slide, mode: .play, startsPaused: true)
        canvas.frame = CGRect(x: 0, y: 0, width: 390, height: 693)
        return canvas
    }

    private static func glassLayer(in canvas: StoryCanvasUIView) -> StoryTextLayer? {
        canvas.itemsContainer.sublayers?
            .compactMap { $0 as? StoryTextLayer }
            .first { $0.hasGlassBackdrop }
    }

    // MARK: - Verre

    /// Le témoin du lot, à travers le canvas : trente secondes de ticks sur un
    /// verre posé sur une scène immobile ne font qu'UNE capture.
    func test_glassOverStillScene_isCapturedOnceAcrossThirtySecondsOfTicks() throws {
        try XCTSkipIf(MTLCreateSystemDefaultDevice() == nil, "aucun device Metal")
        let canvas = Self.playingCanvas(Self.glassOverStillScene())
        canvas.simulateTickAt(seconds: 0.1)
        XCTAssertEqual(canvas.backdropCapture.generation, 1)

        for tick in 2...300 {
            canvas.simulateTickAt(seconds: Double(tick) * 0.1)
        }

        XCTAssertEqual(canvas.backdropCapture.generation, 1,
                       "un dessous immobile ne se recapture pas à chaque image")
        XCTAssertEqual(Self.glassLayer(in: canvas)?.glassBackdropFeedStamp?.generation, 1,
                       "le verre porte la découpe de l'unique capture")
    }

    /// Contre-épreuve : la géométrie change ⇒ la capture se refait, et le verre
    /// reçoit la nouvelle découpe.
    func test_glassOverStillScene_recapturesWhenTheGeometryChanges() throws {
        try XCTSkipIf(MTLCreateSystemDefaultDevice() == nil, "aucun device Metal")
        let canvas = Self.playingCanvas(Self.glassOverStillScene())
        canvas.simulateTickAt(seconds: 0.1)

        canvas.frame = CGRect(x: 0, y: 0, width: 300, height: 533)
        canvas.simulateTickAt(seconds: 0.2)

        XCTAssertEqual(canvas.backdropCapture.generation, 2)
        XCTAssertEqual(Self.glassLayer(in: canvas)?.glassBackdropFeedStamp?.generation, 2)
    }

    /// Hors fenêtre, la texture plein cadre se rend.
    func test_leavingTheWindow_releasesTheCanvasBackdrop() throws {
        try XCTSkipIf(MTLCreateSystemDefaultDevice() == nil, "aucun device Metal")
        let canvas = Self.playingCanvas(Self.glassOverStillScene())
        canvas.simulateTickAt(seconds: 0.1)
        XCTAssertNotNil(canvas.backdropCapture.playbackKey)

        canvas.willMove(toWindow: nil)

        XCTAssertNil(canvas.backdropCapture.playbackKey)
        XCTAssertNil(canvas.backdropCapture.cropRegion(CGRect(x: 0, y: 0, width: 50, height: 50)))
    }

    // MARK: - Cadence

    func test_stillSlideInTheStoryReader_runsItsLinkOnTheLowTier() {
        let canvas = Self.playingCanvas(Self.glassOverStillScene())
        XCTAssertEqual(canvas.playbackCadenceTier(), .low)
    }

    func test_hostDrawingFromTheTick_keepsTheHighTier() {
        let canvas = Self.playingCanvas(Self.glassOverStillScene())
        canvas.onPlaybackTime = { _ in }
        XCTAssertEqual(canvas.playbackCadenceTier(), .high)
    }

    // MARK: - Lien d'édition

    func test_prefetchedCanvas_armsNoEditLink() {
        let canvas = StoryCanvasUIView(slide: StorySlide(id: "voisine"), mode: .edit)
        canvas.isUserInteractionEnabled = false
        canvas.startEditDisplayLinkIfNeeded()
        XCTAssertNil(canvas.editDisplayLink)
    }

    func test_interactiveEditCanvas_stillArmsItsEditLink() {
        let canvas = StoryCanvasUIView(slide: StorySlide(id: "composer"), mode: .edit)
        canvas.startEditDisplayLinkIfNeeded()
        XCTAssertNotNil(canvas.editDisplayLink)
        canvas.stopEditDisplayLink()
    }

    // MARK: - Gardes de source

    func test_renderingSite_consultsTheGlassLaw() throws {
        let rendering = try ComposerSourceGuard.source("Canvas/StoryCanvasUIView+Rendering.swift")
        XCTAssertTrue(rendering.contains("StoryGlassBackdropPlayback.shouldRecapture("))
        XCTAssertTrue(rendering.contains("StoryGlassBackdropPlayback.shouldFeed("))
    }

    func test_playbackSite_consultsTheCadenceAndArmingLaws() throws {
        let playback = try ComposerSourceGuard.source("Canvas/StoryCanvasUIView+Playback.swift")
        XCTAssertTrue(playback.contains("StoryPlaybackCadence.tier("))
        XCTAssertTrue(playback.contains("EditClockArming.shouldArm("))
        XCTAssertTrue(playback.contains("mediaTier: DeviceMediaTier.current"),
                      "le palier de l'appareil vient de la loi DeviceMediaTier, lue à chaque pose de la plage")
        XCTAssertFalse(playback.contains("CAFrameRateRange(minimum: 60, maximum: 120, preferred: 60)"),
                       "le palier de lecture vient de la loi, pas d'une plage écrite au site")
    }
}
