import XCTest
@testable import MeeshyUI
@testable import MeeshySDK

/// Task 55 — Pinch zoom: verify `zoomScale` mutation on the ViewModel.
/// The ViewModel exposes `zoomScale` as a `@Published`/`@Observable` property.
/// We drive it directly (as the View's pinch gesture handler would) and assert state.
@MainActor
final class PinchZoomTests: XCTestCase {

    private func makeSUT() -> TimelineViewModel {
        let engine = MockStoryTimelineEngine()
        let sut = TimelineViewModel(
            engine: engine,
            commandStack: CommandStack(),
            snapEngine: SnapEngine(toleranceSeconds: 0.1)
        )
        sut.bootstrap(project: TimelineProjectFactory.emptyProject(), mediaURLs: [:], images: [:])
        return sut
    }

    func test_zoomScale_defaultsToOne() {
        let sut = makeSUT()
        XCTAssertEqual(sut.zoomScale, 1.0, accuracy: 0.001)
    }

    func test_zoomScale_mutation_updatesGeometry() {
        let sut = makeSUT()

        // Simulate pinch-out (zoom in)
        sut.zoomScale = 2.0
        let geometry = TimelineGeometry(zoomScale: sut.zoomScale)
        XCTAssertEqual(geometry.pixelsPerSecond, 100.0, accuracy: 0.001,
                       "At 2x zoom, pps must be 2 * basePixelsPerSecond (50) = 100")

        // Simulate pinch-in (zoom out)
        sut.zoomScale = 0.5
        let zoomedOut = TimelineGeometry(zoomScale: sut.zoomScale)
        XCTAssertEqual(zoomedOut.pixelsPerSecond, 25.0, accuracy: 0.001,
                       "At 0.5x zoom, pps must be 0.5 * 50 = 25")
    }
}
