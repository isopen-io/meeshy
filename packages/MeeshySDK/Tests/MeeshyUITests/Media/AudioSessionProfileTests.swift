import XCTest
import AVFoundation
@testable import MeeshySDK
@testable import MeeshyUI

@MainActor
final class AudioSessionProfileTests: XCTestCase {

    func test_contentProfile_hasNoMixableOption_nowPlayingEligible() {
        XCTAssertEqual(AudioSessionProfile.content.categoryOptions, [])
    }

    /// #11039 — un aperçu ou un réel qui sonne met la musique des autres apps
    /// en pause, comme le vocal : il ne l'atténue plus.
    func test_transientProfile_pausesOthersLikeContent() {
        XCTAssertEqual(AudioSessionProfile.transient.categoryOptions, ContentPlaybackSessionLaw.audibleOptions)
        XCTAssertFalse(AudioSessionProfile.transient.categoryOptions.contains(.duckOthers))
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
