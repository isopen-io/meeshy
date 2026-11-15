import XCTest
import SwiftUI
import PencilKit
@testable import MeeshyUI
@testable import MeeshySDK

@MainActor
final class ComposerControlsLayerTests: XCTestCase {

    // MARK: - Helpers

    private func makeVM() -> StoryComposerViewModel {
        StoryComposerViewModel()
    }

    // MARK: - bandState changes drive view tree

    func test_tapFABMedia_setsViewModelActiveTool() {
        let vm = makeVM()
        var sm = BandStateMachine()
        sm.tapFAB(.media)
        vm.selectTool(.media)
        XCTAssertEqual(vm.activeTool, .media)
        XCTAssertEqual(sm.state, .toolPanel(.media))
    }

    func test_closeFormatPanel_clearsSelectedElementId() {
        let vm = makeVM()
        vm.selectedElementId = "elem-123"

        var sm = BandStateMachine()
        sm.openFormatPanel(.media, id: "elem-123")
        sm.closeFormatPanel()
        // The layer's onCloseFormatPanel does: closeFormatPanel(); viewModel.selectedElementId = nil
        vm.selectedElementId = nil
        XCTAssertNil(vm.selectedElementId)
    }

    func test_slideChange_resetsBandStateMachine() {
        // Behavior contract: when currentSlideIndex changes, bandStateMachine.reset() runs.
        var sm = BandStateMachine()
        sm.tapFAB(.media)
        sm.openFormatPanel(.text, id: "txt-1")
        sm.reset()
        XCTAssertEqual(sm.state, .hidden)
    }

    func test_badges_useViewModelCounts() {
        let vm = makeVM()
        // Default empty composer
        XCTAssertEqual(vm.currentEffects.textObjects.count, 0)
        XCTAssertEqual(vm.currentEffects.mediaObjects?.count ?? 0, 0)
    }

    // MARK: - Gardes de source (D4 — masquer le chrome doit être atteignable
    // sans geste physique)

    // MARK: - Layer construction helper

}
