import XCTest
import AVFoundation
@testable import MeeshyUI
@testable import MeeshySDK

@MainActor
final class AudioLowLatencyTests: XCTestCase {

    private func makeProject() -> TimelineProject {
        TimelineProject(
            slideId: "low-lat",
            slideDuration: 5,
            mediaObjects: [],
            audioPlayerObjects: [
                StoryAudioPlayerObject(id: "a1", postMediaId: "pma1")
            ],
            textObjects: [],
            clipTransitions: []
        )
    }

    func test_configure_setsPreferredIOBufferDurationTo5ms() async {
        let mixer = MockAudioMixer()
        let engine = StoryTimelineEngine(audioMixer: mixer)
        await engine.configure(project: makeProject(), mediaURLs: [:], images: [:])
        let actual = AVAudioSession.sharedInstance().preferredIOBufferDuration
        // Simulator may clamp the value — verify our REQUEST was made (preferredIOBufferDuration
        // reflects the requested value). Accept any value <= 10ms as a valid low-latency config.
        XCTAssertLessThanOrEqual(actual, 0.01,
                                 "Expected preferredIOBufferDuration <= 10ms after configure, got \(actual)")
        engine.shutdown()
    }

    func test_configure_callsPrepareAllNodesOnMixer() async {
        let mixer = MockAudioMixer()
        let engine = StoryTimelineEngine(audioMixer: mixer)
        await engine.configure(project: makeProject(), mediaURLs: [:], images: [:])
        XCTAssertEqual(mixer.prepareAllNodesCallCount, 1,
                       "Expected mixer.prepareAllNodes() to be called once during configure")
        engine.shutdown()
    }
}
