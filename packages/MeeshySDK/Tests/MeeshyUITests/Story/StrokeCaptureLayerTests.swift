import XCTest
import PencilKit
import CoreGraphics
@testable import MeeshyUI
@testable import MeeshySDK

@MainActor
final class StrokeCaptureLayerTests: XCTestCase {

    // MARK: - Helpers

    private func point(_ x: CGFloat, _ y: CGFloat) -> PKStrokePoint {
        PKStrokePoint(location: CGPoint(x: x, y: y), timeOffset: 0,
                      size: CGSize(width: 5, height: 5), opacity: 1,
                      force: 1, azimuth: 0, altitude: 0)
    }

    private func drawing(_ controlPoints: [PKStrokePoint]) -> PKDrawing {
        let path = PKStrokePath(controlPoints: controlPoints, creationDate: Date())
        return PKDrawing(strokes: [PKStroke(ink: PKInk(.pen, color: .red), path: path)])
    }

    /// Bounds 540×960 with design 1080×1920 → uniform scale 2.0.
    private let bounds = CGRect(x: 0, y: 0, width: 540, height: 960)

    // MARK: - Tests

    func test_emptyDrawing_yieldsNone() {
        let event = StrokeCaptureLayer.extract(
            from: PKDrawing(strokes: []), bounds: bounds,
            tool: .pen, colorHex: "FF0000", width: 5, smoothing: .raw)
        XCTAssertEqual(event, .none)
    }

    func test_penStroke_committedWithDesignSpacePoints() {
        let d = drawing([point(100, 100), point(200, 150)])
        let event = StrokeCaptureLayer.extract(
            from: d, bounds: bounds,
            tool: .pen, colorHex: "00FF00", width: 7, smoothing: .curve)

        guard case .stroke(let stroke) = event else {
            return XCTFail("Expected .stroke, got \(event)")
        }
        XCTAssertEqual(stroke.colorHex, "00FF00")
        XCTAssertEqual(stroke.width, 7)
        XCTAssertEqual(stroke.tool, .pen)
        XCTAssertEqual(stroke.smoothing, .curve)
        // First captured point projected bounds→design at scale 2.
        let first = try? XCTUnwrap(stroke.points.first)
        XCTAssertEqual(first?.x ?? 0, 200, accuracy: 1.0)
        XCTAssertEqual(first?.y ?? 0, 200, accuracy: 1.0)
    }

    func test_eraserTool_doesNotCommitStroke_emitsErasePoints() {
        let d = drawing([point(50, 50), point(60, 60)])
        let event = StrokeCaptureLayer.extract(
            from: d, bounds: bounds,
            tool: .eraser, colorHex: "FFFFFF", width: 5, smoothing: .raw)

        guard case .erase(let points) = event else {
            return XCTFail("Expected .erase, got \(event)")
        }
        XCTAssertFalse(points.isEmpty)
        // First erase point projected to design space (scale 2).
        XCTAssertEqual(points.first?.x ?? 0, 100, accuracy: 1.0)
        XCTAssertEqual(points.first?.y ?? 0, 100, accuracy: 1.0)
    }

    func test_projectionScale_uniformMinRatio() {
        // Wide bounds: design/bounds → min(1080/1080, 1920/640)= min(1, 3)=1.
        let scale = StrokeCaptureLayer.projectionScale(
            bounds: CGRect(x: 0, y: 0, width: 1080, height: 640),
            designSize: CanvasGeometry.designSize)
        XCTAssertEqual(scale, 1.0, accuracy: 0.001)
    }

    func test_projectionScale_zeroBounds_returnsOne() {
        let scale = StrokeCaptureLayer.projectionScale(
            bounds: .zero, designSize: CanvasGeometry.designSize)
        XCTAssertEqual(scale, 1.0)
    }
}
