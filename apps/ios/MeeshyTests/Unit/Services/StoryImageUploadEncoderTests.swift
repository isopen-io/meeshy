import XCTest
import UIKit
import ImageIO
import UniformTypeIdentifiers
import MeeshySDK
@testable import Meeshy

/// #11847 — **une image de story part par les octets de son fichier** : ceux
/// de la prise, écrits une fois par le viseur, passent par la loi unique
/// (`OutgoingImagePreparer`) ; le lieu est retiré sans ré-encoder. Sans fichier
/// lisible, l'image décodée part en UNE génération, comme avant.
final class StoryImageUploadEncoderTests: XCTestCase {

    private static let policy = OutgoingImagePolicy(maxPixelDimension: 1080, compresses: false,
                                                    quality: OutgoingImagePolicy.perceptualQuality, keepsLocation: false)

    func test_aTakeWithItsFile_leavesByItsBytes_withoutItsLocation() async throws {
        let dossier = try Self.directory()
        defer { try? FileManager.default.removeItem(at: dossier) }
        let prise = try Self.geotaggedJPEG(in: dossier)

        let fichier = try await StoryImageUploadEncoder.temporaryFile(for: UIImage(), file: prise, policy: Self.policy)
        defer { try? FileManager.default.removeItem(at: fichier.url) }

        let octets = try Data(contentsOf: fichier.url)
        let source = try XCTUnwrap(CGImageSourceCreateWithData(octets as CFData, nil))
        let proprietes = try XCTUnwrap(CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any])
        XCTAssertNil(proprietes[kCGImagePropertyGPSDictionary], "le lieu de la prise ne part pas")
        XCTAssertEqual(proprietes[kCGImagePropertyPixelWidth] as? Int, 64, "la définition de la prise est gardée")
        XCTAssertEqual(fichier.mimeType, "image/jpeg")
        XCTAssertEqual(fichier.url.pathExtension, "jpg")
    }

    func test_withoutAFile_theDecodedImageLeavesAsAJPEG() async throws {
        let image = try Self.image()

        let fichier = try await StoryImageUploadEncoder.temporaryFile(for: image, file: nil, policy: Self.policy)
        defer { try? FileManager.default.removeItem(at: fichier.url) }

        XCTAssertEqual(fichier.mimeType, "image/jpeg")
        XCTAssertNotNil(UIImage(contentsOfFile: fichier.url.path))
    }

    func test_aMissingFile_fallsBackToTheDecodedImage() async throws {
        let image = try Self.image()
        let absent = FileManager.default.temporaryDirectory.appendingPathComponent("\(UUID().uuidString).jpg")

        let fichier = try await StoryImageUploadEncoder.temporaryFile(for: image, file: absent, policy: Self.policy)
        defer { try? FileManager.default.removeItem(at: fichier.url) }

        XCTAssertNotNil(UIImage(contentsOfFile: fichier.url.path))
    }

    func test_localFile_isOnlyALocalFileURL() {
        XCTAssertEqual(StoryImageUploadEncoder.localFile("file:///tmp/prise.heic")?.path, "/tmp/prise.heic")
        XCTAssertNil(StoryImageUploadEncoder.localFile("https://cdn.meeshy.me/prise.jpg"))
        XCTAssertNil(StoryImageUploadEncoder.localFile(nil))
    }

    // MARK: - Fabriques

    private static func directory() throws -> URL {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
        return url
    }

    private static func cgImage() throws -> CGImage {
        let space = try XCTUnwrap(CGColorSpace(name: CGColorSpace.sRGB))
        let context = try XCTUnwrap(CGContext(data: nil, width: 64, height: 48, bitsPerComponent: 8, bytesPerRow: 0,
                                              space: space, bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue))
        context.setFillColor(CGColor(srgbRed: 0.2, green: 0.5, blue: 0.8, alpha: 1))
        context.fill(CGRect(x: 0, y: 0, width: 64, height: 48))
        return try XCTUnwrap(context.makeImage())
    }

    private static func image() throws -> UIImage {
        UIImage(cgImage: try cgImage())
    }

    private static func geotaggedJPEG(in directory: URL) throws -> URL {
        let url = directory.appendingPathComponent("prise.jpg")
        let destination = try XCTUnwrap(CGImageDestinationCreateWithURL(url as CFURL, UTType.jpeg.identifier as CFString, 1, nil))
        let gps: [CFString: Any] = [
            kCGImagePropertyGPSLatitude: 48.8566, kCGImagePropertyGPSLatitudeRef: "N",
            kCGImagePropertyGPSLongitude: 2.3522, kCGImagePropertyGPSLongitudeRef: "E",
        ]
        CGImageDestinationAddImage(destination, try cgImage(), [kCGImagePropertyGPSDictionary: gps] as CFDictionary)
        XCTAssertTrue(CGImageDestinationFinalize(destination))
        return url
    }
}
