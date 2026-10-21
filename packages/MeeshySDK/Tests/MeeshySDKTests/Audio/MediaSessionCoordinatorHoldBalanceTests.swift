#if os(iOS) && DEBUG
import Testing
@testable import MeeshySDK

/// Le compteur de détenteurs de `MediaSessionCoordinator` compte des
/// DÉTENTEURS, pas des activations réussies. Chaque appelant positionne son
/// drapeau « je tiens la session » AVANT `try? await request(...)`, puis appelle
/// `release()` une fois — même quand `request` a jeté (`setActive` refusé en
/// arrière-plan, catégorie refusée). Si l'échec ne compte pas, ce `release()`
/// retire la prise d'un AUTRE détenteur et coupe la session sous lui (le
/// canevas de story perd le son pendant qu'il joue).
@Suite(.serialized)
struct MediaSessionCoordinatorHoldBalanceTests {

    @Test func failedRequest_stillCountsAsAHold_soItsReleaseDoesNotStealAnotherHolder() async {
        let coordinator = MediaSessionCoordinator.makeForTesting()
        let probe = MediaSessionCoordinatorTestProbe()
        coordinator.testProbe = probe

        // Détenteur A : la lecture du canevas de story, activation réussie.
        try? await coordinator.request(role: .playback)
        // Détenteur B : un message vocal dont l'activation échoue.
        probe.failNextRequest = true
        try? await coordinator.request(role: .playback)
        // B libère sa prise (son drapeau était posé avant l'échec).
        await coordinator.release()

        // A tient toujours la session.
        #expect(await coordinator.holdCountForTesting == 1)
        await coordinator.release()
        #expect(await coordinator.holdCountForTesting == 0)
    }
}
#endif
