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

    // MARK: - Timeline is a normal band tool (2026-07-14)
    // Presented inline via ComposerControlsLayer.resolveEffectiveBandState's
    // override, exactly like drawing mode. The state machine itself no
    // longer special-cases it — see ComposerControlsLayerEffectiveBandStateTests.

    @Test("tapFAB(.timeline) from .hidden opens .toolPanel(.timeline)")
    func tapFABTimelineOpensToolPanel() {
        var sm = BandStateMachine()
        sm.tapFAB(.timeline)
        #expect(sm.state == .toolPanel(.timeline))
    }

    @Test("swipeUpOnFAB(.timeline) opens .toolPanel(.timeline)")
    func swipeUpOnFABTimelineOpensToolPanel() {
        var sm = BandStateMachine()
        sm.swipeUpOnFAB(.timeline)
        #expect(sm.state == .toolPanel(.timeline))
    }

    @Test("tapTile(.timeline) opens .toolPanel(.timeline)")
    func tapTileTimelineOpensToolPanel() {
        var sm = BandStateMachine()
        sm.tapTile(.timeline)
        #expect(sm.state == .toolPanel(.timeline))
    }

    @Test("tapFAB(.timeline) while another panel is open swaps to it, like any other tool")
    func tapFABTimelineSwapsOpenPanel() {
        var sm = BandStateMachine()
        sm.tapFAB(.media)
        sm.tapFAB(.timeline)
        #expect(sm.state == .toolPanel(.timeline))
    }

    /// The switch-chip row (`ComposerToolPanelHost`) routes every tap through
    /// `tapTile`, not `tapFAB` — this is the exact path the composer uses when
    /// the user is already inside another tool panel and taps the Timeline
    /// chip to switch directly. The machine itself has been generic here
    /// since `tapTile` no longer special-cases `.timeline` (see the file
    /// header note above) — this test locks that contract in explicitly,
    /// mirroring `tapFABTimelineSwapsOpenPanel` for the tile-tap entry point.
    @Test("tapTile(.timeline) while another panel is open swaps to it, like any other tool")
    func tapTileTimelineSwapsOpenPanel() {
        var sm = BandStateMachine()
        sm.tapTile(.text)
        sm.tapTile(.timeline)
        #expect(sm.state == .toolPanel(.timeline))
    }
}
