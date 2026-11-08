import XCTest
import CoreGraphics
@testable import MeeshyUI

final class ImageEditorCropGeometryTests: XCTestCase {

    private let display = CGRect(x: 10, y: 20, width: 200, height: 100)

    private func assertRect(_ actual: CGRect, _ expected: CGRect, accuracy: CGFloat = 0.0001,
                            file: StaticString = #filePath, line: UInt = #line) {
        XCTAssertEqual(actual.minX, expected.minX, accuracy: accuracy, file: file, line: line)
        XCTAssertEqual(actual.minY, expected.minY, accuracy: accuracy, file: file, line: line)
        XCTAssertEqual(actual.width, expected.width, accuracy: accuracy, file: file, line: line)
        XCTAssertEqual(actual.height, expected.height, accuracy: accuracy, file: file, line: line)
    }

    // MARK: fittedRect

    func test_fittedRect_wideImageInSquareContainer_letterboxesVertically() {
        let rect = ImageEditorCropGeometry.fittedRect(for: CGSize(width: 400, height: 200),
                                                      in: CGSize(width: 100, height: 100))
        assertRect(rect, CGRect(x: 0, y: 25, width: 100, height: 50))
    }

    func test_fittedRect_tallImageInSquareContainer_pillarboxesHorizontally() {
        let rect = ImageEditorCropGeometry.fittedRect(for: CGSize(width: 200, height: 400),
                                                      in: CGSize(width: 100, height: 100))
        assertRect(rect, CGRect(x: 25, y: 0, width: 50, height: 100))
    }

    func test_fittedRect_zeroImageSize_fillsContainer() {
        let rect = ImageEditorCropGeometry.fittedRect(for: .zero, in: CGSize(width: 80, height: 60))
        assertRect(rect, CGRect(x: 0, y: 0, width: 80, height: 60))
    }

    // MARK: centeredRect

    func test_centeredRect_squareAspect_isCenteredAndRespectsFill() {
        let rect = ImageEditorCropGeometry.centeredRect(aspect: 1, in: display, fill: 0.5)
        XCTAssertEqual(rect.width / rect.height, 1, accuracy: 0.0001)
        XCTAssertEqual(rect.midX, display.midX, accuracy: 0.0001)
        XCTAssertEqual(rect.midY, display.midY, accuracy: 0.0001)
        XCTAssertEqual(rect.height, 50, accuracy: 0.0001)
    }

    func test_centeredRect_wideAspect_isLimitedByWidth() {
        let rect = ImageEditorCropGeometry.centeredRect(aspect: 4, in: display, fill: 1)
        XCTAssertEqual(rect.width, 200, accuracy: 0.0001)
        XCTAssertEqual(rect.height, 50, accuracy: 0.0001)
    }

    // MARK: initialCrop

    func test_initialCrop_withNormalizedRect_mapsIntoDisplayRect() {
        let rect = ImageEditorCropGeometry.initialCrop(
            normalized: CGRect(x: 0.25, y: 0.5, width: 0.5, height: 0.25),
            ratio: 1, in: display)
        assertRect(rect, CGRect(x: 60, y: 70, width: 100, height: 25))
    }

    func test_initialCrop_withRatioAndNoNormalized_isCenteredAtNinetyTwoPercent() {
        let rect = ImageEditorCropGeometry.initialCrop(normalized: nil, ratio: 1, in: display)
        assertRect(rect, ImageEditorCropGeometry.centeredRect(aspect: 1, in: display, fill: 0.92))
    }

    func test_initialCrop_freeAndNoNormalized_isDisplayRect() {
        let rect = ImageEditorCropGeometry.initialCrop(normalized: nil, ratio: nil, in: display)
        XCTAssertEqual(rect, display)
    }

    // MARK: crop(adjustedTo:)

    func test_cropAdjustedTo_ratio_keepsCentreAndRatioWithinDisplay() throws {
        let current = CGRect(x: 60, y: 45, width: 100, height: 50)
        let adjusted = try XCTUnwrap(ImageEditorCropGeometry.crop(current, adjustedTo: 1, in: display))
        XCTAssertEqual(adjusted.width / adjusted.height, 1, accuracy: 0.0001)
        XCTAssertEqual(adjusted.midX, current.midX, accuracy: 0.0001)
        XCTAssertEqual(adjusted.midY, current.midY, accuracy: 0.0001)
        XCTAssertTrue(display.contains(adjusted))
    }

    func test_cropAdjustedTo_ratioNearEdge_isClampedToDisplayRect() throws {
        let current = CGRect(x: 10, y: 20, width: 190, height: 95)
        let adjusted = try XCTUnwrap(ImageEditorCropGeometry.crop(current, adjustedTo: 9.0 / 16.0, in: display))
        XCTAssertTrue(display.contains(adjusted))
    }

    func test_cropAdjustedTo_nilRatioAndTinyRect_resetsToDisplayRect() {
        let tiny = CGRect(x: 50, y: 50, width: 30, height: 60)
        XCTAssertEqual(ImageEditorCropGeometry.crop(tiny, adjustedTo: nil, in: display), display)
    }

    func test_cropAdjustedTo_nilRatioAndLargeRect_returnsNil() {
        let large = CGRect(x: 20, y: 30, width: 100, height: 60)
        XCTAssertNil(ImageEditorCropGeometry.crop(large, adjustedTo: nil, in: display))
    }

    func test_cropAdjustedTo_degenerateDisplayRect_returnsNil() {
        let degenerate = CGRect(x: 0, y: 0, width: 1, height: 1)
        XCTAssertNil(ImageEditorCropGeometry.crop(CGRect(x: 0, y: 0, width: 1, height: 1),
                                                  adjustedTo: 1, in: degenerate))
    }

    // MARK: bake

    func test_bake_nearFullRect_returnsFullFrame() {
        XCTAssertEqual(ImageEditorCropGeometry.bake(cropRect: display, in: display), .fullFrame)
    }

    func test_bake_subRect_returnsNormalizedRegion() {
        let crop = CGRect(x: 60, y: 45, width: 100, height: 50)
        guard case .region(let region)? = ImageEditorCropGeometry.bake(cropRect: crop, in: display) else {
            return XCTFail("expected a region")
        }
        assertRect(region, CGRect(x: 0.25, y: 0.25, width: 0.5, height: 0.5))
    }

    func test_bake_tinyRect_returnsNil() {
        let tiny = CGRect(x: 60, y: 45, width: 2, height: 2)
        XCTAssertNil(ImageEditorCropGeometry.bake(cropRect: tiny, in: display))
    }

    func test_bake_degenerateCropRect_returnsNil() {
        XCTAssertNil(ImageEditorCropGeometry.bake(cropRect: .zero, in: display))
    }
}
