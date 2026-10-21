import XCTest
import UIKit
import QuartzCore
@testable import MeeshyUI
@testable import MeeshySDK

@MainActor
final class StoryMediaLayer_OffMainDecodeTests: XCTestCase {

    private func makeGeometry() -> CanvasGeometry {
        CanvasGeometry(renderSize: CGSize(width: 412, height: 732))
    }

    private func writeTempPNG(_ color: UIColor, side: Int = 4) throws -> URL {
        let size = CGSize(width: side, height: side)
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        let image = UIGraphicsImageRenderer(size: size, format: format).image { context in
            color.setFill()
            context.fill(CGRect(origin: .zero, size: size))
        }
        let data = try XCTUnwrap(image.pngData())
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("offmain-\(UUID().uuidString).png")
        try data.write(to: url, options: .atomic)
        return url
    }

    private func makeMedia(id: String, fileURL: URL) -> StoryMediaObject {
        StoryMediaObject(id: id, mediaURL: fileURL.absoluteString, kind: .image, aspectRatio: 1.0)
    }

    private func pixelWidth(of contents: Any?) -> Int? {
        guard let contents else { return nil }
        return (contents as! CGImage).width
    }

    func test_configure_offMainActor_fileURL_returnsBeforeDecoding() throws {
        let layer = StoryMediaLayer()
        let url = try writeTempPNG(.red)
        layer.configure(with: makeMedia(id: "m1", fileURL: url), geometry: makeGeometry(),
                        mode: .play, decodeTiming: .offMainActor)
        XCTAssertNil(layer.contents)
        XCTAssertNotNil(layer._currentImageLoadTaskForTesting())
    }

    func test_configure_offMainActor_fileURL_postsTheDecodedPixels() async throws {
        let layer = StoryMediaLayer()
        let url = try writeTempPNG(.red, side: 6)
        layer.configure(with: makeMedia(id: "m1", fileURL: url), geometry: makeGeometry(),
                        mode: .play, decodeTiming: .offMainActor)
        await layer._currentImageLoadTaskForTesting()?.value
        XCTAssertEqual(pixelWidth(of: layer.contents), 6)
    }

    func test_configure_offMainActor_reconfiguredToAnotherMedia_neverShowsTheFirstImage() async throws {
        let layer = StoryMediaLayer()
        let first = try writeTempPNG(.red, side: 6)
        let second = try writeTempPNG(.blue, side: 10)
        layer.configure(with: makeMedia(id: "A", fileURL: first), geometry: makeGeometry(),
                        mode: .play, decodeTiming: .offMainActor)
        let firstTask = layer._currentImageLoadTaskForTesting()
        layer.configure(with: makeMedia(id: "B", fileURL: second), geometry: makeGeometry(),
                        mode: .play, decodeTiming: .offMainActor)
        let secondTask = layer._currentImageLoadTaskForTesting()
        await firstTask?.value
        await secondTask?.value
        XCTAssertEqual(pixelWidth(of: layer.contents), 10)
    }

    func test_configure_offMainActor_composerCacheHit_staysSynchronous() throws {
        let layer = StoryMediaLayer()
        let url = try writeTempPNG(.red)
        let bitmap = try XCTUnwrap(UIImage(contentsOfFile: url.path))
        let reader = ComposerImageCacheReader(images: ["m1": bitmap], version: 0)
        layer.configure(with: makeMedia(id: "m1", fileURL: url), geometry: makeGeometry(),
                        mode: .edit, imageCache: reader, decodeTiming: .offMainActor)
        XCTAssertNotNil(layer.contents)
        XCTAssertNil(layer._currentImageLoadTaskForTesting())
    }

    func test_configure_immediate_fileURL_keepsContentsOnReturn() throws {
        let layer = StoryMediaLayer()
        let url = try writeTempPNG(.red)
        layer.configure(with: makeMedia(id: "m1", fileURL: url), geometry: makeGeometry(), mode: .play)
        XCTAssertNotNil(layer.contents)
    }

    func test_staticSnapshot_withFileURLForegroundImage_isNotBlank() throws {
        let url = try writeTempPNG(.red, side: 32)
        var media = makeMedia(id: "fg", fileURL: url)
        media.scale = 1.0
        let slide = StorySlide(effects: StoryEffects(background: "0000FF", mediaObjects: [media]))
        let snapshot = try XCTUnwrap(StoryStaticSnapshot.render(
            slide: slide, loadedImages: [:], size: CGSize(width: 100, height: 178)))
        let centre = try XCTUnwrap(centerPixel(of: snapshot))
        XCTAssertGreaterThan(centre.r, 150)
        XCTAssertLessThan(centre.b, 110)
    }

    private func centerPixel(of image: UIImage) -> (r: Int, g: Int, b: Int)? {
        guard let cg = image.cgImage else { return nil }
        let w = cg.width, h = cg.height
        var data = [UInt8](repeating: 0, count: w * h * 4)
        guard let ctx = CGContext(data: &data, width: w, height: h, bitsPerComponent: 8,
                                  bytesPerRow: w * 4, space: CGColorSpaceCreateDeviceRGB(),
                                  bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { return nil }
        ctx.draw(cg, in: CGRect(x: 0, y: 0, width: w, height: h))
        let index = ((h / 2) * w + (w / 2)) * 4
        return (Int(data[index]), Int(data[index + 1]), Int(data[index + 2]))
    }
}
