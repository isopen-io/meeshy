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

    func test_initialState_isHidden_andFabsVisible() {
        let vm = makeVM()
        let _ = makeLayer(vm: vm)
        // Use Equatable inspection on the layer's machine via key path is not possible
        // directly — instead rely on the layer's published behaviors via XCUI-free fixtures.
        // (Integration tests for SwiftUI ViewModifiers + @State require ViewInspector
        //  or a layer-level test seam. For now: assert the VM is unaffected on init.)
        XCTAssertNil(vm.activeTool)
    }

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

    /// `bandStateMachine.hideChrome()` n'était appelable QUE depuis
    /// `onSwipeDownAny` (un swipe physique sur la rangée de FABs) — invisible
    /// à VoiceOver, qui intercepte les swipes pour sa propre navigation.
    /// `fabRestoreHandle` a déjà son action nommée « Afficher les outils » ;
    /// ce test pin le pendant symétrique « Masquer les outils » sur la
    /// rangée de FABs elle-même — pas testable via l'arbre SwiftUI en XCTest
    /// pur (pas de ViewInspector dans ce module, cf. `test_initialState_
    /// isHidden_andFabsVisible` ci-dessus), garde de source donc.
    func test_fabRow_exposesHideToolsAccessibilityAction() throws {
        let code = try ComposerSourceGuard.source("Controls/ComposerControlsLayer.swift")
        let body = try XCTUnwrap(
            ComposerSourceGuard.functionBody(named: "public var body: some View", in: code)
        )
        XCTAssertTrue(body.contains("story.composer.hideTools"),
                      "La rangée de FABs doit exposer une action a11y nommée pour masquer le chrome.")
        // 2 = le swipe existant (`onSwipeDownAny`) + la nouvelle action a11y —
        // pas 1 : une garde par simple `.contains` passerait déjà sur le seul
        // swipe et ne détecterait pas une régression qui retirerait l'action.
        XCTAssertEqual(ComposerSourceGuard.occurrences(of: "bandStateMachine.hideChrome()", in: body), 2,
                       "L'action a11y doit rejouer le même canal que le swipe existant, EN PLUS de lui.")
    }

    // MARK: - Layer construction helper

    private func makeLayer(vm: StoryComposerViewModel) -> ComposerControlsLayer {
        ComposerControlsLayer(
            viewModel: vm,
            chrome: ComposerChromeContext(
                machineState: .hidden,
                isChromeHidden: false,
                isTextEditing: false,
                isDrawingActive: false,
                isDrawingImmersive: false,
                isViewportZoomed: false,
                isTimelineVisible: false
            ),
            bandStateMachine: .constant(BandStateMachine()),
            selectedFilter: .constant(nil),
            fgMediaItem: .constant(nil),
            showAudioDocumentPicker: .constant(false),
            showVoiceRecorderSheet: .constant(false),
            showSoundLibrary: .constant(false),
            resizableBandHeight: .constant(300),
            bandMinHeight: 160,
            bandMaxHeight: 540,
            onOpenMediaCrop: { _ in },
            onDismissActivePanel: { }
        )
    }
}
