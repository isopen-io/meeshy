import XCTest
import ImageIO
import CoreGraphics
import UniformTypeIdentifiers
@testable import MeeshyUI

/// **Les vignettes de la boutique de packs passent par le sous-échantillonneur
/// unique (#11923).** Un PNG de pack n'a, en principe, aucune orientation : il
/// sort tel quel. Une image qui en porte une sort debout, comme partout ailleurs.
final class PackImageDecoderOrientationTests: XCTestCase {

    func test_thumbnail_rendersAnExif6ImageUpright() async throws {
        let image = try await XCTUnwrapValue(await PackImageDecoder.thumbnail(
            try Self.image(width: 400, height: 200, orientation: 6, type: .jpeg), maxPixelSize: 100))

        XCTAssertEqual(image.size.width * image.scale, 50)
        XCTAssertEqual(image.size.height * image.scale, 100)
    }

    func test_thumbnail_keepsAPackPNG_asDrawn() async throws {
        let image = try await XCTUnwrapValue(await PackImageDecoder.thumbnail(
            try Self.image(width: 400, height: 200, orientation: nil, type: .png), maxPixelSize: 100))

        XCTAssertEqual(image.size.width * image.scale, 100)
        XCTAssertEqual(image.size.height * image.scale, 50)
    }

    private func XCTUnwrapValue<T>(_ value: T?, file: StaticString = #filePath, line: UInt = #line) async throws -> T {
        try XCTUnwrap(value, file: file, line: line)
    }

    private static func image(width: Int, height: Int, orientation: Int?, type: UTType) throws -> Data {
        let context = try XCTUnwrap(CGContext(data: nil, width: width, height: height, bitsPerComponent: 8,
                                              bytesPerRow: 0, space: CGColorSpaceCreateDeviceRGB(),
                                              bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue))
        context.setFillColor(red: 0.2, green: 0.6, blue: 0.3, alpha: 1)
        context.fill(CGRect(x: 0, y: 0, width: width, height: height))
        let cgImage = try XCTUnwrap(context.makeImage())
        let output = NSMutableData()
        let destination = try XCTUnwrap(CGImageDestinationCreateWithData(output, type.identifier as CFString, 1, nil))
        let properties = orientation.map { [kCGImagePropertyOrientation: $0] as CFDictionary }
        CGImageDestinationAddImage(destination, cgImage, properties)
        XCTAssertTrue(CGImageDestinationFinalize(destination))
        return output as Data
    }
}
