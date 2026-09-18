import Testing
import Combine
@testable import MeeshyUI

/// `stop()` sur le moteur vidéo partagé DÉJÀ arrêté ne publie rien (#6977).
///
/// Jumeau de `AudioPlaybackManagerStopIdempotenceTests` : le même
/// `PlaybackCoordinator.willStartPlaying` qui arrête tous les lecteurs audio
/// arrête aussi `SharedAVPlayerManager.shared`, depuis le même `makeUIView`.
/// Un `cleanup()` qui ré-assigne six `@Published` à l'identique publie six
/// fois dans la mise à jour de vue dès qu'une surface vidéo observe le moteur.
@Suite("SharedAVPlayerManager — stop() idempotent sur un moteur arrêté")
struct SharedAVPlayerManagerStopIdempotenceTests {

    @Test("Un moteur à l'arrêt qui reçoit stop() n'émet aucun objectWillChange")
    @MainActor
    func test_stop_onIdleManager_publishesNothing() {
        let manager = SharedAVPlayerManager.shared
        manager.stop()
        var emissions = 0
        let subscription = manager.objectWillChange.sink { _ in emissions += 1 }
        defer { subscription.cancel() }

        manager.stop()

        #expect(emissions == 0)
        #expect(manager.isPlaying == false)
        #expect(manager.player == nil)
        #expect(manager.activeURL == "")
    }
}
