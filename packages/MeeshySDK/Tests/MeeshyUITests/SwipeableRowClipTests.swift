import SwiftUI
import XCTest
@testable import MeeshyUI

/// #10835 — la rangée de liste ne rogne que sur l'axe du glissement.
///
/// La rangée en focus de la liste des conversations dessine au-delà de sa
/// hauteur de layout (84 pt) : sa ligne de catégorie et d'étiquettes au-dessus
/// du nom, la pastille de mode et l'effectif sous l'aperçu. Un `.clipped()`
/// rectangulaire les coupait net, en haut comme en bas.
final class SwipeableRowClipTests: XCTestCase {

    private let rowRect = CGRect(x: 0, y: 0, width: 320, height: 84)

    func test_clip_keepsTheRowWidth_soSwipeActionsStayMasked() {
        let bounds = SwipeableRowClip().path(in: rowRect).boundingRect
        XCTAssertEqual(bounds.minX, rowRect.minX, accuracy: 0.001)
        XCTAssertEqual(bounds.maxX, rowRect.maxX, accuracy: 0.001)
    }

    func test_clip_letsTheFocusedRowOverflowVertically() {
        let bounds = SwipeableRowClip().path(in: rowRect).boundingRect
        // La rangée magnifiée déborde d'au moins 8 pt de chaque côté (la
        // respiration) — et davantage en grande taille de texte.
        XCTAssertLessThanOrEqual(bounds.minY, rowRect.minY - 200)
        XCTAssertGreaterThanOrEqual(bounds.maxY, rowRect.maxY + 200)
    }

    func test_clip_followsTheRowOrigin() {
        let shifted = CGRect(x: 24, y: 40, width: 200, height: 84)
        let bounds = SwipeableRowClip().path(in: shifted).boundingRect
        XCTAssertEqual(bounds.minX, 24, accuracy: 0.001)
        XCTAssertEqual(bounds.width, 200, accuracy: 0.001)
    }
}
