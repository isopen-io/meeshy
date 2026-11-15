import Testing
import Combine
@testable import MeeshyUI

/// **Une remise à zéro sur un lecteur déjà à zéro ne publie rien** (#7005,
/// suite de #6977).
///
/// `@Published` publie sur `willSet` — valeur changée ou non. Un `teardown()`
/// ou un `stop()` qui ré-assigne ses propriétés sans les comparer émet donc un
/// `objectWillChange` par propriété, à chaque appel, même quand rien ne change.
///
/// Ce n'est pas une élégance : ces remises à zéro sont appelées depuis le
/// corps d'une vue SwiftUI. C'est exactement la position qui a produit #6977 —
/// « Publishing changes from within view updates », SwiftUI qui abandonne ses
/// rendus, et le fil resté VIERGE jusqu'à cinq secondes après l'arrêt du geste.
/// Le coordinateur de la story vidéo, qui en était le cas d'école, a quitté le
/// dépôt avec sa vue (#9890).
///
/// Même forme que `AudioPlaybackManagerStopIdempotenceTests`, le témoin du lot
/// précédent.
@Suite("Remises à zéro média — idempotentes sur un lecteur déjà arrêté")
struct MediaResetIdempotenceTests {

    @Test("Un aperçu de rognage jamais lancé qui reçoit stop() n'émet rien")
    @MainActor
    func test_stop_onIdleTrimPreview_publishesNothing() {
        let player = AudioTrimPreviewPlayer()
        var emissions = 0
        let subscription = player.objectWillChange.sink { _ in emissions += 1 }
        defer { subscription.cancel() }

        player.stop()

        #expect(emissions == 0)
        #expect(player.isPlaying == false)
    }
}
