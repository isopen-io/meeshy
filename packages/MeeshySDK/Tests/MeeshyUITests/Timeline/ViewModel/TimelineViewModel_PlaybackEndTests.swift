import XCTest
@testable import MeeshyUI
@testable import MeeshySDK

/// Fin NATURELLE de lecture (moteur → `onPlaybackEnd`) : la tête de lecture
/// revient au début et `onPlaybackEnded` notifie le composer pour rendre le
/// canvas STATIQUE (capture user 2026-07-20 : le canvas restait figé au
/// dernier instant — éléments hors fenêtre masqués — au lieu de re-montrer
/// tout ce qui était prévu pour le canvas).
@MainActor
final class TimelineViewModel_PlaybackEndTests: XCTestCase {

    private func makeSUT() -> (vm: TimelineViewModel, engine: MockStoryTimelineEngine) {
        let engine = MockStoryTimelineEngine()
        let vm = TimelineViewModel(engine: engine, commandStack: CommandStack(),
                                   snapEngine: SnapEngine(toleranceSeconds: 0.06))
        vm.bootstrap(project: TimelineProjectFactory.projectWithVideoClip(),
                     mediaURLs: [:], images: [:])
        return (vm, engine)
    }

    func test_enginePlaybackEnd_stopsAndResetsPlayheadToStart() {
        let (vm, engine) = makeSUT()
        vm.scrub(to: 5)

        engine.onPlaybackEnd?()

        XCTAssertFalse(vm.isPlaying)
        XCTAssertEqual(vm.currentTime, 0, accuracy: 0.001)
    }

    func test_enginePlaybackEnd_notifiesAfterPlayheadReset() {
        let (vm, engine) = makeSUT()
        vm.scrub(to: 5)
        var timeAtEnded: Float = -1
        vm.onPlaybackEnded = { [weak vm] in timeAtEnded = vm?.currentTime ?? -1 }

        engine.onPlaybackEnd?()

        XCTAssertEqual(timeAtEnded, 0, accuracy: 0.001,
                       "La notification part APRÈS le retour à 0 — le canvas reçoit scrub(0) puis end()")
    }

    func test_manualPause_doesNotFirePlaybackEnded() {
        let (vm, engine) = makeSUT()
        var endedCount = 0
        vm.onPlaybackEnded = { endedCount += 1 }
        vm.scrub(to: 3)

        vm.togglePlayback()
        vm.togglePlayback()

        XCTAssertEqual(endedCount, 0,
                       "Une pause manuelle laisse la preview figée au playhead — seule la fin naturelle rend le canvas statique")
        XCTAssertEqual(vm.currentTime, 3, accuracy: 0.001)
        _ = engine
    }
}
