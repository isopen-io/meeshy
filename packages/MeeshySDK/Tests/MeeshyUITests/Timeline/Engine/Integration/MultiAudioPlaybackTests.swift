import XCTest
@testable import MeeshyUI
@testable import MeeshySDK

/// Task 65 — Multi-audio parallel playback (music + voiceover).
/// Build a project with two audio clips and verify the engine receives both
/// when configured via `MockStoryTimelineEngine`.
@MainActor
final class MultiAudioPlaybackTests: XCTestCase {

    private func makeProject() -> TimelineProject {
        var music = StoryAudioPlayerObject(id: "music-1", postMediaId: "pm-music",
                                           waveformSamples: [], startTime: 0, duration: 10)
        music.isBackground = true
        var voiceover = StoryAudioPlayerObject(id: "vo-1", postMediaId: "pm-vo",
                                               waveformSamples: [], startTime: 0, duration: 8)
        voiceover.isBackground = false
        return TimelineProject(
            slideId: "slide-1",
            slideDuration: 12,
            mediaObjects: [],
            audioPlayerObjects: [music, voiceover],
            textObjects: [],
            clipTransitions: []
        )
    }

    func test_multiAudio_twoAudioClips_bothForwardedToEngine() async {
        let engine = MockStoryTimelineEngine()
        let sut = TimelineViewModel(
            engine: engine,
            commandStack: CommandStack(),
            snapEngine: SnapEngine(toleranceSeconds: 0.1)
        )
        let project = makeProject()
        sut.bootstrap(project: project, mediaURLs: [:], images: [:])
        await sut.awaitConfigured()

        // Engine must have been configured with the project containing both audio clips
        XCTAssertEqual(engine.configureCallCount, 1,
                       "Engine must be configured exactly once on bootstrap")
        let configured = engine.lastConfiguredProject
        XCTAssertNotNil(configured)
        XCTAssertEqual(configured?.audioPlayerObjects.count, 2,
                       "Engine must receive project with both audio tracks (music + voiceover)")
    }

    func test_multiAudio_backgroundVsForeground_distinguishedInProject() async {
        let engine = MockStoryTimelineEngine()
        let sut = TimelineViewModel(
            engine: engine,
            commandStack: CommandStack(),
            snapEngine: SnapEngine(toleranceSeconds: 0.1)
        )
        let project = makeProject()
        sut.bootstrap(project: project, mediaURLs: [:], images: [:])
        await sut.awaitConfigured()

        let audioObjects = sut.project.audioPlayerObjects
        let backgroundTracks = audioObjects.filter { $0.isBackground == true }
        let foregroundTracks = audioObjects.filter { $0.isBackground != true }

        XCTAssertEqual(backgroundTracks.count, 1, "Must have exactly one background track (music)")
        XCTAssertEqual(foregroundTracks.count, 1, "Must have exactly one foreground track (voiceover)")
    }
}
