import XCTest
import ImageIO
import UniformTypeIdentifiers
@testable import Meeshy

/// **La photo qui part garde l'EXIF de la prise** (décision porteur 2026-10-04, #9347).
@MainActor
final class ComposerPhotoEncodingTests: XCTestCase {

    func test_encoded_keepsTheTakeMetadata_uprightAndAtTheRenderedSize() throws {
        let prise = try XCTUnwrap(Self.takeWithExif())
        let rendu = ComposerLookPainterTests.cgSource()
        let octets = try XCTUnwrap(ComposerPhotoEncoding.encoded(rendu, like: prise))
        let source = try XCTUnwrap(CGImageSourceCreateWithData(octets as CFData, nil))
        let lu = try XCTUnwrap(CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any])
        let exif = try XCTUnwrap(lu[kCGImagePropertyExifDictionary] as? [CFString: Any])
        XCTAssertEqual(exif[kCGImagePropertyExifDateTimeOriginal] as? String, "2026:10:04 09:30:00", "la date de PRISE reste")
        XCTAssertNotNil(lu[kCGImagePropertyGPSDictionary], "le lieu de prise reste")
        XCTAssertEqual(lu[kCGImagePropertyOrientation] as? Int, 1, "les pixels sont debout : l'orientation d'origine mentirait")
        XCTAssertEqual(lu[kCGImagePropertyPixelWidth] as? Int, 300)
        XCTAssertEqual(lu[kCGImagePropertyPixelHeight] as? Int, 400)
        XCTAssertEqual(CGImageSourceGetType(source) as String?, UTType.jpeg.identifier, "le type de la prise")
    }

    func test_encoded_withoutTake_isAPlainJpeg() throws {
        let octets = try XCTUnwrap(ComposerPhotoEncoding.encoded(ComposerLookPainterTests.cgSource(), like: nil))
        let source = try XCTUnwrap(CGImageSourceCreateWithData(octets as CFData, nil))
        XCTAssertEqual(CGImageSourceGetType(source) as String?, UTType.jpeg.identifier)
    }

    func test_fileName_followsTheEncodedType() throws {
        let jpeg = try XCTUnwrap(ComposerPhotoEncoding.encoded(ComposerLookPainterTests.cgSource(), like: nil))
        XCTAssertEqual(ComposerPhotoEncoding.fileName(for: jpeg, id: "abc"), "Meeshy_abc.jpg")
    }

    func test_rawTake_isSavedAsItsOriginalBytes() throws {
        let racine = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
        let camera = AppSourceGuard.stripComments(try String(contentsOf: racine.appendingPathComponent(
            "Meeshy/Features/Main/Components/CameraModel.swift"), encoding: .utf8))
        XCTAssertTrue(camera.contains("PhotoLibraryManager.shared.saveImageFile(data"),
                      "le brut part octets tels quels : saveImage(_ data:) repasse par UIImage et perd l'EXIF")
    }

    /// Une prise JPEG 40×30 couchée (orientation 6), datée, géolocalisée.
    static func takeWithExif() -> Data? {
        let contexte = CGContext(data: nil, width: 40, height: 30, bitsPerComponent: 8, bytesPerRow: 0,
                                 space: CGColorSpaceCreateDeviceRGB(),
                                 bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)
        guard let image = contexte?.makeImage() else { return nil }
        let sortie = NSMutableData()
        guard let destination = CGImageDestinationCreateWithData(sortie as CFMutableData, UTType.jpeg.identifier as CFString, 1, nil)
        else { return nil }
        let proprietes: [CFString: Any] = [
            kCGImagePropertyOrientation: 6,
            kCGImagePropertyExifDictionary: [kCGImagePropertyExifDateTimeOriginal: "2026:10:04 09:30:00"],
            kCGImagePropertyGPSDictionary: [kCGImagePropertyGPSLatitude: 48.85, kCGImagePropertyGPSLatitudeRef: "N"],
        ]
        CGImageDestinationAddImage(destination, image, proprietes as CFDictionary)
        return CGImageDestinationFinalize(destination) ? sortie as Data : nil
    }
}
