import Testing
@testable import MeeshyUI

@Suite("ComposerChromePolicy — header et FABs sous les MÊMES conditions (C-DIR2)")
struct ComposerChromePolicyTests {

    private func visible(
        fabsVisible: Bool = true,
        bandHidden: Bool = true,
        isTextEditing: Bool = false,
        isDrawingActive: Bool = false,
        isViewportZoomed: Bool = false,
        isTimelineVisible: Bool = false
    ) -> Bool {
        ComposerChromePolicy.fullChromeVisible(
            fabsVisible: fabsVisible,
            bandHidden: bandHidden,
            isTextEditing: isTextEditing,
            isDrawingActive: isDrawingActive,
            isViewportZoomed: isViewportZoomed,
            isTimelineVisible: isTimelineVisible
        )
    }

    @Test("canvas plein écran au repos → chrome plein visible")
    func idleFullCanvasShowsChrome() {
        #expect(visible())
    }

    @Test("band ouvert → chrome caché (l'outil a l'écran)")
    func openBandHidesChrome() {
        #expect(!visible(bandHidden: false))
    }

    @Test("édition de texte → chrome caché")
    func textEditingHidesChrome() {
        #expect(!visible(isTextEditing: true))
    }

    @Test("mode dessin → chrome caché")
    func drawingHidesChrome() {
        #expect(!visible(isDrawingActive: true))
    }

    @Test("zoom viewport → chrome caché (manipulation libre)")
    func viewportZoomHidesChrome() {
        #expect(!visible(isViewportZoomed: true))
    }

    @Test("FABs masqués par l'utilisateur (swipe-down) → chrome caché")
    func userHiddenFabsHideChrome() {
        #expect(!visible(fabsVisible: false))
    }

    @Test("timeline visible → chrome caché (header + historyColumn ne doivent pas flotter sur la sheet)")
    func timelineVisibleHidesChrome() {
        #expect(!visible(isTimelineVisible: true))
    }
}
