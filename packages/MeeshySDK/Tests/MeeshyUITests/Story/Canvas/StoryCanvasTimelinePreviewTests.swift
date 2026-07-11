import XCTest
import CoreMedia
import QuartzCore
@testable import MeeshyUI
@testable import MeeshySDK

/// Lot B — preview vivante : la sheet timeline pilote le canvas composer
/// comme moniteur de preview. Le canvas reste en `.edit` (gestes, overlays)
/// mais REND en sémantique `.play` au playhead poussé : fenêtres temporelles
/// respectées, audio des players muet (l'engine timeline est la seule source
/// sonore), et sortie de preview = retour au rendu d'édition intemporel.
@MainActor
final class StoryCanvasTimelinePreviewTests: XCTestCase {

    /// Slide avec un texte à fenêtre temporelle [2s, 3s] — le discriminant
    /// entre rendu `.edit` (toujours visible) et `.play` (visible à t∈[2,3[).
    private func makeSlide() -> StorySlide {
        var text = StoryTextObject(id: "windowed-text", text: "Bonjour")
        text.startTime = 2
        text.duration = 1
        var slide = StorySlide(id: "slide-preview")
        slide.effects.textObjects = [text]
        slide.effects.timelineDuration = 6
        return slide
    }

    private func makeCanvas(mode: RenderMode = .edit) -> StoryCanvasUIView {
        let view = StoryCanvasUIView(slide: makeSlide(), mode: mode)
        view.frame = CGRect(x: 0, y: 0, width: 412, height: 732)
        return view
    }

    private func itemLayer(_ canvas: StoryCanvasUIView, id: String) -> CALayer? {
        canvas.itemsContainer.sublayers?.first { $0.name == id }
    }

    func test_setTimelinePreview_atTimeOutsideWindow_hidesWindowedElement() {
        let canvas = makeCanvas()

        canvas.setTimelinePreview(seconds: 0)

        XCTAssertNil(itemLayer(canvas, id: "windowed-text"),
                     "En preview à t=0, un texte fenêtré [2,3] ne doit PAS être rendu (sémantique .play)")
    }

    func test_setTimelinePreview_atTimeInsideWindow_showsWindowedElement() {
        let canvas = makeCanvas()

        canvas.setTimelinePreview(seconds: 2.5)

        XCTAssertNotNil(itemLayer(canvas, id: "windowed-text"),
                        "En preview à t=2.5, le texte fenêtré [2,3] doit être rendu")
    }

    func test_setTimelinePreview_nil_restoresTimelessEditRendering() {
        let canvas = makeCanvas()
        canvas.setTimelinePreview(seconds: 0)

        canvas.setTimelinePreview(seconds: nil)

        XCTAssertNotNil(itemLayer(canvas, id: "windowed-text"),
                        "Sortie de preview : le rendu .edit redevient intemporel — tout élément visible")
        XCTAssertEqual(canvas.renderMode, .edit)
    }

    func test_setTimelinePreview_inPlayMode_isIgnored() {
        let canvas = makeCanvas(mode: .play)

        canvas.setTimelinePreview(seconds: 2)

        XCTAssertNil(canvas.timelinePreviewSeconds,
                     "Le reader (.play) ne doit jamais entrer en preview timeline")
    }

    func test_effectiveAudioMuted_trueWhilePreviewActive_evenUnmuted() {
        let canvas = makeCanvas()
        XCTAssertFalse(canvas.effectiveAudioMuted)

        canvas.setTimelinePreview(seconds: 1)

        XCTAssertTrue(canvas.effectiveAudioMuted,
                      "Pendant la preview, l'engine timeline possède l'audio — players canvas muets")
    }

    func test_setTimelinePreviewPlaying_togglesPlaybackIntentFlags() {
        let canvas = makeCanvas()
        canvas.setTimelinePreview(seconds: 1)

        canvas.setTimelinePreviewPlaying(true)
        XCTAssertTrue(canvas.foregroundVideosPlaybackActive)
        XCTAssertTrue(canvas.backgroundLayer.isPlaybackActive)

        canvas.setTimelinePreviewPlaying(false)
        XCTAssertFalse(canvas.foregroundVideosPlaybackActive)
        XCTAssertFalse(canvas.backgroundLayer.isPlaybackActive)
    }

    func test_setTimelinePreview_exit_stopsPlaybackIntent() {
        let canvas = makeCanvas()
        canvas.setTimelinePreview(seconds: 1)
        canvas.setTimelinePreviewPlaying(true)

        canvas.setTimelinePreview(seconds: nil)

        XCTAssertFalse(canvas.foregroundVideosPlaybackActive,
                       "La sortie de preview rend le transport — les intents de lecture retombent")
        XCTAssertFalse(canvas.backgroundLayer.isPlaybackActive)
    }

    func test_bridge_forwardsToRegisteredCanvas() {
        let canvas = makeCanvas()
        let bridge = StoryCanvasTimelineBridge()
        bridge.canvas = canvas

        bridge.scrub(seconds: 2.5)
        XCTAssertEqual(canvas.timelinePreviewSeconds, 2.5)

        bridge.setPlaying(true)
        XCTAssertTrue(canvas.foregroundVideosPlaybackActive)

        bridge.end()
        XCTAssertNil(canvas.timelinePreviewSeconds)
    }
}
