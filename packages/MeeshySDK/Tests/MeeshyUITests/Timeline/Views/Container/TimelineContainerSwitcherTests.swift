import XCTest
import SwiftUI
@testable import MeeshyUI
@testable import MeeshySDK

@MainActor
final class TimelineContainerSwitcherTests: XCTestCase {

    private func makeViewModel() -> TimelineViewModel {
        let engine = MockStoryTimelineEngine()
        let stack = CommandStack()
        let snap = SnapEngine(toleranceSeconds: 0.06)
        let vm = TimelineViewModel(engine: engine, commandStack: stack, snapEngine: snap)
        vm.bootstrap(project: TimelineProjectFactory.projectWithVideoClip(),
                     mediaURLs: [:], images: [:])
        return vm
    }

    func test_init_doesNotCrash() {
        let view = TimelineContainerSwitcher(viewModel: makeViewModel())
        _ = view.body
    }

    func test_body_withExportAction_doesNotCrash() {
        // Le bouton export (header, trailing) n'est rendu que quand l'hôte
        // fournit onExport — les hôtes hors composer gardent le header nu.
        let view = TimelineContainerSwitcher(viewModel: makeViewModel(), onExport: {})
        _ = view.body
    }

    func test_resolveMode_compactWidth_returnsQuick() {
        XCTAssertEqual(
            TimelineContainerSwitcher.resolveAutoMode(horizontalSizeClass: .compact, currentMode: .pro),
            .quick
        )
    }

    func test_resolveMode_regularWidth_returnsPro() {
        XCTAssertEqual(
            TimelineContainerSwitcher.resolveAutoMode(horizontalSizeClass: .regular, currentMode: .quick),
            .pro
        )
    }

    func test_resolveMode_unknownSizeClass_keepsCurrentMode() {
        XCTAssertEqual(
            TimelineContainerSwitcher.resolveAutoMode(horizontalSizeClass: nil, currentMode: .pro),
            .pro
        )
    }

    func test_modeSwitch_preservesPlayheadAndZoomAndSelection() async {
        let vm = makeViewModel()
        await vm.awaitConfigured()
        vm.selectClip(id: "clip-1")
        vm.scrub(to: 1.5)
        vm.zoomScale = 1.5
        vm.setMode(.pro)
        XCTAssertEqual(vm.selection.selectedClipId, "clip-1")
        XCTAssertEqual(vm.currentTime, 1.5, accuracy: 0.001)
        XCTAssertEqual(vm.zoomScale, 1.5, accuracy: 0.001)
    }
}
