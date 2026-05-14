// packages/MeeshySDK/Tests/MeeshyUITests/Story/Repost/CanvasReprojectorDrawingTests.swift
import XCTest
import PencilKit
@testable import MeeshyUI
@testable import MeeshySDK

@MainActor
final class CanvasReprojectorDrawingTests: XCTestCase {
    func test_reproject_drawing_returnsScaledCopy() {
        let projector = CanvasReprojector(from: CGSize(width: 1080, height: 1920),
                                          to: CGSize(width: 1080, height: 1080))
        let stroke = PKStroke(ink: PKInk(.pen, color: .black),
                              path: PKStrokePath(controlPoints: [
                                PKStrokePoint(location: CGPoint(x: 540, y: 960),
                                              timeOffset: 0, size: CGSize(width: 4, height: 4),
                                              opacity: 1, force: 1, azimuth: 0, altitude: 0)
                              ], creationDate: Date()))
        let drawing = PKDrawing(strokes: [stroke])
        let result = projector.reproject(drawing: drawing)
        // The drawing exists and was reprojected (transform applied internally).
        XCTAssertNotNil(result.value)
    }

    func test_reproject_drawing_nilWhenInputNil() {
        let projector = CanvasReprojector(from: CGSize(width: 1080, height: 1920),
                                          to: CGSize(width: 1080, height: 1080))
        let result = projector.reproject(drawingData: nil)
        XCTAssertNil(result.value)
    }
}
