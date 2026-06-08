import Testing
@testable import MeeshyUI

/// Lifecycle contract for AudioPlayerView's owned vs external playback engine.
///
/// Locks the rule that owned engines (post detail, feed post cards, composer
/// preview, standalone players) are STOPPED when the view leaves the hierarchy,
/// while an externally-injected coordinator engine (conversation bubbles) is
/// left running so it can continue via the mini-player + background.
///
/// Regression guard: before this contract, the owned-engine path unregistered
/// from `PlaybackCoordinator` on disappear without stopping playback — so post
/// / feed-card audio kept playing (ARC-deferred dealloc) and, having left the
/// coordinator registry, could no longer be silenced when a story or
/// conversation claimed audio next (audio bled over the next screen).
struct AudioPlayerViewLifecycleTests {

    @Test func ownedEngine_isStopped_onDisappear() {
        #expect(AudioPlayerView.shouldStopOwnedEngineOnDisappear(usesExternalPlayer: false) == true)
    }

    @Test func externalEngine_keepsPlaying_onDisappear() {
        #expect(AudioPlayerView.shouldStopOwnedEngineOnDisappear(usesExternalPlayer: true) == false)
    }
}
