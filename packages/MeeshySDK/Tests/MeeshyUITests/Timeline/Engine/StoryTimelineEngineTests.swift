import XCTest
import AVFoundation
@testable import MeeshyUI
@testable import MeeshySDK

@MainActor
final class StoryTimelineEngineTests: XCTestCase {

    private func makeProject(
        slideId: String = "slide-1",
        slideDuration: Float = 5,
        audios: [StoryAudioPlayerObject] = [],
        media: [StoryMediaObject] = []
    ) -> TimelineProject {
        TimelineProject(
            slideId: slideId,
            slideDuration: slideDuration,
            mediaObjects: media,
            audioPlayerObjects: audios,
            textObjects: [],
            clipTransitions: []
        )
    }

    // MARK: - D1 init

    func test_init_defaultMode_isPreview() {
        let engine = StoryTimelineEngine()
        XCTAssertEqual(engine.mode, .preview)
    }

    func test_init_initialState_isIdle() {
        let engine = StoryTimelineEngine()
        XCTAssertEqual(engine.currentTime, 0)
        XCTAssertFalse(engine.isPlaying)
    }

    // MARK: - D2 configure

    func test_configure_emptyProject_setsCurrentProject() async {
        let mixer = MockAudioMixer()
        let engine = StoryTimelineEngine(audioMixer: mixer)
        let project = makeProject()
        await engine.configure(project: project, mediaURLs: [:], images: [:])
        XCTAssertNotNil(engine.currentProjectSnapshot)
        XCTAssertEqual(engine.currentProjectSnapshot?.slideId, "slide-1")
    }

    func test_configure_callsAudioMixerConfigureOnce() async {
        let mixer = MockAudioMixer()
        let engine = StoryTimelineEngine(audioMixer: mixer)
        let audio = StoryAudioPlayerObject(id: "a1", postMediaId: "pma1")
        let project = makeProject(audios: [audio])
        await engine.configure(project: project, mediaURLs: [:], images: [:])
        XCTAssertEqual(mixer.configureCallCount, 1)
        XCTAssertEqual(mixer.lastConfiguredAudioCount, 1)
    }

    func test_configure_replacesPreviousProject() async {
        let mixer = MockAudioMixer()
        let engine = StoryTimelineEngine(audioMixer: mixer)
        await engine.configure(project: makeProject(slideId: "s1"), mediaURLs: [:], images: [:])
        await engine.configure(project: makeProject(slideId: "s2"), mediaURLs: [:], images: [:])
        XCTAssertEqual(engine.currentProjectSnapshot?.slideId, "s2")
        XCTAssertEqual(mixer.configureCallCount, 2)
    }

    // MARK: - D3 transport

    func test_play_setsIsPlayingTrue_andCallsMixerPlay() async {
        let mixer = MockAudioMixer()
        let engine = StoryTimelineEngine(audioMixer: mixer)
        await engine.configure(project: makeProject(), mediaURLs: [:], images: [:])
        engine.play()
        XCTAssertTrue(engine.isPlaying)
        XCTAssertEqual(mixer.playCallCount, 1)
    }

    func test_pause_setsIsPlayingFalse_andCallsMixerPause() async {
        let mixer = MockAudioMixer()
        let engine = StoryTimelineEngine(audioMixer: mixer)
        await engine.configure(project: makeProject(), mediaURLs: [:], images: [:])
        engine.play()
        engine.pause()
        XCTAssertFalse(engine.isPlaying)
        XCTAssertEqual(mixer.pauseCallCount, 1)
    }

    func test_toggle_alternatesPlayState() async {
        let mixer = MockAudioMixer()
        let engine = StoryTimelineEngine(audioMixer: mixer)
        await engine.configure(project: makeProject(), mediaURLs: [:], images: [:])
        engine.toggle()
        XCTAssertTrue(engine.isPlaying)
        engine.toggle()
        XCTAssertFalse(engine.isPlaying)
    }

    func test_play_withoutConfigure_doesNothing() {
        let mixer = MockAudioMixer()
        let engine = StoryTimelineEngine(audioMixer: mixer)
        engine.play()
        XCTAssertFalse(engine.isPlaying)
        XCTAssertEqual(mixer.playCallCount, 0)
    }

    // MARK: - D4 seek

    func test_seek_callsMixerSeekWithSameTime() async {
        let mixer = MockAudioMixer()
        let engine = StoryTimelineEngine(audioMixer: mixer)
        await engine.configure(project: makeProject(slideDuration: 10), mediaURLs: [:], images: [:])
        engine.seek(to: 4.5)
        XCTAssertEqual(mixer.seekCallCount, 1)
        XCTAssertEqual(mixer.lastSeekTime, 4.5, accuracy: 0.001)
    }

    func test_seek_clampsAboveSlideDuration() async {
        let mixer = MockAudioMixer()
        let engine = StoryTimelineEngine(audioMixer: mixer)
        await engine.configure(project: makeProject(slideDuration: 10), mediaURLs: [:], images: [:])
        engine.seek(to: 99)
        XCTAssertEqual(mixer.lastSeekTime, 10, accuracy: 0.001)
    }

    func test_seek_clampsNegativeToZero() async {
        let mixer = MockAudioMixer()
        let engine = StoryTimelineEngine(audioMixer: mixer)
        await engine.configure(project: makeProject(slideDuration: 10), mediaURLs: [:], images: [:])
        engine.seek(to: -3)
        XCTAssertEqual(mixer.lastSeekTime, 0, accuracy: 0.001)
    }

    func test_seek_emitsTimeUpdateCallback() async {
        let mixer = MockAudioMixer()
        let engine = StoryTimelineEngine(audioMixer: mixer)
        await engine.configure(project: makeProject(slideDuration: 10), mediaURLs: [:], images: [:])
        var captured: Float?
        engine.onTimeUpdate = { captured = $0 }
        engine.seek(to: 2.0)
        XCTAssertEqual(captured ?? 0, 2.0, accuracy: 0.001)
    }

    // MARK: - D5 stop

    func test_stop_resetsCurrentTimeToZero() async {
        let mixer = MockAudioMixer()
        let engine = StoryTimelineEngine(audioMixer: mixer)
        await engine.configure(project: makeProject(slideDuration: 10), mediaURLs: [:], images: [:])
        engine.seek(to: 5)
        engine.stop()
        XCTAssertEqual(engine.currentTime, 0)
        XCTAssertFalse(engine.isPlaying)
    }

    func test_stop_callsMixerPause_andSeeksToZero() async {
        let mixer = MockAudioMixer()
        let engine = StoryTimelineEngine(audioMixer: mixer)
        await engine.configure(project: makeProject(), mediaURLs: [:], images: [:])
        engine.play()
        engine.stop()
        XCTAssertGreaterThanOrEqual(mixer.pauseCallCount, 1)
        XCTAssertEqual(mixer.lastSeekTime, 0)
    }

    // MARK: - D6 mode switch

    func test_setMode_editing_pausesPlayback() async {
        let mixer = MockAudioMixer()
        let engine = StoryTimelineEngine(audioMixer: mixer)
        await engine.configure(project: makeProject(), mediaURLs: [:], images: [:])
        engine.play()
        engine.setMode(.editing)
        XCTAssertEqual(engine.mode, .editing)
        XCTAssertFalse(engine.isPlaying)
    }

    func test_setMode_preview_doesNotAlterPlaybackIfAlreadyPaused() async {
        let mixer = MockAudioMixer()
        let engine = StoryTimelineEngine(audioMixer: mixer)
        await engine.configure(project: makeProject(), mediaURLs: [:], images: [:])
        engine.setMode(.preview)
        XCTAssertEqual(engine.mode, .preview)
        XCTAssertFalse(engine.isPlaying)
    }

    // MARK: - D7 export stub

    func test_export_throwsNotImplemented() async {
        let engine = StoryTimelineEngine()
        do {
            try await engine.export(to: URL(fileURLWithPath: "/tmp/out.mp4"), preset: .hd1080)
            XCTFail("Expected throw")
        } catch let error as StoryTimelineExportError {
            XCTAssertEqual(error, .notImplemented)
        } catch {
            XCTFail("Unexpected error: \(error)")
        }
    }

    // MARK: - D8 retry + onError

    func test_configure_withMissingVideoURL_emitsAssetLoadFailedError() async {
        let mixer = MockAudioMixer()
        let engine = StoryTimelineEngine(audioMixer: mixer)
        var captured: [StoryTimelineEngineError] = []
        engine.onError = { err in captured.append(err) }
        let media = StoryMediaObject(
            id: "v1", postMediaId: "pm1",
            mediaType: "video", placement: "media",
            startTime: 0, duration: 5
        )
        let project = makeProject(slideDuration: 5, media: [media])
        let badURL = URL(fileURLWithPath: "/this/path/does/not/exist/v1.mp4")
        await engine.configure(project: project, mediaURLs: ["v1": badURL], images: [:])
        XCTAssertFalse(captured.isEmpty, "Expected at least one assetLoadFailed error")
        if case .assetLoadFailed(let clipId, _) = captured.first {
            XCTAssertEqual(clipId, "v1")
        } else {
            XCTFail("Expected assetLoadFailed, got \(String(describing: captured.first))")
        }
    }

    // MARK: - D9 multi-audio integration

    func test_multiAudioParallelPlayback_mixerReceivesAllAudios() async {
        let mixer = MockAudioMixer()
        let engine = StoryTimelineEngine(audioMixer: mixer)
        let music = StoryAudioPlayerObject(id: "music", postMediaId: "pm-music", isBackground: true)
        let voice = StoryAudioPlayerObject(id: "voice", postMediaId: "pm-voice")
        let project = makeProject(audios: [music, voice])
        await engine.configure(project: project, mediaURLs: [:], images: [:])
        XCTAssertEqual(mixer.lastConfiguredAudioCount, 2,
                       "Mixer should receive both background music + foreground voice for parallel playback")
    }

    func test_multiAudioParallelPlayback_playStartsBothNodes() async {
        let mixer = MockAudioMixer()
        let engine = StoryTimelineEngine(audioMixer: mixer)
        let music = StoryAudioPlayerObject(id: "music", postMediaId: "pm-music", isBackground: true)
        let voice = StoryAudioPlayerObject(id: "voice", postMediaId: "pm-voice")
        let project = makeProject(audios: [music, voice])
        await engine.configure(project: project, mediaURLs: [:], images: [:])
        engine.play()
        XCTAssertEqual(mixer.playCallCount, 1)
        XCTAssertEqual(mixer.lastConfiguredAudioCount, 2)
    }

    // MARK: - D10 mute global

    func test_isMuted_setTrue_callsMixerSetMuteTrue() async {
        let mixer = MockAudioMixer()
        let engine = StoryTimelineEngine(audioMixer: mixer)
        await engine.configure(project: makeProject(), mediaURLs: [:], images: [:])
        engine.isMuted = true
        XCTAssertEqual(mixer.setMuteCalls.last, true)
    }

    func test_isMuted_setFalse_callsMixerSetMuteFalse() async {
        let mixer = MockAudioMixer()
        let engine = StoryTimelineEngine(audioMixer: mixer)
        await engine.configure(project: makeProject(), mediaURLs: [:], images: [:])
        engine.isMuted = true
        engine.isMuted = false
        XCTAssertEqual(mixer.setMuteCalls.last, false)
    }
}
