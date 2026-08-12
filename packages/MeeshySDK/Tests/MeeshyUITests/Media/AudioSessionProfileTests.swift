import XCTest
import AVFoundation
@testable import MeeshySDK
@testable import MeeshyUI

@MainActor
final class AudioSessionProfileTests: XCTestCase {

    func test_contentProfile_hasNoMixableOption_nowPlayingEligible() {
        XCTAssertEqual(AudioSessionProfile.content.categoryOptions, [])
    }

    func test_transientProfile_ducksOthers() {
        XCTAssertEqual(AudioSessionProfile.transient.categoryOptions, [.duckOthers])
    }

    func test_freshEngine_defaultsToTransient_failSafe() {
        let engine = AudioPlaybackManager(registerWithCoordinator: false)
        XCTAssertEqual(engine.sessionProfile, .transient)
    }

    func test_pause_withoutPlayer_isSafeNoOp() {
        let engine = AudioPlaybackManager(registerWithCoordinator: false)
        engine.pause()
        XCTAssertFalse(engine.isPlaying)
    }

    func test_resumeFromInterruption_withoutPlayer_isSafeNoOp() {
        let engine = AudioPlaybackManager(registerWithCoordinator: false)
        engine.resumeFromInterruption()
        XCTAssertFalse(engine.isPlaying)
    }
}
