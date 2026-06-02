import Testing
@testable import MeeshyUI

@Suite("BandLayoutState")
struct BandLayoutStateTests {

    @Test("clamp pins below-min height to min")
    func clampBelowMin() { #expect(BandLayoutState.clamp(100, cappedMax: 540) == 160) }
    @Test("clamp pins above-max height to cappedMax")
    func clampAboveMax() { #expect(BandLayoutState.clamp(900, cappedMax: 540) == 540) }
    @Test("clamp leaves an in-range height untouched")
    func clampInRange() { #expect(BandLayoutState.clamp(300, cappedMax: 540) == 300) }
    @Test("clamp honours a reduced cappedMax (canvas carded)")
    func clampReducedCap() { #expect(BandLayoutState.clamp(500, cappedMax: 360) == 360) }
    @Test("clamp floor wins when cappedMax is degenerate (< min)")
    func clampDegenerateCap() { #expect(BandLayoutState.clamp(300, cappedMax: 120) == 160) }

    @Test("cappedMax is the absolute ceiling when canvas is not carded")
    func cappedMaxFree() { #expect(BandLayoutState.cappedMax(screenHeight: 900, canvasCarded: false) == 540) }
    @Test("cappedMax shrinks to screen fraction when canvas is carded")
    func cappedMaxCarded() { #expect(BandLayoutState.cappedMax(screenHeight: 900, canvasCarded: true) == 378) }
    @Test("cappedMax never exceeds 540 on a tall screen when carded")
    func cappedMaxCardedTallScreen() { #expect(BandLayoutState.cappedMax(screenHeight: 2000, canvasCarded: true) == 540) }

    @Test("height defaults to the per-tool default before any resize")
    func defaultHeightPerTool() {
        let s = BandLayoutState()
        #expect(s.height(for: .drawing) == 280)
        #expect(s.height(for: .media) == 220)
        #expect(s.height(for: .texture) == 160)
        #expect(s.height(for: .filters) == 180)
    }
    @Test("resizing one tool does not change another tool's height")
    func perCategoryRetention() {
        var s = BandLayoutState()
        s = s.applyingResize(for: .media, to: 300, cappedMax: 540)
        #expect(s.height(for: .media) == 300)
        #expect(s.height(for: .text) == 280)
    }
    @Test("a resized height is clamped on the way in")
    func resizeIsClamped() {
        var s = BandLayoutState()
        s = s.applyingResize(for: .filters, to: 999, cappedMax: 400)
        #expect(s.height(for: .filters) == 400)
    }
    @Test("retained height survives a collapse/expand round-trip")
    func retentionAcrossCollapse() {
        var s = BandLayoutState()
        s = s.applyingResize(for: .audio, to: 330, cappedMax: 540)
        s = s.collapsing(.audio); s = s.expanding(.audio)
        #expect(s.height(for: .audio) == 330)
    }

    @Test("a fresh tool is not collapsed")
    func notCollapsedByDefault() { #expect(BandLayoutState().isCollapsed(.drawing) == false) }
    @Test("collapsing then expanding is idempotent")
    func collapseExpandIdempotent() {
        var s = BandLayoutState()
        s = s.collapsing(.text); #expect(s.isCollapsed(.text) == true)
        s = s.expanding(.text); #expect(s.isCollapsed(.text) == false)
    }
    @Test("collapsing twice stays collapsed")
    func collapseTwiceIdempotent() {
        var s = BandLayoutState()
        s = s.collapsing(.media); s = s.collapsing(.media)
        #expect(s.isCollapsed(.media) == true)
    }
    @Test("collapse is per-tool")
    func collapsePerTool() {
        var s = BandLayoutState()
        s = s.collapsing(.media)
        #expect(s.isCollapsed(.media) == true)
        #expect(s.isCollapsed(.text) == false)
    }

    @Test("collapsed tool ⇒ canvas goes full (peek)")
    func collapsedMeansCanvasFull() {
        var s = BandLayoutState()
        s = s.collapsing(.drawing)
        #expect(s.canvasIsFull(for: .drawing) == true)
    }
    @Test("expanded tool ⇒ canvas is carded")
    func expandedMeansCanvasCarded() { #expect(BandLayoutState().canvasIsFull(for: .drawing) == false) }

    @Test("timeline is not band-eligible")
    func timelineNotEligible() { #expect(BandLayoutState.isBandEligible(.timeline) == false) }
    @Test("every non-timeline tool is band-eligible")
    func nonTimelineEligible() {
        for tool in StoryToolMode.allCases where tool != .timeline {
            #expect(BandLayoutState.isBandEligible(tool) == true)
        }
    }
    @Test("timeline has no resize and never collapses to peek")
    func timelineHasNoLayout() {
        var s = BandLayoutState()
        s = s.applyingResize(for: .timeline, to: 400, cappedMax: 540)
        s = s.collapsing(.timeline)
        #expect(s.isCollapsed(.timeline) == false)
        #expect(s.canvasIsFull(for: .timeline) == false)
    }
}
