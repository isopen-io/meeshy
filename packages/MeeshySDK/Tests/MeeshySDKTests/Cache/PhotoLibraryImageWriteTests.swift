import XCTest
import ImageIO
import UniformTypeIdentifiers
@testable import MeeshySDK

/// #9685 — une image part vers Photos SANS décodage `UIImage` : le format se lit dans
/// l'en-tête, les octets acceptés partent tels quels, les autres sont ré-encodés par ImageIO.
final class PhotoLibraryImageWriteTests: XCTestCase {

    private func encoded(_ type: UTType) throws -> Data {
        let context = try XCTUnwrap(CGContext(data: nil, width: 4, height: 4, bitsPerComponent: 8, bytesPerRow: 0,
                                              space: CGColorSpaceCreateDeviceRGB(),
                                              bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue))
        context.setFillColor(red: 1, green: 0, blue: 0, alpha: 1)
        context.fill(CGRect(x: 0, y: 0, width: 4, height: 4))
        let image = try XCTUnwrap(context.makeImage())
        let output = NSMutableData()
        let destination = try XCTUnwrap(CGImageDestinationCreateWithData(output as CFMutableData, type.identifier as CFString, 1, nil))
        CGImageDestinationAddImage(destination, image, nil)
        XCTAssertTrue(CGImageDestinationFinalize(destination))
        return output as Data
    }

    func test_decide_jpegAndPng_goAsIs() throws {
        XCTAssertEqual(PhotoLibraryImageWrite.decide(data: try encoded(.jpeg)), .asIs)
        XCTAssertEqual(PhotoLibraryImageWrite.decide(data: try encoded(.png)), .asIs)
    }

    func test_decide_heicGifTiffAndRaw_goAsIs() {
        XCTAssertEqual(PhotoLibraryImageWrite.decide(typeIdentifier: UTType.heic.identifier), .asIs)
        XCTAssertEqual(PhotoLibraryImageWrite.decide(typeIdentifier: UTType.gif.identifier), .asIs)
        XCTAssertEqual(PhotoLibraryImageWrite.decide(typeIdentifier: UTType.tiff.identifier), .asIs)
        XCTAssertEqual(PhotoLibraryImageWrite.decide(typeIdentifier: "com.adobe.raw-image"), .asIs)
    }

    func test_decide_imageFormatPhotosRefuses_isTranscoded() {
        XCTAssertEqual(PhotoLibraryImageWrite.decide(typeIdentifier: UTType.webP.identifier), .transcode)
        XCTAssertEqual(PhotoLibraryImageWrite.decide(typeIdentifier: UTType.bmp.identifier), .transcode)
    }

    func test_decide_notAnImage_isRejected() {
        XCTAssertEqual(PhotoLibraryImageWrite.decide(data: Data([0x00, 0x01, 0x02])), .rejected)
        XCTAssertEqual(PhotoLibraryImageWrite.decide(typeIdentifier: UTType.mpeg4Movie.identifier), .rejected)
        XCTAssertEqual(PhotoLibraryImageWrite.decide(typeIdentifier: nil), .rejected)
    }

    func test_decide_fileWithoutExtension_readsTheHeader() throws {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("photo-write-\(UUID().uuidString)")
        try encoded(.png).write(to: url)
        defer { try? FileManager.default.removeItem(at: url) }
        XCTAssertEqual(PhotoLibraryImageWrite.typeIdentifier(ofFileAt: url), UTType.png.identifier)
        XCTAssertEqual(PhotoLibraryImageWrite.decide(fileAt: url), .asIs)
    }

    func test_jpegTranscoded_producesAJpeg() throws {
        let png = try encoded(.png)
        let jpeg = try XCTUnwrap(PhotoLibraryImageWrite.jpegTranscoded(data: png))
        XCTAssertEqual(PhotoLibraryImageWrite.typeIdentifier(of: jpeg), UTType.jpeg.identifier)
    }

    func test_photoLibraryManager_neverDecodesAUIImageToSaveEncodedBytes() throws {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Sources/MeeshySDK/Cache/PhotoLibraryManager.swift")
        let source = try String(contentsOf: url, encoding: .utf8)
        XCTAssertFalse(source.contains("UIImage(data:"),
                       "Enregistrer des octets encodés ne passe plus par un UIImage (#9685).")
        XCTAssertTrue(source.contains("addResource(with: type, fileURL: url, options: options)"),
                      "Un fichier part par référence (addResource fileURL) — rien n'est chargé en mémoire.")
        XCTAssertTrue(source.contains("options.shouldMoveFile = move"))
    }
}
