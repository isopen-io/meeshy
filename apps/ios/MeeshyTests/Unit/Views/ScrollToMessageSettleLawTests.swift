// apps/ios/MeeshyTests/Unit/Views/ScrollToMessageSettleLawTests.swift

import XCTest
import CoreGraphics
@testable import Meeshy

/// La loi de visée vérifiée d'un saut vers un message : `scrollToItem` vise
/// un offset calculé sur des hauteurs ESTIMÉES et atterrit à côté dès que des
/// cellules se réalisent pendant l'animation. La loi recalcule l'offset qui
/// centre la cible sur les attributs frais et décide — posé / re-viser /
/// abandon budgété. Voir `ScrollToMessageSettleLaw.swift`.
final class ScrollToMessageSettleLawTests: XCTestCase {

    // MARK: - centeredOffsetY

    func test_centeredOffsetY_middleOfContent_centersItem() {
        // Item de 100 pt dont le milieu est à 2050, fenêtre de 800 :
        // centrer = 2050 − 400 = 1650, loin des deux bords → pas de clamp.
        let offset = ScrollToMessageSettleLaw.centeredOffsetY(
            itemFrame: CGRect(x: 0, y: 2000, width: 390, height: 100),
            boundsHeight: 800,
            contentHeight: 10_000,
            topContentInset: 120,
            bottomContentInset: 60
        )
        XCTAssertEqual(offset, 1650)
    }

    func test_centeredOffsetY_itemNearContentStart_clampsToMinOffset() {
        // Item tout près du début du contenu (bas visuel de la liste
        // inversée) : le centrer demanderait un offset négatif au-delà du
        // repos — clamp au repos `-topContentInset`, comme `scrollToItem`.
        let offset = ScrollToMessageSettleLaw.centeredOffsetY(
            itemFrame: CGRect(x: 0, y: 10, width: 390, height: 80),
            boundsHeight: 800,
            contentHeight: 10_000,
            topContentInset: 120,
            bottomContentInset: 60
        )
        XCTAssertEqual(offset, -120)
    }

    func test_centeredOffsetY_itemNearContentEnd_clampsToMaxOffset() {
        // Item au bout du contenu (haut visuel) : clamp à
        // `contentHeight − bounds + bottomInset` = 10 000 − 800 + 60 = 9260.
        let offset = ScrollToMessageSettleLaw.centeredOffsetY(
            itemFrame: CGRect(x: 0, y: 9_950, width: 390, height: 50),
            boundsHeight: 800,
            contentHeight: 10_000,
            topContentInset: 120,
            bottomContentInset: 60
        )
        XCTAssertEqual(offset, 9260)
    }

    func test_centeredOffsetY_contentShorterThanViewport_neverBelowRest() {
        // Contenu plus court que la fenêtre : maxY < minY — le clamp doit
        // rendre le repos, jamais une valeur au-delà.
        let offset = ScrollToMessageSettleLaw.centeredOffsetY(
            itemFrame: CGRect(x: 0, y: 100, width: 390, height: 80),
            boundsHeight: 800,
            contentHeight: 300,
            topContentInset: 120,
            bottomContentInset: 60
        )
        XCTAssertEqual(offset, -120)
    }

    // MARK: - verdict

    func test_verdict_withinTolerance_isSettled() {
        XCTAssertEqual(
            ScrollToMessageSettleLaw.verdict(
                currentOffsetY: 1000,
                desiredOffsetY: 1000 + ScrollToMessageSettleLaw.tolerance,
                passesRemaining: 3
            ),
            .settled,
            "un écart À la tolérance est posé — re-viser coûterait une animation invisible"
        )
    }

    func test_verdict_beyondTolerance_withBudget_corrects() {
        XCTAssertEqual(
            ScrollToMessageSettleLaw.verdict(
                currentOffsetY: 1000,
                desiredOffsetY: 1400,
                passesRemaining: 1
            ),
            .correct(to: 1400)
        )
    }

    func test_verdict_beyondTolerance_budgetExhausted_givesUp() {
        XCTAssertEqual(
            ScrollToMessageSettleLaw.verdict(
                currentOffsetY: 1000,
                desiredOffsetY: 1400,
                passesRemaining: 0
            ),
            .giveUp,
            "budget épuisé ⇒ flash sur place plutôt qu'osciller sans fin"
        )
    }

    func test_pendingTarget_defaultBudget_isMaxCorrectionPasses() {
        let target = ScrollToMessageSettleLaw.PendingTarget(localId: "m1", strong: false)
        XCTAssertEqual(target.passesRemaining, ScrollToMessageSettleLaw.maxCorrectionPasses)
    }
}
