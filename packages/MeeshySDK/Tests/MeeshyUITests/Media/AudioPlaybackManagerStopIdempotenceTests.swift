import Testing
import Combine
@testable import MeeshyUI

/// `stop()` sur un lecteur DÉJÀ arrêté ne publie rien (#6977).
///
/// `@Published` publie sur `willSet`, valeur changée ou non. `resetState()`
/// ré-assignait `isPlaying`, `progress`, `currentTime` et `shouldLoop` à
/// chaque `stop()` — et `PlaybackCoordinator.willStartPlaying` appelle `stop()`
/// sur TOUS les lecteurs enregistrés à chaque canvas de scène créé par le fil,
/// c'est-à-dire DANS `makeUIView`, donc dans une mise à jour de vue SwiftUI.
/// Mesuré au simulateur le 2026-09-18 : 81 canvas × 3 publications pendant
/// un seul défilement, « Publishing changes from within view updates », et le
/// fil restait VIERGE jusqu'à 5 s après l'arrêt du geste.
@Suite("AudioPlaybackManager — stop() idempotent sur un lecteur arrêté")
struct AudioPlaybackManagerStopIdempotenceTests {

    @Test("Un lecteur jamais démarré qui reçoit stop() n'émet aucun objectWillChange")
    @MainActor
    func test_stop_onIdleManager_publishesNothing() {
        let manager = AudioPlaybackManager(registerWithCoordinator: false)
        var emissions = 0
        let subscription = manager.objectWillChange.sink { _ in emissions += 1 }
        defer { subscription.cancel() }

        manager.stop()

        #expect(emissions == 0)
        #expect(manager.isPlaying == false)
        #expect(manager.progress == 0)
        #expect(manager.currentTime == 0)
        #expect(manager.shouldLoop == false)
    }

    @Test("Un second stop() consécutif n'émet rien non plus")
    @MainActor
    func test_stop_twice_publishesNothingOnTheSecond() {
        let manager = AudioPlaybackManager(registerWithCoordinator: false)
        manager.stop()
        var emissions = 0
        let subscription = manager.objectWillChange.sink { _ in emissions += 1 }
        defer { subscription.cancel() }

        manager.stop()

        #expect(emissions == 0)
    }
}
