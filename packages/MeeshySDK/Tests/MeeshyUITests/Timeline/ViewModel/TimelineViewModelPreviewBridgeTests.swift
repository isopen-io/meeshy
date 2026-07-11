import XCTest
@testable import MeeshyUI
@testable import MeeshySDK

/// Lot B — living preview bridge. The composer canvas behind the timeline
/// sheet is the preview monitor: it must follow every playhead move (scrub
/// AND engine tick) and every play/pause flip. `TimelineViewModel` surfaces
/// both as plain closures so the composer can drive the canvas at UIKit
/// level without a 60 Hz SwiftUI body re-evaluation of the whole composer.
@MainActor
final class TimelineViewModelPreviewBridgeTests: XCTestCase {

    private func makeSUT() -> (sut: TimelineViewModel, engine: MockStoryTimelineEngine) {
        let engine = MockStoryTimelineEngine()
        let sut = TimelineViewModel(
            engine: engine,
            commandStack: CommandStack(),
            snapEngine: SnapEngine(toleranceSeconds: 0.1)
        )
        let project = TimelineProjectFactory.projectWithVideoClip(startTime: 0, duration: 10)
        sut.bootstrap(project: project, mediaURLs: [:], images: [:])
        return (sut, engine)
    }

    func test_onPlayheadChanged_firesOnScrub_withScrubbedTime() async {
        let (sut, _) = makeSUT()
        await sut.awaitConfigured()
        var received: [Float] = []
        sut.onPlayheadChanged = { received.append($0) }

        sut.scrub(to: 2.5)

        XCTAssertEqual(received, [2.5],
                       "Scrubbing must notify the preview bridge with the clamped playhead time")
    }

    func test_onPlayheadChanged_firesOnEngineTick() async {
        let (sut, engine) = makeSUT()
        await sut.awaitConfigured()
        var received: [Float] = []
        sut.onPlayheadChanged = { received.append($0) }

        engine.onTimeUpdate?(1.25)

        XCTAssertEqual(received, [1.25],
                       "Engine playback ticks must reach the preview bridge — the canvas follows live playback")
    }

    func test_onPlaybackStateChanged_firesOnToggle() async {
        let (sut, _) = makeSUT()
        await sut.awaitConfigured()
        var states: [Bool] = []
        sut.onPlaybackStateChanged = { states.append($0) }

        sut.togglePlayback()
        sut.togglePlayback()

        XCTAssertEqual(states, [true, false],
                       "Play then pause must forward both state flips to the preview bridge")
    }

    func test_onPlaybackStateChanged_firesOnPlaybackEnd() async {
        let (sut, engine) = makeSUT()
        await sut.awaitConfigured()
        sut.togglePlayback()
        var states: [Bool] = []
        sut.onPlaybackStateChanged = { states.append($0) }

        engine.onPlaybackEnd?()

        XCTAssertEqual(states, [false],
                       "Reaching the end of the slide must flip the preview back to paused")
    }
}
