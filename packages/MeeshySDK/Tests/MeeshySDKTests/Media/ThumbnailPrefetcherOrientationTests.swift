import XCTest
import ImageIO
import CoreGraphics
import UniformTypeIdentifiers
@testable import MeeshySDK

/// **Les vignettes du préchargeur passent par le sous-échantillonneur unique,
/// orientation EXIF comprise (#11923).** Une photo prise téléphone tourné
/// (EXIF 6) sort DEBOUT, bornée à 300 px sur son plus grand côté.
final class ThumbnailPrefetcherOrientationTests: XCTestCase {

    func test_get_rendersAnExif6PhotoUpright() async throws {
        let prefetcher = ThumbnailPrefetcher(cache: DecodedImageCache())
        let key = "exif6-\(UUID().uuidString)"
        await prefetcher.saveToDisk(data: try Self.jpeg(width: 600, height: 300, orientation: 6), forKey: key)

        let image = try await XCTUnwrapAsync(await prefetcher.get(key: key))

        XCTAssertEqual(image.width, 150)
        XCTAssertEqual(image.height, 300)
    }

    func test_get_keepsAnUprightPhotoAsIs() async throws {
        let prefetcher = ThumbnailPrefetcher(cache: DecodedImageCache())
        let key = "upright-\(UUID().uuidString)"
        await prefetcher.saveToDisk(data: try Self.jpeg(width: 600, height: 300, orientation: 1), forKey: key)

        let image = try await XCTUnwrapAsync(await prefetcher.get(key: key))

        XCTAssertEqual(image.width, 300)
        XCTAssertEqual(image.height, 150)
    }

    private func XCTUnwrapAsync<T>(_ value: T?, file: StaticString = #filePath, line: UInt = #line) async throws -> T {
        try XCTUnwrap(value, file: file, line: line)
    }

    static func jpeg(width: Int, height: Int, orientation: Int) throws -> Data {
        let context = try XCTUnwrap(CGContext(data: nil, width: width, height: height, bitsPerComponent: 8,
                                              bytesPerRow: 0, space: CGColorSpaceCreateDeviceRGB(),
                                              bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue))
        context.setFillColor(red: 0.9, green: 0.2, blue: 0.1, alpha: 1)
        context.fill(CGRect(x: 0, y: 0, width: width, height: height))
        let image = try XCTUnwrap(context.makeImage())
        let output = NSMutableData()
        let destination = try XCTUnwrap(CGImageDestinationCreateWithData(output, UTType.jpeg.identifier as CFString, 1, nil))
        CGImageDestinationAddImage(destination, image, [kCGImagePropertyOrientation: orientation] as CFDictionary)
        XCTAssertTrue(CGImageDestinationFinalize(destination))
        return output as Data
    }
}
