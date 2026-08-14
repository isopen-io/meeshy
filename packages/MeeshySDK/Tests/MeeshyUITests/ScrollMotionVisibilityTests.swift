import XCTest
import SwiftUI
@testable import MeeshyUI

/// Loi d'affichage commune à l'app : **une vue en mouvement ne montre pas ses
/// boutons d'action** (directive produit 2026-08-14). Les boutons s'effacent
/// pendant le défilement et reviennent quand il s'arrête.
final class ScrollMotionVisibilityTests: XCTestCase {

    // MARK: - La loi

    func test_opacity_whileMoving_isFullyFaded() {
        XCTAssertEqual(ScrollMotion.opacity(isMoving: true), 0)
    }

    func test_opacity_whenSettled_isFullyVisible() {
        XCTAssertEqual(ScrollMotion.opacity(isMoving: false), 1)
    }

    /// Un bouton invisible qui reste tappable est un piège : le doigt qui
    /// freine la liste déclencherait un appel ou une recherche.
    func test_hitTesting_whileMoving_isDisabled() {
        XCTAssertFalse(ScrollMotion.allowsHitTesting(isMoving: true))
    }

    func test_hitTesting_whenSettled_isEnabled() {
        XCTAssertTrue(ScrollMotion.allowsHitTesting(isMoving: false))
    }

    // MARK: - Retour des boutons

    /// Le délai d'apaisement ne sert qu'aux sources qui n'ont que l'offset
    /// pour signal (ScrollView SwiftUI) : trop court il ferait clignoter les
    /// boutons entre deux frames, trop long il les retiendrait après l'arrêt.
    func test_settleDelay_staysWithinPerceptibleWindow() {
        let milliseconds = ScrollMotion.settleDelay / .milliseconds(1)
        XCTAssertGreaterThanOrEqual(milliseconds, 80)
        XCTAssertLessThanOrEqual(milliseconds, 300)
    }

    func test_fadeDuration_isShorterThanTheSettleDelayIsLong() {
        XCTAssertGreaterThan(ScrollMotion.fadeDuration, 0)
        XCTAssertLessThanOrEqual(ScrollMotion.fadeDuration, 0.4)
    }

    // MARK: - Environnement

    /// Une vue montée hors de toute source de mouvement est au repos : sans
    /// ce défaut, un bouton d'action serait invisible partout où personne ne
    /// publie l'état de défilement.
    func test_environment_defaultsToSettled() {
        XCTAssertFalse(EnvironmentValues().isScrollMotionActive)
    }

    func test_environment_carriesTheMovingFlag() {
        var values = EnvironmentValues()
        values.isScrollMotionActive = true
        XCTAssertTrue(values.isScrollMotionActive)
    }
}
