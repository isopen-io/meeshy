import XCTest
import SwiftUI
@testable import MeeshyUI

/// `ScrollViewProxy.scrollTo(id:)` vise la position de LAYOUT de la vue
/// identifiée. Une ancre déplacée par `.offset(x:)` garde des bounds à
/// l'origine — le rendu bouge, le layout non —, si bien que le scroll
/// programmatique ne partait jamais : ni l'auto-follow du playhead pendant la
/// lecture (le playhead sortait du viewport et n'y revenait plus), ni la
/// poignée de défilement sous les pistes.
///
/// Le test mesure ce qui décide : la LARGEUR occupée par l'ancre. Une ancre
/// portée par le layout à `x` mesure `x + 1` ; une ancre décalée par `.offset`
/// mesure 1, quel que soit `x`.
@MainActor
final class TimelineScrollAnchorTests: XCTestCase {

    private func measuredWidth(x: CGFloat) -> CGFloat {
        let host = UIHostingController(
            rootView: TimelineScrollAnchor(x: x, anchorId: "anchor-under-test")
        )
        host.view.setNeedsLayout()
        host.view.layoutIfNeeded()
        return host.sizeThatFits(in: CGSize(width: .max, height: .max)).width
    }

    func test_anchorAtOrigin_occupiesOnlyItsOwnPoint() {
        XCTAssertEqual(measuredWidth(x: 0), 1, accuracy: 0.5)
    }

    func test_anchorCarriesItsOffsetInTheLayout() {
        XCTAssertEqual(measuredWidth(x: 240), 241, accuracy: 0.5)
    }

    func test_anchorFarDownTheLane_stillCarriesItsOffset() {
        XCTAssertEqual(measuredWidth(x: 1800), 1801, accuracy: 0.5)
    }

    /// Un décalage négatif ne doit pas rétrécir l'ancre sous son propre point —
    /// le playhead est clampé à zéro, mais une largeur négative casserait le
    /// layout de tout le contenu défilant.
    func test_negativeOffsetIsClampedToZero() {
        XCTAssertEqual(measuredWidth(x: -50), 1, accuracy: 0.5)
    }
}
