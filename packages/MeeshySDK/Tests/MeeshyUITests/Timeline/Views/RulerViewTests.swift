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

    // MARK: - Fenêtre visible (scène de deux heures)

    func test_tickIndices_withoutWindow_coversEveryTickOfAShortTimeline() {
        let range = RulerView.tickIndices(totalDuration: 60, interval: 1, pixelsPerSecond: 50, window: nil)
        XCTAssertEqual(range, 0..<61)
    }

    func test_tickIndices_twoHourScene_zoom1_drawsOnlyTheWindow() {
        let window = RulerView.visibleWindow(scrollX: 100_000, viewportWidth: 400)
        let range = RulerView.tickIndices(totalDuration: 7_200, interval: 1, pixelsPerSecond: 50, window: window)
        XCTAssertLessThan(range.count, 100, "7 201 graduations montées avant le fenêtrage")
        XCTAssertTrue(range.contains(2_000), "la graduation sous le doigt (100 000 pt = 2 000 s) doit exister")
    }

    func test_tickIndices_twoHourScene_neverExceedsAFewHundredTicksAtAnyZoom() {
        for zoom in stride(from: CGFloat(0.05), through: 8, by: 0.25) {
            let geometry = TimelineGeometry(zoomScale: zoom)
            let interval = RulerView.tickInterval(for: zoom)
            let width = geometry.pixelsPerSecond * 7_200
            for scrollX in [0, width / 3, width - 400] {
                let window = RulerView.visibleWindow(scrollX: scrollX, viewportWidth: 400)
                let range = RulerView.tickIndices(totalDuration: 7_200, interval: interval,
                                                  pixelsPerSecond: geometry.pixelsPerSecond, window: window)
                XCTAssertLessThan(range.count, 300, "zoom \(zoom) scrollX \(scrollX)")
            }
        }
    }

    func test_tickIndices_windowBeyondTheEnd_isEmptyNotCrashing() {
        let range = RulerView.tickIndices(totalDuration: 10, interval: 1, pixelsPerSecond: 50,
                                          window: 100_000...101_000)
        XCTAssertTrue(range.isEmpty)
    }

    func test_tickIndices_windowKeepsTheTickJustLeftOfTheViewport() {
        let window = RulerView.visibleWindow(scrollX: 5_000, viewportWidth: 400)
        let range = RulerView.tickIndices(totalDuration: 7_200, interval: 1, pixelsPerSecond: 50, window: window)
        XCTAssertTrue(range.contains(99), "5 000 pt = 100 s : la graduation 99 s reste dessinée en marge")
    }

    func test_visibleWindow_isStableWhileScrollingInsideAChunk() {
        XCTAssertEqual(RulerView.visibleWindow(scrollX: 410, viewportWidth: 400),
                       RulerView.visibleWindow(scrollX: 790, viewportWidth: 400),
                       "le corps de la règle ne doit pas être recalculé à chaque image de défilement")
    }

    func test_visibleWindow_beforeTheViewportIsMeasured_isStillBounded() {
        let window = RulerView.visibleWindow(scrollX: 0, viewportWidth: 0)
        XCTAssertLessThan(window.upperBound - window.lowerBound, 5_000)
    }
}
