import XCTest
import ImageIO
import CoreGraphics
import UniformTypeIdentifiers
@testable import MeeshySDK

/// **Un seul sous-échantillonneur ImageIO (#11845).**
///
/// Quinze fichiers réécrivaient leurs options de `CGImageSourceCreateThumbnailAtIndex`.
/// L'atome `ImageDownsampler` les tient en un site : transformée EXIF toujours,
/// vignette toujours calculée depuis l'image (jamais la vignette embarquée),
/// décodage forcé seulement quand l'appelant connaît la taille affichée (#9872).
/// Les témoins portent sur les PIXELS rendus, pas seulement sur les clés.
final class ImageDownsamplerTests: XCTestCase {

    func test_options_holdTheSharedRules() {
        let displayed = ImageDownsampler.options(maxPixelSize: 128, decodeImmediately: true) as NSDictionary
        let deferred = ImageDownsampler.options(maxPixelSize: 2_048, decodeImmediately: false) as NSDictionary

        XCTAssertEqual(displayed[kCGImageSourceCreateThumbnailWithTransform] as? Bool, true)
        XCTAssertEqual(displayed[kCGImageSourceCreateThumbnailFromImageAlways] as? Bool, true)
        XCTAssertEqual(displayed[kCGImageSourceShouldCache] as? Bool, false)
        XCTAssertEqual(displayed[kCGImageSourceShouldCacheImmediately] as? Bool, true)
        XCTAssertEqual(deferred[kCGImageSourceShouldCacheImmediately] as? Bool, false)
        XCTAssertEqual(deferred[kCGImageSourceThumbnailMaxPixelSize] as? CGFloat, 2_048)
    }

    /// Une photo prise téléphone tourné (EXIF 6) sort DEBOUT, bornée sur son
    /// plus grand côté.
    func test_thumbnail_appliesTheExifOrientation_andBoundsTheLongestSide() throws {
        let data = try Self.jpeg(width: 400, height: 200, orientation: 6)

        let image = try XCTUnwrap(ImageDownsampler.thumbnail(data: data, maxPixelSize: 100, decodeImmediately: true))

        XCTAssertEqual(image.width, 50)
        XCTAssertEqual(image.height, 100)
    }

    func test_theThreeEntries_renderTheSamePixels() throws {
        let data = try Self.jpeg(width: 300, height: 180, orientation: 3)
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("downsampler-\(UUID().uuidString).jpg")
        try data.write(to: url)
        let source = try XCTUnwrap(CGImageSourceCreateWithData(data as CFData, nil))

        let fromData = try XCTUnwrap(ImageDownsampler.thumbnail(data: data, maxPixelSize: 120, decodeImmediately: true))
        let fromFile = try XCTUnwrap(ImageDownsampler.thumbnail(fileURL: url, maxPixelSize: 120, decodeImmediately: false))
        let fromSource = try XCTUnwrap(ImageDownsampler.thumbnail(source: source, maxPixelSize: 120, decodeImmediately: true))

        XCTAssertEqual(Self.pixels(fromData), Self.pixels(fromFile), "décoder tout de suite ou au dessin : mêmes pixels")
        XCTAssertEqual(Self.pixels(fromData), Self.pixels(fromSource))
    }

    func test_unreadableBytes_renderNothing() {
        XCTAssertNil(ImageDownsampler.thumbnail(data: Data("pas une image".utf8), maxPixelSize: 64, decodeImmediately: true))
    }

    // MARK: - Fixtures

    private static func jpeg(width: Int, height: Int, orientation: Int) throws -> Data {
        let context = try XCTUnwrap(CGContext(data: nil, width: width, height: height, bitsPerComponent: 8,
                                              bytesPerRow: 0, space: CGColorSpaceCreateDeviceRGB(),
                                              bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue))
        context.setFillColor(red: 0.9, green: 0.2, blue: 0.1, alpha: 1)
        context.fill(CGRect(x: 0, y: 0, width: width / 2, height: height))
        context.setFillColor(red: 0.1, green: 0.3, blue: 0.9, alpha: 1)
        context.fill(CGRect(x: width / 2, y: 0, width: width - width / 2, height: height))
        let image = try XCTUnwrap(context.makeImage())
        let output = NSMutableData()
        let destination = try XCTUnwrap(CGImageDestinationCreateWithData(output, UTType.jpeg.identifier as CFString, 1, nil))
        CGImageDestinationAddImage(destination, image, [kCGImagePropertyOrientation: orientation] as CFDictionary)
        XCTAssertTrue(CGImageDestinationFinalize(destination))
        return output as Data
    }

    private static func pixels(_ image: CGImage) -> Data? {
        image.dataProvider?.data as Data?
    }
}
