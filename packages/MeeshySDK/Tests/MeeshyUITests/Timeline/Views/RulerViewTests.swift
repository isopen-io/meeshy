import XCTest
import SwiftUI
@testable import MeeshyUI

final class RulerViewTests: XCTestCase {

    func test_tickInterval_zoomedOut_returnsMultipleSeconds() {
        // 0.3x → 15 px/s → ticks every 5s
        XCTAssertEqual(RulerView.tickInterval(for: 0.3), 5.0, accuracy: 0.01)
    }

    func test_tickInterval_zoom1x_returnsOneSecond() {
        XCTAssertEqual(RulerView.tickInterval(for: 1.0), 1.0, accuracy: 0.01)
    }

    func test_tickInterval_zoomedIn_returnsHalfSecond() {
        XCTAssertEqual(RulerView.tickInterval(for: 5.0), 0.2, accuracy: 0.01)
    }

    func test_tickInterval_extremeZoom_returnsMillisecond() {
        XCTAssertEqual(RulerView.tickInterval(for: 15.0), 0.05, accuracy: 0.01)
    }

    // MARK: - L'invariant, plutôt qu'une table

    /// L'INVARIANT de la règle : deux libellés voisins ne doivent jamais se
    /// chevaucher, à aucun zoom atteignable.
    ///
    /// La table figée d'avant avait été écrite pour une plage de 25 %–400 % ;
    /// élargie à 5 %–800 % le 2026-07-20, elle n'a pas suivi et la règle
    /// devenait illisible en bas de course. Ce test balaie la plage réelle :
    /// une future extension des bornes ne peut plus passer inaperçue.
    func test_labelsNeverOverlap_acrossTheWholeZoomRange() {
        let range = TimelineScrubArea<EmptyView>.zoomRange
        var zoom = range.lowerBound
        while zoom <= range.upperBound {
            let interval = RulerView.tickInterval(for: zoom)
            let spacing = CGFloat(interval) * TimelineGeometry(zoomScale: zoom).pixelsPerSecond
            XCTAssertGreaterThanOrEqual(
                spacing, RulerView.minLabelSpacing,
                "zoom \(zoom) : graduation de \(interval)s → \(spacing) pt entre libellés"
            )
            zoom *= 1.15
        }
    }

    /// Au zoom minimal, une graduation toutes les 5 s tombait tous les 12,5 pt
    /// pour des libellés larges de ~24 pt : la règle affichait
    /// « 6s10452025308540455055… ».
    func test_tickInterval_atMinimumZoom_widensEnoughToStayReadable() {
        let interval = RulerView.tickInterval(for: TimelineScrubArea<EmptyView>.zoomRange.lowerBound)
        XCTAssertGreaterThanOrEqual(interval, 15.0)
    }

    /// La graduation reste choisie dans l'échelle « ronde » : une valeur
    /// calculée au plus juste (3,47 s) serait exacte et illisible.
    func test_tickInterval_alwaysComesFromTheLadder() {
        for zoom in [0.05, 0.08, 0.17, 0.42, 1.0, 2.3, 6.5, 8.0] as [CGFloat] {
            XCTAssertTrue(RulerView.tickLadder.contains(RulerView.tickInterval(for: zoom)),
                          "zoom \(zoom) produit une graduation hors échelle")
        }
    }

    /// Une graduation plus FINE que nécessaire gaspille la lisibilité : on
    /// prend la première qui tient, pas une plus grossière.
    func test_tickInterval_picksTheFinestThatFits() {
        for zoom in [0.05, 0.2, 1.0, 4.0] as [CGFloat] {
            let chosen = RulerView.tickInterval(for: zoom)
            guard let index = RulerView.tickLadder.firstIndex(of: chosen), index > 0 else { continue }
            let finer = RulerView.tickLadder[index - 1]
            let spacing = CGFloat(finer) * TimelineGeometry(zoomScale: zoom).pixelsPerSecond
            XCTAssertLessThan(spacing, RulerView.minLabelSpacing,
                              "zoom \(zoom) : \(finer)s tenait aussi, la règle est trop grossière")
        }
    }

    func test_format_msFormatting_under1s() {
        XCTAssertEqual(RulerView.formatTick(0.05), "50ms")
    }

    func test_format_secondsFormatting_under60s() {
        XCTAssertEqual(RulerView.formatTick(12.5), "12.5s")
    }

    func test_format_minutesFormatting_above60s() {
        XCTAssertEqual(RulerView.formatTick(125), "2:05")
    }
}
