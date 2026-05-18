import XCTest
import Darwin
@testable import MeeshyUI
@testable import MeeshySDK

/// RC4.7 — default background fade envelope.
///
/// The product default is a 30 %→100 % fade-in over 1.2 s and a 100 %→5 %
/// fade-out over the last 0.5 s, applied ONLY when the slide authored no
/// explicit fade. The sample-accurate volume-ramp assertions require a real
/// audio fixture (absent from the SPM test bundle) and live in the device
/// verification pass; the envelope constants and the no-entry guards are
/// exercised directly here.
@MainActor
final class ReaderAudioMixerDefaultEnvelopeTests: XCTestCase {

    func test_defaultEnvelopeConstants_matchProductSpec() {
        XCTAssertEqual(ReaderAudioMixer.defaultEnvelopeFloorFraction, 0.30, accuracy: 0.0001)
        XCTAssertEqual(ReaderAudioMixer.defaultEnvelopeTailFraction, 0.05, accuracy: 0.0001)
        XCTAssertEqual(ReaderAudioMixer.defaultEnvelopeFadeInSeconds, 1.2, accuracy: 0.0001)
        XCTAssertEqual(ReaderAudioMixer.defaultEnvelopeFadeOutSeconds, 0.5, accuracy: 0.0001)
    }

    func test_backgroundStartOffset_defaultsToZero() {
        let mixer = ReaderAudioMixer()
        XCTAssertEqual(mixer.backgroundStartOffset, 0)
    }

    func test_applyDefaultBackgroundEnvelope_noBackgroundEntry_isNoOp() {
        let mixer = ReaderAudioMixer()
        // No background configured — the call must self-guard, never crash,
        // and never flip transport state.
        mixer.applyDefaultBackgroundEnvelope(originHost: mach_absolute_time(),
                                             slideDuration: 12)
        XCTAssertEqual(mixer.backgroundClipCount, 0)
        XCTAssertFalse(mixer.isPlaying)
    }

    func test_startBackground_noBackgroundEntry_isNoOp() {
        let mixer = ReaderAudioMixer()
        mixer.startBackground(originHost: mach_absolute_time())
        XCTAssertEqual(mixer.backgroundClipCount, 0)
        XCTAssertFalse(mixer.isPlaying)
    }
}
