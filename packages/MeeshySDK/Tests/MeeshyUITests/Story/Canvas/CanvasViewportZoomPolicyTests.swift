import Testing
import Foundation
@testable import MeeshyUI

@Suite("CanvasViewportZoomPolicy")
struct CanvasViewportZoomPolicyTests {

    // MARK: - settledScale : clamp

    @Test("multiplies current by gesture scale")
    func multipliesScales() {
        #expect(CanvasViewportZoomPolicy.settledScale(current: 1.0, gestureScale: 2.0) == 2.0)
    }

    @Test("clamps to maxScale")
    func clampsToMax() {
        #expect(CanvasViewportZoomPolicy.settledScale(current: 2.0, gestureScale: 3.0) == 4.0)
    }

    @Test("clamps to minScale")
    func clampsToMin() {
        #expect(CanvasViewportZoomPolicy.settledScale(current: 1.0, gestureScale: 0.3) == 0.5)
    }

    // MARK: - settledScale : snap à l'identité (état zoomé « collant », C4)

    @Test("snaps a near-identity release back to exactly 1.0 (below)")
    func snapsNearIdentityBelow() {
        #expect(CanvasViewportZoomPolicy.settledScale(current: 1.0, gestureScale: 0.95) == 1.0)
    }

    @Test("snaps a near-identity release back to exactly 1.0 (above)")
    func snapsNearIdentityAbove() {
        #expect(CanvasViewportZoomPolicy.settledScale(current: 1.0, gestureScale: 1.07) == 1.0)
    }

    @Test("does not snap outside the identity band")
    func noSnapOutsideBand() {
        #expect(CanvasViewportZoomPolicy.settledScale(current: 1.0, gestureScale: 1.2) == 1.2)
        #expect(CanvasViewportZoomPolicy.settledScale(current: 1.0, gestureScale: 0.9) == 0.9)
    }

    @Test("exact identity stays identity")
    func exactIdentity() {
        #expect(CanvasViewportZoomPolicy.settledScale(current: 2.0, gestureScale: 0.5) == 1.0)
    }

    // MARK: - doubleTapResetsViewport (sortie gestuelle du zoom)

    @Test("double-tap on empty area while zoomed resets the viewport")
    func resetsWhenZoomedOnEmptyArea() {
        #expect(CanvasViewportZoomPolicy.doubleTapResetsViewport(isViewportZoomed: true, hitItemId: nil))
    }

    @Test("double-tap while NOT zoomed never resets (videoFitMode cycle keeps its gesture)")
    func neverResetsAtIdentity() {
        #expect(!CanvasViewportZoomPolicy.doubleTapResetsViewport(isViewportZoomed: false, hitItemId: nil))
    }

    @Test("double-tap on a foreground item keeps its dedicated editor even while zoomed")
    func itemDoubleTapWinsOverReset() {
        #expect(!CanvasViewportZoomPolicy.doubleTapResetsViewport(isViewportZoomed: true, hitItemId: "sticker-1"))
    }
}
