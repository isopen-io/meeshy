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

    /// **La DROITE verrouille, la gauche non** (directive porteur 2026-09-04).
    ///
    /// Le sens n'est pas un détail : glisser à gauche ramènerait vers les
    /// portes du rail, un geste qui veut dire autre chose. Et le déclencheur
    /// vivant au BAS de la carte, remonter ferait passer le doigt sur l'image —
    /// il masquerait le sujet au moment précis où on le filme.
    func test_seulLeGlissementÀDroite_verrouille() {
        XCTAssertTrue(ComposerShutterGesture.locks(translationX: 80))
        XCTAssertFalse(ComposerShutterGesture.locks(translationX: -80))
        XCTAssertFalse(ComposerShutterGesture.locks(translationX: 10))
    }

    func test_auSeuilExact_çaVerrouille() {
        XCTAssertTrue(ComposerShutterGesture.locks(
            translationX: ComposerShutterGesture.slideToLock))
    }

    /// **Le geste se VOIT pendant qu'il se fait.** La directive du 2026-08-30
    /// veut des gestes progressifs et annulables : un seuil franchi sans
    /// prévenir laisse l'auteur découvrir l'état après coup. La progression est
    /// bornée aux deux bouts — au-delà du seuil elle reste à 1, en arrière elle
    /// retombe à 0, ce qui EST l'annulation.
    func test_laProgression_estBornéeEtRéversible() {
        XCTAssertEqual(ComposerShutterGesture.lockProgress(translationX: 0), 0)
        XCTAssertEqual(ComposerShutterGesture.lockProgress(translationX: 32), 0.5, accuracy: 0.001)
        XCTAssertEqual(ComposerShutterGesture.lockProgress(translationX: 999), 1)
        XCTAssertEqual(ComposerShutterGesture.lockProgress(translationX: -50), 0,
                       "revenir en arrière ANNULE — c'est la moitié qui compte")
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
