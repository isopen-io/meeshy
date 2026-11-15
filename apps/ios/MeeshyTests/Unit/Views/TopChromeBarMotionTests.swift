import XCTest
import SwiftUI
@testable import Meeshy

/// Comment une barre du haut de l'app — le mini-lecteur, la barre d'appel — s'en va (#9048).
///
/// Demande porteur 2026-10-01 : « Il ne faut pas faire disparaître mais remonter vers le haut pour
/// que le contenu remonte jusqu'à sortir hors d'écran et disparaître ! »
///
/// Ces témoins tiennent la RÈGLE ; `TopChromeExitRenderTests` mesure ce qu'elle peint.
@MainActor
final class TopChromeBarMotionTests: XCTestCase {

    /// La dernière barre remonte de sa hauteur PLUS celle de l'encart, sans quoi elle s'arrêterait
    /// sous l'heure et la batterie, encore visible.
    func test_exit_lastBar_slidesPastTheSystemBar() {
        XCTAssertEqual(
            TopChromeBarMotion.exit(isLastBar: true, reduceMotion: false, safeAreaTop: 62),
            .slideUp(clearance: 62)
        )
    }

    /// Quand l'autre barre reste, la barre qui part se range sous elle, de sa seule hauteur.
    /// Remonter de l'encart en plus ouvrirait un trou entre elle et le contenu qui la suit.
    func test_exit_anotherBarStays_tucksUnderItByItsOwnHeight() {
        XCTAssertEqual(
            TopChromeBarMotion.exit(isLastBar: false, reduceMotion: false, safeAreaTop: 62),
            .slideUp(clearance: 0)
        )
    }

    /// « Réduire les animations » : aucune translation, quelle que soit la barre.
    func test_exit_reduceMotion_fadesWithoutMoving() {
        XCTAssertEqual(TopChromeBarMotion.exit(isLastBar: true, reduceMotion: true, safeAreaTop: 62), .fade)
        XCTAssertEqual(TopChromeBarMotion.exit(isLastBar: false, reduceMotion: true, safeAreaTop: 62), .fade)
    }

    /// Le ressort est coupé, pas raccourci : une barre apparaît et disparaît sans rebond.
    func test_animation_reduceMotion_isNil() {
        XCTAssertNil(TopChromeBarMotion.animation(reduceMotion: true))
    }

    func test_animation_default_isTheSharedSpring() {
        XCTAssertNotNil(TopChromeBarMotion.animation(reduceMotion: false))
    }

    /// La dernière barre passe DEVANT la bande : la bande remonte moins vite qu'elle, et la
    /// masquerait sinon avant qu'elle ne sorte de l'écran.
    func test_layer_lastBar_paintsOverTheBand() {
        XCTAssertGreaterThan(TopChromeBarMotion.layer(isLastBar: true, isCall: false), TopChromeBarMotion.bandLayer)
        XCTAssertGreaterThan(TopChromeBarMotion.layer(isLastBar: true, isCall: true), TopChromeBarMotion.bandLayer)
    }

    /// Une barre qui se range passe SOUS la bande — qui reste — et la barre d'écoute passe sous
    /// la barre d'appel : c'est sous elles qu'elle disparaît, sans jamais déborder dans l'encart.
    func test_layer_barThatTucksAway_paintsUnderTheBandAndTheCallUnderNeither() {
        let ecoute = TopChromeBarMotion.layer(isLastBar: false, isCall: false)
        let appel = TopChromeBarMotion.layer(isLastBar: false, isCall: true)
        XCTAssertLessThan(appel, TopChromeBarMotion.bandLayer)
        XCTAssertLessThan(ecoute, appel)
        XCTAssertGreaterThan(ecoute, 0, "Toute barre reste au-dessus du contenu de l'app.")
    }
}
