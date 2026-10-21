import XCTest
@testable import Meeshy

final class ColumnWidthLawTests: XCTestCase {

    func test_width_isBoundedBetween320And480() {
        XCTAssertEqual(ColumnWidthLaw.width(ratio: 0.38, windowWidth: 1366), 480)
        XCTAssertEqual(ColumnWidthLaw.width(ratio: 0.38, windowWidth: 678), 320)
        XCTAssertEqual(ColumnWidthLaw.width(ratio: 0.38, windowWidth: 1024), 389.12, accuracy: 0.0001)
        XCTAssertEqual(ColumnWidthLaw.width(ratio: .nan, windowWidth: 1024), 320)
        XCTAssertEqual(ColumnWidthLaw.width(ratio: 0.38, windowWidth: 0), 320)
    }

    func test_drag_followsTheFingerInPoints_andStopsAtTheBounds() {
        XCTAssertEqual(ColumnWidthLaw.dragged(from: 0.38, translation: 100, windowWidth: 1000), 0.48, accuracy: 0.0001)
        XCTAssertEqual(ColumnWidthLaw.dragged(from: 0.38, translation: 100, windowWidth: 1000), 0.48, accuracy: 0.0001)
        XCTAssertEqual(ColumnWidthLaw.dragged(from: 0.38, translation: 900, windowWidth: 1000), 0.48, accuracy: 0.0001)
        XCTAssertEqual(ColumnWidthLaw.dragged(from: 0.38, translation: -900, windowWidth: 1000), 0.32, accuracy: 0.0001)
        XCTAssertEqual(ColumnWidthLaw.dragged(from: 0.38, translation: 40, windowWidth: 1000), 0.42, accuracy: 0.0001)
    }

    func test_drag_ignoresAnUnmeasurableGesture() {
        XCTAssertEqual(ColumnWidthLaw.dragged(from: 0.38, translation: .nan, windowWidth: 1000), 0.38)
        XCTAssertEqual(ColumnWidthLaw.dragged(from: 0.38, translation: 40, windowWidth: 0), 0.38)
    }

    func test_restoredRatio_onANarrowerWindow_neverFallsUnder320() {
        XCTAssertGreaterThanOrEqual(ColumnWidthLaw.width(ratio: 0.35, windowWidth: 700), 320)
        let up = ColumnWidthLaw.stepped(0.40, by: 1, windowWidth: 1000)
        let down = ColumnWidthLaw.stepped(0.40, by: -1, windowWidth: 1000)
        XCTAssertEqual(up * 1000, 416, accuracy: 0.0001)
        XCTAssertEqual(down * 1000, 384, accuracy: 0.0001)
        XCTAssertEqual(ColumnWidthLaw.stepped(0.32, by: -1, windowWidth: 1000) * 1000, 320, accuracy: 0.0001)
        XCTAssertEqual(ColumnWidthLaw.stepped(0.48, by: 1, windowWidth: 1000) * 1000, 480, accuracy: 0.0001)
        XCTAssertEqual(ColumnWidthLaw.stepped(0.40, by: 1, windowWidth: 0), 0.40)
    }

    func test_iPadRoot_persistsTheRatioPerScene() throws {
        let code = AppSourceGuard.stripComments(try AppSourceGuard.unit("Meeshy/Features/Main/Views/iPadRootView.swift"))
        XCTAssertTrue(code.contains("@SceneStorage(\"meeshy.ipad.leftColumnRatio\")"))
        XCTAssertTrue(code.contains("leftColumnRatio: Double"))
        XCTAssertFalse(code.contains("@State private var leftColumnRatio"))
        XCTAssertFalse(code.contains("enum iPadColumnRatio"))
    }
}
