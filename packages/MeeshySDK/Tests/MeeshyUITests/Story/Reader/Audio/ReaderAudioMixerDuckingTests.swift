import XCTest
@testable import MeeshyUI

@MainActor
final class ReaderAudioMixerDuckingTests: XCTestCase {
    func test_duckingEnabled_defaultsFalse() {
        let mixer = ReaderAudioMixer()
        XCTAssertEqual(mixer.duckingEnabled, false)
    }

    func test_duckingEnabled_canBeSet() {
        let mixer = ReaderAudioMixer()
        mixer.duckingEnabled = true
        XCTAssertEqual(mixer.duckingEnabled, true)
    }

    func test_duckedBackgroundVolume_default05() {
        let mixer = ReaderAudioMixer()
        XCTAssertEqual(mixer.duckedBackgroundVolume, 0.5)
    }

    func test_fadeOutAndStop_completesAndStopsPlayback() async {
        let mixer = ReaderAudioMixer()
        await mixer.fadeOutAndStop(duration: 0.05)
        XCTAssertFalse(mixer.isPlaying)
    }
}
