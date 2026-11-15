import XCTest
import MeeshySDK
@testable import MeeshyUI

/// Covers the P1 audit fix: the feed's muted autoplay used to write directly to
/// `isMuted` — the SESSION-GLOBAL user preference toggled by the fullscreen
/// mute button — so it leaked into whatever surface played next (the
/// conversation gallery inherited a stuck `isMuted = true` and played back
/// silently even though the user never touched mute). `isForceMuted` is a
/// separate, per-surface, TRANSIENT override: a surface that must be silent
/// regardless of user preference (feed autoplay) sets it, and it resets on
/// `cleanup()`/`stop()` — never persisting across an attachment/surface change,
/// unlike `isMuted`.
final class SharedAVPlayerManagerMuteIntentTests: XCTestCase {

    func test_isForceMuted_defaultsFalse() async {
        await MainActor.run {
            let m = SharedAVPlayerManager.shared
            m.stop()
            XCTAssertFalse(m.isForceMuted)
        }
    }

    func test_isForceMuted_canBeToggled() async {
        await MainActor.run {
            let m = SharedAVPlayerManager.shared
            m.isForceMuted = true
            XCTAssertTrue(m.isForceMuted)
            m.isForceMuted = false
            XCTAssertFalse(m.isForceMuted)
        }
    }

    func test_stop_resetsIsForceMuted() async {
        await MainActor.run {
            let m = SharedAVPlayerManager.shared
            m.isForceMuted = true
            m.stop()
            XCTAssertFalse(m.isForceMuted, "isForceMuted is a per-surface transient override, must NOT survive stop")
        }
    }

    func test_stop_preservesIsMuted_whileResettingIsForceMuted() async {
        await MainActor.run {
            let m = SharedAVPlayerManager.shared
            m.isMuted = true
            m.isForceMuted = true
            m.stop()
            XCTAssertTrue(m.isMuted, "isMuted is the session-global user preference, must survive stop")
            XCTAssertFalse(m.isForceMuted)
            m.isMuted = false // teardown
        }
    }

    func test_effectiveMuted_falseWhenNeitherFlagSet() async {
        await MainActor.run {
            let m = SharedAVPlayerManager.shared
            m.isMuted = false
            m.isForceMuted = false
            XCTAssertFalse(m.effectiveMuted)
        }
    }

    func test_effectiveMuted_trueWhenIsMutedOnly() async {
        await MainActor.run {
            let m = SharedAVPlayerManager.shared
            m.isMuted = true
            m.isForceMuted = false
            XCTAssertTrue(m.effectiveMuted)
            m.isMuted = false // teardown
        }
    }

    func test_effectiveMuted_trueWhenIsForceMutedOnly() async {
        await MainActor.run {
            let m = SharedAVPlayerManager.shared
            m.isMuted = false
            m.isForceMuted = true
            XCTAssertTrue(m.effectiveMuted)
            m.isForceMuted = false // teardown
        }
    }

    // MARK: - Ducking session gate (pure predicate)

    /// A surface that intends to be silent (feed autoplay) has no audible
    /// output — it must leave the user's own music alone (#11039). The
    /// session used to activate unconditionally in `load()`, before any
    /// caller had a chance to express its mute intent.
    func test_playbackAudibility_mutedWhenEffectivelyMuted() {
        XCTAssertEqual(SharedAVPlayerManager.playbackAudibility(effectiveMuted: true), .muted)
    }

    func test_playbackAudibility_audibleWhenNotMuted() {
        XCTAssertEqual(SharedAVPlayerManager.playbackAudibility(effectiveMuted: false), .audible)
    }

    /// A voice note or a story taking over from an IDLE video engine must not
    /// bounce the audio session (blocking setActive(false) on main + other apps'
    /// music resumed then cut again).
    func test_shouldReleaseSessionOnHandoff_falseWhenVideoHeldNothing() {
        XCTAssertFalse(SharedAVPlayerManager.shouldReleaseSessionOnHandoff(heldPlayback: false))
    }

    func test_shouldReleaseSessionOnHandoff_trueWhenVideoHeldAPlayer() {
        XCTAssertTrue(SharedAVPlayerManager.shouldReleaseSessionOnHandoff(heldPlayback: true))
    }
}
