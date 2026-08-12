import XCTest
@testable import MeeshyUI

/// WS3.7 — pure decision for the inline player's autoplay-on-appear opt-in.
/// Autoplay only when the opaque flag is set AND the asset is ready AND the view
/// is on-screen AND no call owns the audio session. Every other combination must
/// stay tap-to-play (the feed default keeps the flag `false`).
final class MeeshyVideoPlayerAutoplayDecisionTests: XCTestCase {

    private func decide(flag: Bool, ready: Bool, onScreen: Bool, call: Bool) -> Bool {
        _InlineRenderer.shouldAutoplayOnAppear(
            autoplayOnAppear: flag, isReady: ready, isOnScreen: onScreen, isCallActive: call
        )
    }

    func test_autoplays_whenFlagAndReadyAndOnScreenAndNoCall() {
        XCTAssertTrue(decide(flag: true, ready: true, onScreen: true, call: false))
    }

    func test_doesNotAutoplay_whenFlagOff() {
        XCTAssertFalse(decide(flag: false, ready: true, onScreen: true, call: false),
                       "Default (feed / other call sites) must stay tap-to-play")
    }

    func test_doesNotAutoplay_whenNotReady() {
        XCTAssertFalse(decide(flag: true, ready: false, onScreen: true, call: false),
                       "A video needing download must not autoplay")
    }

    func test_doesNotAutoplay_whenOffScreen() {
        XCTAssertFalse(decide(flag: true, ready: true, onScreen: false, call: false))
    }

    func test_doesNotAutoplay_whenCallActive() {
        XCTAssertFalse(decide(flag: true, ready: true, onScreen: true, call: true),
                       "An active call owns the audio session — never autoplay over it")
    }
}
