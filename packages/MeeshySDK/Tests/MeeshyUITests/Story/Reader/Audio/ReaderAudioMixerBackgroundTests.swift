import XCTest
import Darwin
@testable import MeeshyUI
@testable import MeeshySDK

/// RC4.2 — the background audio entry was configured-but-never-played. These
/// tests cover the background transport contract. The schedule-and-play
/// assertions need a real audio fixture (absent from the SPM bundle) and skip
/// gracefully; the no-fixture invariants are exercised directly.
@MainActor
final class ReaderAudioMixerBackgroundTests: XCTestCase {
    func test_configureBackground_acceptsValidURL() throws {
        let mixer = ReaderAudioMixer()
        let testURL = Bundle(for: type(of: self)).url(forResource: "test-1s", withExtension: "m4a")
        guard let url = testURL else { throw XCTSkip("test-1s.m4a missing") }
        let audio = StoryAudioPlayerObject(id: "bg-1", postMediaId: "bg-1",
                                           isBackground: true)
        XCTAssertNoThrow(try mixer.configureBackground(audio: audio, url: url, looping: true))
        XCTAssertEqual(mixer.backgroundClipCount, 1)
    }

    func test_configureBackground_recordsStartOffsetFromAudioModel() throws {
        let mixer = ReaderAudioMixer()
        let testURL = Bundle(for: type(of: self)).url(forResource: "test-1s", withExtension: "m4a")
        guard let url = testURL else { throw XCTSkip("test-1s.m4a missing") }
        let audio = StoryAudioPlayerObject(id: "bg-2", postMediaId: "bg-2",
                                           isBackground: true, startTime: 2.0)
        try mixer.configureBackground(audio: audio, url: url, looping: true)
        XCTAssertEqual(mixer.backgroundStartOffset, 2.0, accuracy: 0.0001,
                       "backgroundStartOffset must mirror the resolved audio startTime")
    }

    func test_backgroundClipCount_zeroBeforeConfigure() {
        let mixer = ReaderAudioMixer()
        XCTAssertEqual(mixer.backgroundClipCount, 0)
    }

    func test_play_withNoBackground_stillSchedulesFresh() throws {
        let mixer = ReaderAudioMixer()
        let scheduled = try mixer.play(originHost: mach_absolute_time(),
                                       slideKey: "no-bg#0#fr")
        XCTAssertTrue(scheduled)
        XCTAssertTrue(mixer.isPlaying)
    }
}
