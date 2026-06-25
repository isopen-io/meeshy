#if os(iOS)
import Testing
@testable import MeeshySDK

/// Étape A du plan d'unification audio (`docs/superpowers/specs/2026-06-08-
/// audio-coordination-unification-plan.md`) : `MediaSessionCoordinator` devient
/// call-aware. Verrouille la décision pure qui empêche le coordinator de
/// reconfigurer / relâcher la session `AVAudioSession` pendant qu'un appel VoIP
/// la possède (sinon le micro est coupé — cf. leçons RTCAudioSession).
///
/// Contrat behavior-preserving : `callActive == false` (défaut, aucun câblage
/// app) ⇒ la session est gérée exactement comme avant ce seam.
struct MediaSessionCoordinatorCallAwareTests {

    @Test func managesSession_whenNoCallActive() {
        #expect(MediaSessionCoordinator.shouldManageSession(callActive: false) == true)
    }

    @Test func skipsSessionManagement_whenCallActive() {
        #expect(MediaSessionCoordinator.shouldManageSession(callActive: true) == false)
    }
}

/// Behavioral lock for the `deactivateForBackground()` call-aware guard
/// (CALL-FIX 2026-06-25). Before the fix this method was the ONLY one in the
/// coordinator without the `callActive` guard, so backgrounding during a VoIP
/// call tore down the AVAudioSession and muted the call. The probe counts only
/// real teardowns (past the guard), so we can assert the no-op directly.
///
/// `.serialized` because these mutate the `.shared` singleton's `callActive`
/// flag and `testProbe`.
@Suite(.serialized)
struct MediaSessionCoordinatorBackgroundTeardownTests {

    @Test func deactivateForBackground_skipsTeardown_whenCallActive() async {
        let coordinator = MediaSessionCoordinator.shared
        let probe = MediaSessionCoordinatorTestProbe()
        coordinator.testProbe = probe
        coordinator.setCallActive(true)
        defer {
            coordinator.setCallActive(false)
            coordinator.testProbe = nil
        }

        await coordinator.deactivateForBackground()

        // A live call owns the session — no teardown must happen.
        #expect(probe.deactivateCount == 0)
        #expect(coordinator.isCallActive == true)
    }

    @Test func deactivateForBackground_tearsDown_whenNoCallActive() async {
        let coordinator = MediaSessionCoordinator.shared
        let probe = MediaSessionCoordinatorTestProbe()
        coordinator.testProbe = probe
        coordinator.setCallActive(false)
        defer { coordinator.testProbe = nil }

        await coordinator.deactivateForBackground()

        // No call active — the background path tears the session down as before.
        #expect(probe.deactivateCount == 1)
    }
}
#endif
