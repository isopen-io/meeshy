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

    // MARK: - #10730 — l'enchaînement d'une conversation n'appartient qu'à son coordinateur

    /// Une bulle de conversation INACTIVE n'a pas de moteur externe, mais
    /// son parent route le tap (`onPlayRequest`) : c'est lui qui possède la
    /// lecture ET l'enchaînement. S'inscrire au registre statique faisait
    /// rejouer, à la fin du dernier vocal reçu, les bulles apparues AVANT
    /// lui — mes propres vocaux, en remontant le fil.
    @Test func parentRoutedBubble_neverJoinsTheLegacyAutoplayRegistry() {
        #expect(AudioPlayerView.joinsLegacyAutoplay(usesExternalPlayer: false, routesPlayToParent: true) == false)
        #expect(AudioPlayerView.joinsLegacyAutoplay(usesExternalPlayer: true, routesPlayToParent: true) == false)
        #expect(AudioPlayerView.joinsLegacyAutoplay(usesExternalPlayer: true, routesPlayToParent: false) == false)
    }

    @Test func standaloneOwnedPlayer_keepsTheLegacyAutoplay() {
        #expect(AudioPlayerView.joinsLegacyAutoplay(usesExternalPlayer: false, routesPlayToParent: false) == true)
    }

    /// La séquence de la recette #10723 : trois vocaux à moi, puis le vocal
    /// reçu, inscrits dans l'ordre d'apparition. Le moteur d'un coordinateur
    /// finit le vocal reçu : rien ne doit repartir.
    @Test @MainActor func coordinatorEngine_endOfLastReceivedAudio_startsNothing() {
        let ids = ["m10730_mine1", "m10730_mine2", "m10730_mine3", "m10730_received"]
        var played: [String] = []
        ids.forEach { id in
            AudioPlaybackManager.registerAutoplay(id: id, url: "https://x/\(id).m4a") { played.append(id) }
        }
        defer { ids.forEach { AudioPlaybackManager.unregisterAutoplay(id: $0) } }
        let engine = AudioPlaybackManager()
        engine.relaysEndToAutoplayRegistry = false

        engine.relayEndToAutoplayRegistry(finishedUrl: "https://x/m10730_received.m4a")

        #expect(played.isEmpty)
    }

    @Test @MainActor func ownedEngine_stillRelaysItsEndToTheRegistry() {
        let ids = ["o10730_a", "o10730_b"]
        var played: [String] = []
        ids.forEach { id in
            AudioPlaybackManager.registerAutoplay(id: id, url: "https://x/\(id).m4a") { played.append(id) }
        }
        defer { ids.forEach { AudioPlaybackManager.unregisterAutoplay(id: $0) } }

        AudioPlaybackManager().relayEndToAutoplayRegistry(finishedUrl: "https://x/o10730_b.m4a")

        #expect(played == ["o10730_a"])
    }
}
