import XCTest
import AVFoundation
@testable import MeeshyUI
@testable import MeeshySDK

@MainActor
final class StoryTimelineEnginePerformanceTests: XCTestCase {

    private func makeProject() -> TimelineProject {
        let media = (0..<10).map { i in
            StoryMediaObject(
                id: "v\(i)", postMediaId: "pm\(i)",
                mediaType: "image", placement: "media",
                startTime: Float(i), duration: 1.0
            )
        }
        let audios = (0..<5).map { i in
            StoryAudioPlayerObject(id: "a\(i)", postMediaId: "pma\(i)")
        }
        return TimelineProject(
            slideId: "perf",
            slideDuration: 30,
            mediaObjects: media,
            audioPlayerObjects: audios,
            textObjects: [],
            clipTransitions: []
        )
    }

    // MARK: - F1 configure() under 200ms (baseline)

    func test_configure_tenClipsFiveAudios_under200ms() {
        let project = makeProject()
        measure(metrics: [XCTClockMetric()]) {
            let mixer = MockAudioMixer()
            let engine = StoryTimelineEngine(audioMixer: mixer)
            let exp = expectation(description: "configure")
            Task { @MainActor in
                await engine.configure(project: project, mediaURLs: [:], images: [:])
                exp.fulfill()
            }
            wait(for: [exp], timeout: 1.0)
        }
    }

    // MARK: - F2 seek() under 50ms (10x sequential)

    func test_seek_under50ms() async {
        let project = makeProject()
        let mixer = MockAudioMixer()
        let engine = StoryTimelineEngine(audioMixer: mixer)
        await engine.configure(project: project, mediaURLs: [:], images: [:])

        measure(metrics: [XCTClockMetric()]) {
            for i in 0..<10 {
                engine.seek(to: Float(i) * 0.5)
            }
        }
    }

    // MARK: - F3 repeated configure stays under 250 MB (baseline)

    func test_repeatedConfigure_memoryStaysBelowBudget() {
        let project = makeProject()
        measure(metrics: [XCTMemoryMetric()]) {
            let mixer = MockAudioMixer()
            let engine = StoryTimelineEngine(audioMixer: mixer)
            let exp = expectation(description: "configure-loop")
            Task { @MainActor in
                for _ in 0..<5 {
                    await engine.configure(project: project, mediaURLs: [:], images: [:])
                }
                exp.fulfill()
            }
            wait(for: [exp], timeout: 5.0)
        }
    }
}
