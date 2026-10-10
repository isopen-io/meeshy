import XCTest
import AVFoundation
import Darwin
@testable import MeeshyUI
@testable import MeeshySDK

/// #9702 — l'aperçu du composer : l'audio part à l'ancre hôte commune, depuis
/// la tête de lecture courante ; un seek en lecture ré-ancre l'audio ; la
/// session audio rend la taille de tampon qu'elle a empruntée.
@MainActor
final class StoryTimelineEngineSyncTests: XCTestCase {

    private func makeProject(slideDuration: Float = 10) -> TimelineProject {
        TimelineProject(
            slideId: "sync",
            slideDuration: slideDuration,
            mediaObjects: [],
            audioPlayerObjects: [StoryAudioPlayerObject(id: "a1", postMediaId: "pma1")],
            textObjects: [],
            clipTransitions: []
        )
    }

    func test_play_startsAudioFromPlayhead_atAFutureSharedAnchor() async {
        let mixer = MockAudioMixer()
        let engine = StoryTimelineEngine(audioMixer: mixer)
        await engine.configure(project: makeProject(), mediaURLs: [:], images: [:])
        engine.seek(to: 3)
        let before = mach_absolute_time()

        engine.play()

        XCTAssertEqual(mixer.lastPlayTimelineTime ?? -1, 3, accuracy: 0.001)
        XCTAssertGreaterThan(mixer.lastPlayHostTime ?? 0, before,
                             "L'audio part à une ancre FUTURE commune, pas « maintenant »")
        engine.shutdown()
    }

    func test_seek_whilePaused_doesNotStartAudio() async {
        let mixer = MockAudioMixer()
        let engine = StoryTimelineEngine(audioMixer: mixer)
        await engine.configure(project: makeProject(), mediaURLs: [:], images: [:])

        engine.seek(to: 2)

        XCTAssertEqual(mixer.playCallCount, 0)
        engine.shutdown()
    }

    func test_seek_whilePlayingOnInternalClock_reanchorsAudioAtSeekTarget() async {
        let mixer = MockAudioMixer()
        let engine = StoryTimelineEngine(audioMixer: mixer)
        await engine.configure(project: makeProject(), mediaURLs: [:], images: [:])
        engine.play()

        engine.seek(to: 6)

        XCTAssertEqual(mixer.playCallCount, 2)
        XCTAssertEqual(mixer.lastPlayTimelineTime ?? -1, 6, accuracy: 0.001)
        XCTAssertTrue(engine.isPlaying)
        engine.shutdown()
    }

    func test_shutdown_restoresThePreferredIOBufferDurationItBorrowed() async throws {
        let session = AVAudioSession.sharedInstance()
        try session.setPreferredIOBufferDuration(0.02)
        let before = session.preferredIOBufferDuration
        let engine = StoryTimelineEngine(audioMixer: MockAudioMixer())
        await engine.configure(project: makeProject(), mediaURLs: [:], images: [:])

        engine.shutdown()

        XCTAssertEqual(session.preferredIOBufferDuration, before, accuracy: 0.0005,
                       "Le tampon de 5 ms de l'éditeur ne doit pas survivre à l'écran qui l'a posé")
    }
}
