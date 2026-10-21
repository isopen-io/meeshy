import XCTest
import CoreGraphics
@testable import MeeshyUI

final class CropGeometryTests: XCTestCase {

    private let rect = CGRect(x: 10, y: 10, width: 100, height: 100)
    private let minSize: CGFloat = 56

    private func resized(_ handle: CropOverlayHandle, _ t: CGSize, ratio: Double? = nil,
                         from start: CGRect? = nil) -> CGRect {
        CropGeometry.resized(start ?? rect, handle: handle, translation: t, aspectRatio: ratio, minSize: minSize)
    }

    func test_resized_topLeft_withoutRatio_matchesFingerAlgorithm() {
        XCTAssertEqual(resized(.topLeft, CGSize(width: 5, height: 5)), CGRect(x: 15, y: 15, width: 95, height: 95))
    }

    func test_resized_topRight_withoutRatio_matchesFingerAlgorithm() {
        XCTAssertEqual(resized(.topRight, CGSize(width: 5, height: -7)), CGRect(x: 10, y: 3, width: 105, height: 107))
    }

    func test_resized_bottomLeft_withoutRatio_matchesFingerAlgorithm() {
        XCTAssertEqual(resized(.bottomLeft, CGSize(width: -4, height: 6)), CGRect(x: 6, y: 10, width: 104, height: 106))
    }

    func test_resized_bottomRight_withoutRatio_matchesFingerAlgorithm() {
        XCTAssertEqual(resized(.bottomRight, CGSize(width: 8, height: 9)), CGRect(x: 10, y: 10, width: 108, height: 109))
    }

    func test_resized_edges_withoutRatio_matchFingerAlgorithm() {
        XCTAssertEqual(resized(.top, CGSize(width: 50, height: 5)), CGRect(x: 10, y: 15, width: 100, height: 95))
        XCTAssertEqual(resized(.bottom, CGSize(width: 50, height: 5)), CGRect(x: 10, y: 10, width: 100, height: 105))
        XCTAssertEqual(resized(.left, CGSize(width: 5, height: 50)), CGRect(x: 15, y: 10, width: 95, height: 100))
        XCTAssertEqual(resized(.right, CGSize(width: 5, height: 50)), CGRect(x: 10, y: 10, width: 105, height: 100))
    }

    func test_resized_center_translatesWithoutResizing() {
        XCTAssertEqual(resized(.center, CGSize(width: 3, height: -2)), CGRect(x: 13, y: 8, width: 100, height: 100))
    }

    func test_resized_none_returnsRectUnchanged() {
        XCTAssertEqual(resized(.none, CGSize(width: 30, height: 30)), rect)
    }

    func test_resized_corners_withRatio_keepRatio() {
        let result = resized(.bottomRight, CGSize(width: 10, height: 0), ratio: 2)
        XCTAssertEqual(result.width, 110)
        XCTAssertEqual(result.height, 105)
        let topLeft = resized(.topLeft, CGSize(width: 6, height: 9), ratio: 1)
        XCTAssertEqual(topLeft, CGRect(x: 16, y: 16, width: 94, height: 94))
    }

    func test_resized_belowMinSize_returnsRectUnchanged() {
        XCTAssertEqual(resized(.right, CGSize(width: -60, height: 0)), rect)
    }

    func test_constrained_clampsSizeAndOriginInsideBounds() {
        let bounds = CGRect(x: 0, y: 0, width: 200, height: 200)
        let oversized = CGRect(x: -20, y: 150, width: 300, height: 80)
        XCTAssertEqual(CropGeometry.constrained(oversized, to: bounds, minSize: minSize),
                       CGRect(x: 0, y: 120, width: 200, height: 80))
    }

    func test_step_isOnePercentOfBounds() {
        XCTAssertEqual(CropGeometry.step(in: CGRect(x: 0, y: 0, width: 400, height: 300)),
                       CGSize(width: 4, height: 3))
    }

    func test_outward_growsFromTheGrabbedHandle_oppositeCornerFixed() {
        let step = CGSize(width: 4, height: 3)
        let grown = CropGeometry.resized(rect, handle: .topLeft,
                                         translation: CropGeometry.outward(.topLeft, step: step),
                                         aspectRatio: nil, minSize: minSize)
        XCTAssertEqual(grown.maxX, rect.maxX)
        XCTAssertEqual(grown.maxY, rect.maxY)
        XCTAssertEqual(grown.width, 104)
        let shrunk = CropGeometry.resized(rect, handle: .topLeft,
                                          translation: CropGeometry.outward(.topLeft, step: CGSize(width: -4, height: -3)),
                                          aspectRatio: nil, minSize: minSize)
        XCTAssertEqual(shrunk.width, 96)
    }

    func test_outward_edgesMoveOnlyAlongTheirAxis() {
        let step = CGSize(width: 4, height: 3)
        XCTAssertEqual(CropGeometry.outward(.right, step: step), CGSize(width: 4, height: 0))
        XCTAssertEqual(CropGeometry.outward(.top, step: step), CGSize(width: 0, height: -3))
        XCTAssertEqual(CropGeometry.outward(.bottomRight, step: step), CGSize(width: 4, height: 3))
    }

    func test_scaledUniformly_keepsCenterAndRatio() {
        let start = CGRect(x: 100, y: 100, width: 200, height: 100)
        let grown = CropGeometry.scaledUniformly(start, step: CGSize(width: 4, height: 3),
                                                 aspectRatio: nil, grow: true, minSize: minSize)
        XCTAssertEqual(grown.midX, start.midX, accuracy: 0.0001)
        XCTAssertEqual(grown.midY, start.midY, accuracy: 0.0001)
        XCTAssertEqual(grown.width / grown.height, 2, accuracy: 0.0001)
        XCTAssertGreaterThan(grown.width, start.width)
    }

    func test_scaledUniformly_belowMinSize_returnsRectUnchanged() {
        let tiny = CGRect(x: 0, y: 0, width: 56, height: 56)
        XCTAssertEqual(CropGeometry.scaledUniformly(tiny, step: CGSize(width: 4, height: 3),
                                                    aspectRatio: nil, grow: false, minSize: 56), tiny)
    }

    func test_contained_freeRatio_clipsTheMovingEdge_lockedRatio_rejects() {
        let bounds = CGRect(x: 0, y: 0, width: 200, height: 200)
        let overshoot = CGRect(x: 100, y: 10, width: 105, height: 100)
        XCTAssertEqual(CropGeometry.contained(overshoot, in: bounds, keepsRatio: false),
                       CGRect(x: 100, y: 10, width: 100, height: 100))
        XCTAssertNil(CropGeometry.contained(overshoot, in: bounds, keepsRatio: true))
        XCTAssertEqual(CropGeometry.contained(rect, in: bounds, keepsRatio: true), rect)
    }

    func test_percentages_reportsFrameRelativeToImage() {
        let p = CropGeometry.percentages(CGRect(x: 40, y: 30, width: 200, height: 150),
                                         in: CGRect(x: 0, y: 0, width: 400, height: 300))
        XCTAssertEqual(p.x, 0.1, accuracy: 0.0001)
        XCTAssertEqual(p.y, 0.1, accuracy: 0.0001)
        XCTAssertEqual(p.width, 0.5, accuracy: 0.0001)
        XCTAssertEqual(p.height, 0.5, accuracy: 0.0001)
    }

    func test_percentages_onEmptyImage_isZero() {
        let p = CropGeometry.percentages(rect, in: .zero)
        XCTAssertEqual(p.width, 0)
        XCTAssertEqual(p.height, 0)
    }
}
