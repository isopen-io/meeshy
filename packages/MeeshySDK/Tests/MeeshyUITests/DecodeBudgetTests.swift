import XCTest
@testable import MeeshyUI

final class DecodeBudgetTests: XCTestCase {

    private func display(_ width: CGFloat, _ height: CGFloat, scale: CGFloat) -> DisplayMetrics {
        DisplayMetrics(points: CGSize(width: width, height: height), scale: scale)
    }

    func test_maxPixelWidth_fullscreen_isTheDisplayWidthTimesScale() {
        XCTAssertEqual(DecodeBudget.maxPixelWidth(for: .fullscreen, on: display(390, 844, scale: 3)), 1170)
    }

    func test_maxPixelWidth_fitting_takesTheLargerSide() {
        let phone = display(390, 844, scale: 2)
        XCTAssertEqual(DecodeBudget.maxPixelWidth(for: .fitting(CGSize(width: 40, height: 120)), on: phone), 240)
        XCTAssertEqual(DecodeBudget.maxPixelWidth(for: .fitting(CGSize(width: 120, height: 40)), on: phone), 240)
    }

    func test_maxPixelWidth_fullBleed_isNeverNarrowerThanTheDisplay() {
        XCTAssertEqual(DecodeBudget.maxPixelWidth(for: .fullBleed(height: 180), on: display(390, 844, scale: 3)), 1170)
        XCTAssertEqual(DecodeBudget.maxPixelWidth(for: .fullBleed(height: 1600), on: display(390, 844, scale: 2)), 3200)
    }

    func test_targetWidthPx_roundsToTheNearestPixel() {
        XCTAssertEqual(DecodeBudget.targetWidthPx(for: .fullscreen, on: display(375, 812, scale: 2.5)), 938)
    }

    func test_fitting_isMonotonicInScale() {
        let size = CGSize(width: 60, height: 60)
        let low = DecodeBudget.maxPixelWidth(for: .fitting(size), on: display(390, 844, scale: 2))
        let high = DecodeBudget.maxPixelWidth(for: .fitting(size), on: display(390, 844, scale: 3))
        XCTAssertLessThan(low, high)
    }

    @MainActor
    func test_physicalDisplay_isTheMainScreen() {
        let measured = WindowMetrics.physicalDisplay
        XCTAssertEqual(measured, DisplayMetrics(points: UIScreen.main.bounds.size, scale: UIScreen.main.scale))
    }

    @MainActor
    func test_mainActorReader_equalsThePureLawOnThePhysicalDisplay() {
        let measured = WindowMetrics.physicalDisplay
        let surfaces: [DecodeBudget.Surface] = [.fullscreen, .fitting(CGSize(width: 50, height: 80)), .fullBleed(height: 120)]
        for surface in surfaces {
            XCTAssertEqual(DecodeBudget.maxPixelWidth(for: surface), DecodeBudget.maxPixelWidth(for: surface, on: measured))
        }
    }
}
