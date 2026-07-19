import XCTest
import SwiftUI
@testable import MeeshyUI
@testable import MeeshySDK

@MainActor
final class ProTimelineViewTests: XCTestCase {

    private func makeViewModel(project: TimelineProject = TimelineProjectFactory.projectWithVideoClip()) -> TimelineViewModel {
        let engine = MockStoryTimelineEngine()
        let stack = CommandStack()
        let snap = SnapEngine(toleranceSeconds: 0.06)
        let vm = TimelineViewModel(engine: engine, commandStack: stack, snapEngine: snap)
        vm.bootstrap(project: project, mediaURLs: [:], images: [:])
        return vm
    }

    func test_init_doesNotCrash() {
        let view = ProTimelineView(viewModel: makeViewModel())
        _ = view.body
    }

    func test_previewWidthFraction_isThirty() {
        XCTAssertEqual(ProTimelineView.previewWidthFraction, 0.30, accuracy: 0.001)
    }

    func test_groupedTracks_returnsThreeSections() {
        let project = TimelineProjectFactory.projectWithVideoClip()
        let groups = ProTimelineView.resolveTrackGroups(project: project)
        XCTAssertEqual(groups.map { $0.section }, [.media, .son, .filters])
    }

    func test_inspectorVisible_onlyWhenSelectionExists() {
        let vm = makeViewModel()
        XCTAssertFalse(TimelineInspectorHost.shouldShowClipInspector(viewModel: vm))
        vm.selectClip(id: "clip-1")
        XCTAssertTrue(TimelineInspectorHost.shouldShowClipInspector(viewModel: vm))
    }
}
