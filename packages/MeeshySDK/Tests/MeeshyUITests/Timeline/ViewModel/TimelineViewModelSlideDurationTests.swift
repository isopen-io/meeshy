import XCTest
@testable import MeeshyUI
@testable import MeeshySDK

/// DurationHandle — le pin direct de la durée de slide (Option A : la
/// timeline peut ÉTENDRE au-delà du contenu ou ROGNER en deçà ; le commit
/// écrit `effects.timelineDuration`).
@MainActor
final class TimelineViewModelSlideDurationTests: XCTestCase {

    private func makeSUT(slideDuration: Float = 6) async -> TimelineViewModel {
        let vm = TimelineViewModel(engine: MockStoryTimelineEngine(),
                                   commandStack: CommandStack(),
                                   snapEngine: SnapEngine(toleranceSeconds: 0.1))
        vm.bootstrap(project: TimelineProject(slideId: "s", slideDuration: slideDuration,
                                              mediaObjects: [], audioPlayerObjects: [],
                                              textObjects: [], clipTransitions: []),
                     mediaURLs: [:], images: [:])
        await vm.awaitConfigured()
        return vm
    }

    func test_setSlideDuration_extendsBeyondContent() async {
        let vm = await makeSUT(slideDuration: 6)
        vm.setSlideDuration(12)
        XCTAssertEqual(vm.project.slideDuration, 12, accuracy: 0.001)
    }

    func test_setSlideDuration_cropsAndClampsPlayheadInside() async {
        let vm = await makeSUT(slideDuration: 10)
        vm.scrub(to: 8)
        vm.setSlideDuration(4)
        XCTAssertEqual(vm.project.slideDuration, 4, accuracy: 0.001)
        XCTAssertLessThanOrEqual(vm.currentTime, 4,
                                 "Rogner la slide sous le playhead doit ramener le playhead dans la fenêtre")
    }

    func test_setSlideDuration_clampsToSaneRange() async {
        let vm = await makeSUT()
        vm.setSlideDuration(0.2)
        XCTAssertEqual(vm.project.slideDuration, 1, accuracy: 0.001, "Plancher 1 s")
        vm.setSlideDuration(9999)
        XCTAssertEqual(vm.project.slideDuration, 600, accuracy: 0.001, "Plafond 600 s")
    }
}
