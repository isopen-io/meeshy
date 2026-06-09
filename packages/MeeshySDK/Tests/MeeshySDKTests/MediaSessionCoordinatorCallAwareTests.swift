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
#endif
