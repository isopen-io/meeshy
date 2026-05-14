import Testing
@testable import MeeshyUI

@Suite("BandStateMachine")
struct BandStateMachineTests {

    @Test("initial state is .hidden")
    func initialStateIsHidden() {
        let sm = BandStateMachine()
        #expect(sm.state == .hidden)
    }

    @Test("tapFAB(.contenu) from .hidden opens .tiles(.contenu)")
    func tapFABContenuFromHidden() {
        var sm = BandStateMachine()
        sm.tapFAB(.contenu)
        #expect(sm.state == .tiles(.contenu))
    }

    @Test("tapFAB(.effets) from .hidden opens .tiles(.effets)")
    func tapFABEffetsFromHidden() {
        var sm = BandStateMachine()
        sm.tapFAB(.effets)
        #expect(sm.state == .tiles(.effets))
    }

    @Test("tapFAB(same category) from .tiles closes to .hidden")
    func tapFABSameCategoryCloses() {
        var sm = BandStateMachine()
        sm.tapFAB(.contenu)
        sm.tapFAB(.contenu)
        #expect(sm.state == .hidden)
    }

    @Test("tapFAB(other category) from .tiles swaps")
    func tapFABOtherCategorySwaps() {
        var sm = BandStateMachine()
        sm.tapFAB(.contenu)
        sm.tapFAB(.effets)
        #expect(sm.state == .tiles(.effets))
    }

    @Test("tapFAB(other category) from .toolPanel swaps to .tiles(other)")
    func tapFABFromToolPanelSwapsCategory() {
        var sm = BandStateMachine()
        sm.tapFAB(.contenu)
        sm.tapTile(.media)
        sm.tapFAB(.effets)
        #expect(sm.state == .tiles(.effets))
    }

    @Test("swipeUpOnFAB(.contenu) from .hidden opens .tiles(.contenu)")
    func swipeUpOnFABOpens() {
        var sm = BandStateMachine()
        sm.swipeUpOnFAB(.contenu)
        #expect(sm.state == .tiles(.contenu))
    }

    @Test("swipeUpOnFAB is idempotent on .tiles(same)")
    func swipeUpOnFABIdempotent() {
        var sm = BandStateMachine()
        sm.tapFAB(.contenu)
        sm.swipeUpOnFAB(.contenu)
        #expect(sm.state == .tiles(.contenu))
    }

    @Test("swipeUpOnFAB(.effets) from .tiles(.contenu) swaps")
    func swipeUpOnFABSwaps() {
        var sm = BandStateMachine()
        sm.tapFAB(.contenu)
        sm.swipeUpOnFAB(.effets)
        #expect(sm.state == .tiles(.effets))
    }

    @Test("swipeDownOnBand from .tiles closes to .hidden")
    func swipeDownFromTilesCloses() {
        var sm = BandStateMachine()
        sm.tapFAB(.contenu)
        sm.swipeDownOnBand()
        #expect(sm.state == .hidden)
    }

    @Test("swipeDownOnBand from .toolPanel returns to .tiles(category)")
    func swipeDownFromToolPanelReturnsToTiles() {
        var sm = BandStateMachine()
        sm.tapFAB(.contenu)
        sm.tapTile(.media)
        sm.swipeDownOnBand()
        #expect(sm.state == .tiles(.contenu))
    }

    @Test("swipeDownOnBand from .hidden is no-op")
    func swipeDownFromHiddenIsNoOp() {
        var sm = BandStateMachine()
        sm.swipeDownOnBand()
        #expect(sm.state == .hidden)
    }

    @Test("swipeHorizontalOnBand swaps category in .tiles(.contenu)")
    func swipeHorizontalSwapsTiles() {
        var sm = BandStateMachine()
        sm.tapFAB(.contenu)
        sm.swipeHorizontalOnBand()
        #expect(sm.state == .tiles(.effets))
    }

    @Test("swipeHorizontalOnBand in .toolPanel is no-op (slider collision)")
    func swipeHorizontalInToolPanelIsNoOp() {
        var sm = BandStateMachine()
        sm.tapFAB(.contenu)
        sm.tapTile(.media)
        let before = sm.state
        sm.swipeHorizontalOnBand()
        #expect(sm.state == before)
    }

    @Test("swipeHorizontalOnBand in .hidden is no-op")
    func swipeHorizontalInHiddenIsNoOp() {
        var sm = BandStateMachine()
        sm.swipeHorizontalOnBand()
        #expect(sm.state == .hidden)
    }

    @Test("swipeHorizontalOnBand in .formatPanel is no-op")
    func swipeHorizontalInFormatPanelIsNoOp() {
        var sm = BandStateMachine()
        sm.openFormatPanel(.text, id: "txt-1")
        let before = sm.state
        sm.swipeHorizontalOnBand()
        #expect(sm.state == before)
    }

    @Test("tapTile(.media) from .tiles(.contenu) opens .toolPanel(.media)")
    func tapTileMediaFromTilesContenu() {
        var sm = BandStateMachine()
        sm.tapFAB(.contenu)
        sm.tapTile(.media)
        #expect(sm.state == .toolPanel(.media))
    }

    @Test("tapTile(.filters) from .tiles(.effets) opens .toolPanel(.filters)")
    func tapTileFiltersFromTilesEffets() {
        var sm = BandStateMachine()
        sm.tapFAB(.effets)
        sm.tapTile(.filters)
        #expect(sm.state == .toolPanel(.filters))
    }

    @Test("tapTile from .hidden opens tool panel (defensive)")
    func tapTileFromHidden() {
        var sm = BandStateMachine()
        sm.tapTile(.media)
        #expect(sm.state == .toolPanel(.media))
    }

    @Test("closeFormatPanel returns to .tiles(lastCategory) if any")
    func closeFormatPanelReturnsToLastCategory() {
        var sm = BandStateMachine()
        sm.tapFAB(.effets)
        sm.openFormatPanel(.media, id: "img-1")
        sm.closeFormatPanel()
        #expect(sm.state == .tiles(.effets))
    }

    @Test("closeFormatPanel from formatPanel with no prior category returns to .hidden")
    func closeFormatPanelNoPriorCategoryReturnsHidden() {
        var sm = BandStateMachine()
        sm.openFormatPanel(.text, id: "txt-1")
        sm.closeFormatPanel()
        #expect(sm.state == .hidden)
    }

    @Test("backFromToolPanel returns to .tiles(tool.category)")
    func backFromToolPanel() {
        var sm = BandStateMachine()
        sm.tapFAB(.contenu)
        sm.tapTile(.drawing)
        sm.backFromToolPanel()
        #expect(sm.state == .tiles(.contenu))
    }

    @Test("backFromToolPanel from non-toolPanel state is no-op")
    func backFromToolPanelOutsideToolPanelIsNoOp() {
        var sm = BandStateMachine()
        sm.tapFAB(.contenu)
        let before = sm.state
        sm.backFromToolPanel()
        #expect(sm.state == before)
    }

    @Test("reset clears state to .hidden")
    func resetClearsToHidden() {
        var sm = BandStateMachine()
        sm.tapFAB(.contenu)
        sm.tapTile(.drawing)
        sm.reset()
        #expect(sm.state == .hidden)
    }

    @Test("reset clears lastCategoryBeforeFormat")
    func resetClearsLastCategory() {
        var sm = BandStateMachine()
        sm.tapFAB(.contenu)
        sm.openFormatPanel(.text, id: "txt-1")
        sm.reset()
        // Open formatPanel again from .hidden — should NOT restore previous category
        sm.openFormatPanel(.text, id: "txt-2")
        sm.closeFormatPanel()
        #expect(sm.state == .hidden)
    }
}
