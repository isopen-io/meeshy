import XCTest
import SwiftUI
@testable import MeeshyUI
@testable import MeeshySDK

@MainActor
final class StoryTimelineHostTests: XCTestCase {

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
        let view = StoryTimelineHost(viewModel: makeViewModel())
        _ = view.body
    }

    func test_body_withExportAction_doesNotCrash() {
        // Le bouton export (header, trailing) n'est rendu que quand l'hôte
        // fournit onExport — les hôtes hors composer gardent le header nu.
        let view = StoryTimelineHost(viewModel: makeViewModel(), onExport: {})
        _ = view.body
    }

}
