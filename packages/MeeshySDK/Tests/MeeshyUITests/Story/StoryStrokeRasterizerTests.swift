import XCTest
import UIKit
@testable import MeeshyUI
@testable import MeeshySDK

@MainActor
final class StoryStrokeRasterizerTests: XCTestCase {

    private func stroke(points: [CGPoint],
                        colorHex: String = "FF0000",
                        width: Double = 40,
                        tool: StrokeTool = .pen) -> StoryDrawingStroke {
        StoryDrawingStroke(
            points: points.map { StoryDrawingStrokePoint(x: $0.x, y: $0.y) },
            colorHex: colorHex,
            width: width,
            tool: tool,
            smoothing: .raw
        )
    }

    func test_emptyStrokes_returnsNil() {
        XCTAssertNil(StoryStrokeRasterizer.image(strokes: [], scale: 1))
    }

    func test_eraserOnlyStrokes_returnsNil() {
        let eraser = stroke(points: [CGPoint(x: 0, y: 0), CGPoint(x: 100, y: 100)], tool: .eraser)
        XCTAssertNil(StoryStrokeRasterizer.image(strokes: [eraser], scale: 1))
    }

    func test_emptyPointStroke_returnsNil() {
        XCTAssertNil(StoryStrokeRasterizer.image(strokes: [stroke(points: [])], scale: 1))
    }

    func test_penStroke_producesImageOfDesignSizeAtScale() {
        let s = stroke(points: [CGPoint(x: 100, y: 960), CGPoint(x: 980, y: 960)])
        let img = StoryStrokeRasterizer.image(strokes: [s], scale: 2)
        let unwrapped = try? XCTUnwrap(img)
        XCTAssertEqual(unwrapped?.size, CanvasGeometry.designSize)
        XCTAssertEqual(unwrapped?.scale, 2)
    }

    /// Mitige le Risque #1 du plan : le bake doit réellement peindre les pixels du
    /// trait. On dessine une ligne rouge horizontale épaisse au centre et on
    /// échantillonne un pixel sur la ligne — il doit être rouge, pas transparent.
    func test_redLine_paintsRedPixelsOnTheLine() throws {
        let s = stroke(points: [CGPoint(x: 100, y: 960), CGPoint(x: 980, y: 960)],
                       colorHex: "FF0000", width: 60)
        let img = try XCTUnwrap(StoryStrokeRasterizer.image(strokes: [s], scale: 1))
        let cg = try XCTUnwrap(img.cgImage)

        let sample = pixel(in: cg, x: 540, y: 960)
        XCTAssertGreaterThan(sample.r, 200, "Le pixel sur la ligne doit être rouge")
        XCTAssertLessThan(sample.g, 60)
        XCTAssertLessThan(sample.b, 60)
        XCTAssertGreaterThan(sample.a, 200, "Le pixel sur la ligne doit être opaque")
    }

    func test_offLine_pixelIsTransparent() throws {
        let s = stroke(points: [CGPoint(x: 100, y: 960), CGPoint(x: 980, y: 960)],
                       colorHex: "FF0000", width: 60)
        let img = try XCTUnwrap(StoryStrokeRasterizer.image(strokes: [s], scale: 1))
        let cg = try XCTUnwrap(img.cgImage)

        // Coin haut-gauche, loin de la ligne centrale → transparent.
        let sample = pixel(in: cg, x: 20, y: 20)
        XCTAssertLessThan(sample.a, 20, "Hors trait, le pixel doit rester transparent")
    }

    // MARK: - Pixel sampling helper

    private struct RGBA { let r: Int; let g: Int; let b: Int; let a: Int }

    private func pixel(in cgImage: CGImage, x: Int, y: Int) -> RGBA {
        let width = cgImage.width
        let height = cgImage.height
        var data = [UInt8](repeating: 0, count: width * height * 4)
        let colorSpace = CGColorSpaceCreateDeviceRGB()
        let bitmapInfo = CGImageAlphaInfo.premultipliedLast.rawValue
        let context = CGContext(data: &data,
                                width: width, height: height,
                                bitsPerComponent: 8, bytesPerRow: width * 4,
                                space: colorSpace, bitmapInfo: bitmapInfo)
        context?.draw(cgImage, in: CGRect(x: 0, y: 0, width: width, height: height))
        let offset = (y * width + x) * 4
        return RGBA(r: Int(data[offset]), g: Int(data[offset + 1]),
                    b: Int(data[offset + 2]), a: Int(data[offset + 3]))
    }
}
