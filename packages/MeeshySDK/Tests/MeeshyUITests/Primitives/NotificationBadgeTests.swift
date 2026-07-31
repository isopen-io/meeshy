import XCTest
import SwiftUI
@testable import MeeshyUI

/// Format et dimensionnement de la pastille de compteur.
///
/// Le défaut d'origine : `Text("\(min(count, 99))")`. Passé 99, la pastille
/// affichait « 99 » — un nombre FAUX, présenté comme exact. Le seuil existait
/// pour tenir dans une pastille de 18 pt de côté ; il tronquait la donnée pour
/// protéger la mise en page. C'est l'inverse qu'il faut faire : la pastille
/// s'élargit, la donnée reste juste.
@MainActor
final class NotificationBadgeTests: XCTestCase {

    // MARK: - Texte

    func test_displayed_underOneHundred_isTheExactCount() {
        XCTAssertEqual(NotificationBadge.displayed(1), "1")
        XCTAssertEqual(NotificationBadge.displayed(71), "71")
        XCTAssertEqual(NotificationBadge.displayed(99), "99")
    }

    /// Le cas que `min(count, 99)` rendait indistinguable de 99 tout court.
    func test_displayed_atOneHundredAndAbove_isNinetyNinePlus() {
        XCTAssertEqual(NotificationBadge.displayed(100), "99+")
        XCTAssertEqual(NotificationBadge.displayed(4_312), "99+")
    }

    /// Zéro et négatif ne s'affichent pas — la vue se masque en amont, mais le
    /// formateur ne doit pas produire « -3 » si un compteur dérive.
    func test_displayed_zeroOrNegative_isEmpty() {
        XCTAssertEqual(NotificationBadge.displayed(0), "")
        XCTAssertEqual(NotificationBadge.displayed(-3), "")
    }

    // MARK: - Dimensionnement

    /// À un chiffre la pastille reste un CERCLE : largeur minimale égale à la
    /// hauteur. C'est ce qui distingue une pastille d'une étiquette.
    func test_minimumWidth_equalsHeight_soASingleDigitStaysCircular() {
        XCTAssertEqual(NotificationBadge.minimumSize, NotificationBadge.height)
    }

    /// Et à trois glyphes elle s'élargit au lieu de rétrécir le texte.
    /// `minimumScaleFactor` était le contournement : il rendait « 99+ »
    /// illisible plutôt que de laisser la pastille grandir.
    func test_horizontalPadding_leavesRoomForThreeGlyphs() {
        XCTAssertGreaterThanOrEqual(NotificationBadge.horizontalPadding, 5)
    }

    // MARK: - Graisse

    /// Le gras sur deux chiffres blancs dans un disque rouge saturé n'ajoute
    /// aucune lisibilité — il empâte les glyphes et fait baver le compteur sur
    /// le bord. Le repère visuel, c'est la pastille, pas la graisse.
    func test_fontWeight_isNotBold() {
        XCTAssertNotEqual(NotificationBadge.fontWeight, .bold)
        XCTAssertNotEqual(NotificationBadge.fontWeight, .heavy)
    }
}
