import XCTest
import Darwin
@testable import MeeshyUI
@testable import MeeshySDK

/// RC4.6 — `ReaderAudioMixer.play(originHost:slideKey:)` must be idempotent
/// across SwiftUI re-renders: re-invoking it with the same `slideKey` resumes
/// the transport instead of stacking duplicate buffers (which is heard as an
/// echo). A genuine slide change carries a new key and re-schedules.
///
/// The guard is exercised with an empty mixer — no audio fixture is needed:
/// `play` still flips `isPlaying` and its `Bool` return reports whether the
/// pass was scheduled fresh (`true`) or resumed (`false`).
@MainActor
final class ReaderAudioMixerIdempotenceTests: XCTestCase {

    func test_play_firstCall_schedulesFreshPass() throws {
        let mixer = ReaderAudioMixer()
        let scheduled = try mixer.play(originHost: 1_000, slideKey: "slide-a#0#fr")
        XCTAssertTrue(scheduled, "The first play() must schedule a fresh pass")
        XCTAssertTrue(mixer.isPlaying)
    }

    func test_play_calledTwiceSameSlideKey_isNoOpResume() throws {
        let mixer = ReaderAudioMixer()
        _ = try mixer.play(originHost: 1_000, slideKey: "slide-a#0#fr")
        let second = try mixer.play(originHost: 9_999, slideKey: "slide-a#0#fr")
        XCTAssertFalse(second,
                       "Re-play with the same slideKey must resume, not re-schedule")
        XCTAssertTrue(mixer.isPlaying)
    }

    func test_play_newSlideKey_schedulesFreshAgain() throws {
        let mixer = ReaderAudioMixer()
        _ = try mixer.play(originHost: 1_000, slideKey: "slide-a#0#fr")
        let next = try mixer.play(originHost: 2_000, slideKey: "slide-b#1#fr")
        XCTAssertTrue(next, "A new slideKey must trigger a fresh schedule")
    }

    func test_stop_clearsSlideKey_soSameKeyReschedules() throws {
        let mixer = ReaderAudioMixer()
        _ = try mixer.play(originHost: 1_000, slideKey: "slide-a#0#fr")
        mixer.stop()
        XCTAssertFalse(mixer.isPlaying)
        let replay = try mixer.play(originHost: 3_000, slideKey: "slide-a#0#fr")
        XCTAssertTrue(replay, "After stop() the same key must schedule fresh again")
    }

    func test_hasStartedPlayback_reflectsScheduleState() throws {
        let mixer = ReaderAudioMixer()
        XCTAssertFalse(mixer.hasStartedPlayback)
        _ = try mixer.play(originHost: mach_absolute_time(), slideKey: "slide-a#0#fr")
        XCTAssertTrue(mixer.hasStartedPlayback)
        mixer.stop()
        XCTAssertFalse(mixer.hasStartedPlayback)
    }

    func test_pause_keepsSlideKey_soNextPlayResumes() throws {
        let mixer = ReaderAudioMixer()
        _ = try mixer.play(originHost: 1_000, slideKey: "slide-a#0#fr")
        mixer.pause()
        XCTAssertFalse(mixer.isPlaying)
        // pause() (unlike stop()) keeps the key — a same-key play() resumes.
        let resumed = try mixer.play(originHost: 4_000, slideKey: "slide-a#0#fr")
        XCTAssertFalse(resumed, "After pause() the same key must resume, not re-schedule")
        XCTAssertTrue(mixer.isPlaying)
    }
}
