import XCTest
@testable import Meeshy

/// #4080 / #5074 — **le mode se lit du GESTE, jamais d'un bouton.**
///
/// > « la gestion photo vidéo ou mains libres se fait par la gestuelle
/// > uniquement et non des boutons disponibles » — porteur, 2026-09-04
final class ComposerShutterGestureTests: XCTestCase {

    /// Un appui vif est une photo — le cas le plus fréquent, et celui qui doit
    /// coûter le moins.
    func test_unAppuiBref_estUnePhoto() {
        XCTAssertEqual(ComposerShutterGesture.outcome(heldFor: 0.1, locked: false), .photo)
    }

    /// **Le seuil est franchi, pas approché.** À l'instant exact du seuil, le
    /// doigt a tenu : c'est une prise. Un `>` strict rendrait le cas limite
    /// photo, et l'auteur verrait une image là où il croyait filmer.
    func test_auSeuilExact_leDoigtAVaitTenu() {
        XCTAssertEqual(
            ComposerShutterGesture.outcome(heldFor: ComposerShutterGesture.holdToFilm,
                                           locked: false), .closeTake)
    }

    /// **Le verrou GAGNE sur la durée**, et c'est toute sa raison d'être :
    /// verrouiller puis relâcher doit CONTINUER de filmer. Si la durée primait,
    /// « mains libres » serait indiscernable d'une vidéo tenue — la troisième
    /// intention disparaîtrait sans qu'aucun écran ne rougisse.
    func test_leVerrou_gagneSurLaDurée() {
        XCTAssertEqual(ComposerShutterGesture.outcome(heldFor: 9, locked: true), .keepFilming)
        XCTAssertEqual(ComposerShutterGesture.outcome(heldFor: 0.01, locked: true), .keepFilming)
    }

    /// **REMONTER verrouille, descendre non.** L'écran a son origine en HAUT :
    /// une translation négative est une remontée. Confondre les deux
    /// verrouillerait en éloignant le pouce du déclencheur — l'inverse exact du
    /// geste, et une erreur qui se teste bien parce qu'elle est silencieuse.
    func test_seulLaRemontée_verrouille() {
        XCTAssertTrue(ComposerShutterGesture.locks(translationY: -80))
        XCTAssertFalse(ComposerShutterGesture.locks(translationY: 80))
        XCTAssertFalse(ComposerShutterGesture.locks(translationY: -10))
    }

    func test_auSeuilExactDeRemontée_çaVerrouille() {
        XCTAssertTrue(ComposerShutterGesture.locks(
            translationY: -ComposerShutterGesture.liftToLock))
    }

    /// **Les deux seuils ne se confondent pas avec ceux du système.** Au-dessus
    /// du double-tap (0,25 s), en dessous du long-press SwiftUI (0,5 s) : un
    /// appui vif reste une photo, et la vidéo démarre avant que le doigt ne se
    /// demande s'il s'est passé quelque chose.
    func test_leSeuilDeMaintien_vitEntreLesDeuxSeuilsSystème() {
        XCTAssertGreaterThan(ComposerShutterGesture.holdToFilm, 0.25)
        XCTAssertLessThan(ComposerShutterGesture.holdToFilm, 0.5)
    }

    /// Tenue ou verrouillée, c'est une VIDÉO dans les deux cas : la différence
    /// est ce que le relâchement fera, pas ce qui s'écrit sur le disque.
    func test_tenueOuVerrouillée_lesDeuxÉcriventUneVidéo() {
        XCTAssertEqual(ComposerShutterGesture.mode(locked: false), .video)
        XCTAssertEqual(ComposerShutterGesture.mode(locked: true), .handsFree)
    }
}
