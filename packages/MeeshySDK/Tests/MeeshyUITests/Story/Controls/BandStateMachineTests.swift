import Testing
@testable import MeeshyUI

@Suite("BandStateMachine")
struct BandStateMachineTests {

    @Test("initial state is .hidden")
    func initialStateIsHidden() {
        let sm = BandStateMachine()
        #expect(sm.state == .hidden)
    }

    @Test("tapFAB(.media) from .hidden opens .toolPanel(.media)")
    func tapFABMediaFromHidden() {
        var sm = BandStateMachine()
        sm.tapFAB(.media)
        #expect(sm.state == .toolPanel(.media))
    }

    // MARK: - allowsCollapsibleDrawer (retract handle for ALL tools, user 2026-06-02)

    @Test("every tool panel allows the collapsible drawer (not just drawing)")
    func everyToolPanelAllowsCollapse() {
        for tool in [StoryToolMode.media, .audio, .text, .drawing, .filters, .timeline, .texture] {
            #expect(BandState.toolPanel(tool).allowsCollapsibleDrawer,
                    "tool \(tool) drawer must be collapsible")
        }
    }

    @Test("hidden and format panels are not collapsible drawers")
    func hiddenAndFormatPanelNotCollapsible() {
        #expect(BandState.hidden.allowsCollapsibleDrawer == false)
        #expect(BandState.formatPanel(.text, elementId: "x").allowsCollapsibleDrawer == false)
        #expect(BandState.formatPanel(.media, elementId: "y").allowsCollapsibleDrawer == false)
    }

    @Test("tapFAB(.filters) from .hidden opens .toolPanel(.filters)")
    func tapFABFiltersFromHidden() {
        var sm = BandStateMachine()
        sm.tapFAB(.filters)
        #expect(sm.state == .toolPanel(.filters))
    }

    @Test("tapFAB(same category) from .toolPanel closes to .hidden")
    func tapFABSameCategoryCloses() {
        var sm = BandStateMachine()
        sm.tapFAB(.media)
        sm.tapFAB(.media)
        #expect(sm.state == .hidden)
    }

    @Test("tapFAB(other category) from .toolPanel swaps")
    func tapFABOtherCategorySwaps() {
        var sm = BandStateMachine()
        sm.tapFAB(.media)
        sm.tapFAB(.filters)
        #expect(sm.state == .toolPanel(.filters))
    }

    @Test("swipeUpOnFAB(.media) from .hidden opens .toolPanel(.media)")
    func swipeUpOnFABOpens() {
        var sm = BandStateMachine()
        sm.swipeUpOnFAB(.media)
        #expect(sm.state == .toolPanel(.media))
    }

    @Test("swipeUpOnFAB is idempotent on .toolPanel(same)")
    func swipeUpOnFABIdempotent() {
        var sm = BandStateMachine()
        sm.tapFAB(.media)
        sm.swipeUpOnFAB(.media)
        #expect(sm.state == .toolPanel(.media))
    }

    @Test("swipeDownOnBand from .toolPanel closes to .hidden")
    func swipeDownFromToolPanelCloses() {
        var sm = BandStateMachine()
        sm.tapFAB(.media)
        sm.swipeDownOnBand()
        #expect(sm.state == .hidden)
    }

    @Test("swipeDownOnBand from .hidden is no-op")
    func swipeDownFromHiddenIsNoOp() {
        var sm = BandStateMachine()
        sm.swipeDownOnBand()
        #expect(sm.state == .hidden)
    }

    @Test("tapTile from .hidden opens tool panel")
    func tapTileFromHidden() {
        var sm = BandStateMachine()
        sm.tapTile(.media)
        #expect(sm.state == .toolPanel(.media))
    }

    @Test("closeFormatPanel returns to .hidden")
    func closeFormatPanelReturnsHidden() {
        var sm = BandStateMachine()
        sm.openFormatPanel(.text, id: "txt-1")
        sm.closeFormatPanel()
        #expect(sm.state == .hidden)
    }

    @Test("backFromToolPanel returns to .hidden")
    func backFromToolPanel() {
        var sm = BandStateMachine()
        sm.tapFAB(.drawing)
        sm.backFromToolPanel()
        #expect(sm.state == .hidden)
    }

    @Test("reset clears state to .hidden")
    func resetClearsToHidden() {
        var sm = BandStateMachine()
        sm.tapFAB(.drawing)
        sm.reset()
        #expect(sm.state == .hidden)
    }

    // MARK: - Timeline routes to a sheet, never to a band panel (C5)
    // ComposerToolPanelHost renders .timeline as EmptyView with panelHeight 0 —
    // reaching .toolPanel(.timeline) shows a titled band with no content. The
    // machine refuses the transition; callers open the timeline SHEET instead.

    @Test("tapFAB(.timeline) keeps the band hidden — timeline presents as a sheet")
    func tapFABTimelineKeepsBandHidden() {
        var sm = BandStateMachine()
        sm.tapFAB(.timeline)
        #expect(sm.state == .hidden)
    }

    @Test("swipeUpOnFAB(.timeline) keeps the band hidden")
    func swipeUpOnFABTimelineKeepsBandHidden() {
        var sm = BandStateMachine()
        sm.swipeUpOnFAB(.timeline)
        #expect(sm.state == .hidden)
    }

    @Test("tapTile(.timeline) keeps the band hidden")
    func tapTileTimelineKeepsBandHidden() {
        var sm = BandStateMachine()
        sm.tapTile(.timeline)
        #expect(sm.state == .hidden)
    }

    @Test("tapFAB(.timeline) while another panel is open leaves that panel untouched")
    func tapFABTimelinePreservesOpenPanel() {
        var sm = BandStateMachine()
        sm.tapFAB(.media)
        sm.tapFAB(.timeline)
        #expect(sm.state == .toolPanel(.media))
    }
}
