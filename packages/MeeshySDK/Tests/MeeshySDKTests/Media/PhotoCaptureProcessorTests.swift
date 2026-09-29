import CoreGraphics
import Foundation
import ImageIO
import UniformTypeIdentifiers
import XCTest
@testable import MeeshySDK

/// #8695 — une photo prise dans Meeshy passe par UN traitement : redressée,
/// bornée, légèrement améliorée, ré-encodée avec ses métadonnées.
final class PhotoCaptureProcessorTests: XCTestCase {

    // MARK: - Géométrie

    func test_targetSize_longerThanBound_scalesLongestSideToBound() {
        let size = PhotoCaptureGeometry.targetSize(for: CGSize(width: 4000, height: 3000), maxPixelDimension: 2048)
        XCTAssertEqual(size, CGSize(width: 2048, height: 1536))
    }

    func test_targetSize_portraitLongerThanBound_scalesHeight() {
        let size = PhotoCaptureGeometry.targetSize(for: CGSize(width: 3024, height: 4032), maxPixelDimension: 2016)
        XCTAssertEqual(size, CGSize(width: 1512, height: 2016))
    }

    func test_targetSize_withinBound_keepsSize() {
        let size = PhotoCaptureGeometry.targetSize(for: CGSize(width: 1000, height: 500), maxPixelDimension: 2048)
        XCTAssertEqual(size, CGSize(width: 1000, height: 500))
    }

    func test_targetSize_emptyImage_returnsNil() {
        XCTAssertNil(PhotoCaptureGeometry.targetSize(for: .zero, maxPixelDimension: 2048))
        XCTAssertNil(PhotoCaptureGeometry.targetSize(for: CGSize(width: 10, height: 10), maxPixelDimension: 0))
    }

    // MARK: - Métadonnées

    func test_carriedMetadata_keepsExifAndForcesUprightOrientation() {
        let source: [CFString: Any] = [
            kCGImagePropertyOrientation: 6,
            kCGImagePropertyExifDictionary: [
                kCGImagePropertyExifLensModel: "iPhone back camera",
                kCGImagePropertyExifPixelXDimension: 4032,
            ] as [CFString: Any],
            kCGImagePropertyTIFFDictionary: [
                kCGImagePropertyTIFFOrientation: 6,
                kCGImagePropertyTIFFMake: "Apple",
            ] as [CFString: Any],
            kCGImagePropertyMakerAppleDictionary: ["1": 1] as [String: Any],
        ]
        let carried = PhotoCaptureMetadata.carried(from: source)
        XCTAssertEqual(carried[kCGImagePropertyOrientation] as? Int, 1)
        let exif = carried[kCGImagePropertyExifDictionary] as? [CFString: Any]
        XCTAssertEqual(exif?[kCGImagePropertyExifLensModel] as? String, "iPhone back camera")
        XCTAssertNil(exif?[kCGImagePropertyExifPixelXDimension])
        let tiff = carried[kCGImagePropertyTIFFDictionary] as? [CFString: Any]
        XCTAssertEqual(tiff?[kCGImagePropertyTIFFOrientation] as? Int, 1)
        XCTAssertEqual(tiff?[kCGImagePropertyTIFFMake] as? String, "Apple")
        XCTAssertNil(carried[kCGImagePropertyMakerAppleDictionary])
    }

    // MARK: - Format

    func test_formatForTypeIdentifier_mapsHeicAndJpeg() {
        XCTAssertEqual(PhotoCaptureFormat(typeIdentifier: UTType.heic.identifier), .heic)
        XCTAssertEqual(PhotoCaptureFormat(typeIdentifier: UTType.jpeg.identifier), .jpeg)
        XCTAssertNil(PhotoCaptureFormat(typeIdentifier: UTType.png.identifier))
    }

    func test_formatDescriptors_matchTheirFiles() {
        XCTAssertEqual(PhotoCaptureFormat.jpeg.fileExtension, "jpg")
        XCTAssertEqual(PhotoCaptureFormat.jpeg.mimeType, "image/jpeg")
        XCTAssertEqual(PhotoCaptureFormat.heic.fileExtension, "heic")
        XCTAssertEqual(PhotoCaptureFormat.heic.mimeType, "image/heic")
    }

    // MARK: - Traitement bout à bout

    func test_processEncoded_largePhoto_boundsLongestSide() throws {
        let data = try Self.jpeg(width: 1600, height: 1200, orientation: 1)
        let settings = PhotoCaptureSettings(maxPixelDimension: 800, quality: 0.8, format: .jpeg, enhancement: .light)
        let processed = try XCTUnwrap(PhotoCaptureProcessor().process(encoded: data, settings: settings))
        XCTAssertEqual(processed.image.width, 800)
        XCTAssertEqual(processed.image.height, 600)
        XCTAssertEqual(try Self.pixelSize(of: processed.data), CGSize(width: 800, height: 600))
    }

    func test_processEncoded_rotatedSource_redrawsUprightPixels() throws {
        let data = try Self.jpeg(width: 400, height: 300, orientation: 6)
        let settings = PhotoCaptureSettings(maxPixelDimension: 2048, quality: 0.8, format: .jpeg, enhancement: .none)
        let processed = try XCTUnwrap(PhotoCaptureProcessor().process(encoded: data, settings: settings))
        XCTAssertEqual(processed.image.width, 300)
        XCTAssertEqual(processed.image.height, 400)
        let properties = try Self.properties(of: processed.data)
        XCTAssertEqual((properties[kCGImagePropertyOrientation] as? Int) ?? 1, 1)
    }

    func test_processEncoded_keepsExifOfTheShot() throws {
        let data = try Self.jpeg(width: 200, height: 100, orientation: 1, lensModel: "Meeshy test lens")
        let processed = try XCTUnwrap(PhotoCaptureProcessor().process(encoded: data, settings: .capture))
        let exif = try Self.properties(of: processed.data)[kCGImagePropertyExifDictionary] as? [CFString: Any]
        XCTAssertEqual(exif?[kCGImagePropertyExifLensModel] as? String, "Meeshy test lens")
    }

    func test_processEncoded_jpegSourceWithoutRequestedFormat_staysJpeg() throws {
        let data = try Self.jpeg(width: 200, height: 100, orientation: 1)
        let processed = try XCTUnwrap(PhotoCaptureProcessor().process(encoded: data, settings: .capture))
        XCTAssertEqual(processed.format, .jpeg)
        XCTAssertEqual(Array(processed.data.prefix(3)), [0xFF, 0xD8, 0xFF])
    }

    func test_processEncoded_heicRequested_formatMatchesTheBytes() throws {
        let data = try Self.jpeg(width: 200, height: 100, orientation: 1)
        let settings = PhotoCaptureSettings(maxPixelDimension: 2048, quality: 0.8, format: .heic, enhancement: .light)
        let processed = try XCTUnwrap(PhotoCaptureProcessor().process(encoded: data, settings: settings))
        let isJpeg = Array(processed.data.prefix(3)) == [0xFF, 0xD8, 0xFF]
        XCTAssertEqual(processed.format, isJpeg ? .jpeg : .heic)
    }

    func test_processEncoded_notAnImage_returnsNil() {
        XCTAssertNil(PhotoCaptureProcessor().process(encoded: Data("pas une image".utf8), settings: .capture))
    }

    func test_processImage_frame_encodesJpegWithinBound() throws {
        let image = try XCTUnwrap(Self.gradient(width: 1280, height: 720))
        let settings = PhotoCaptureSettings(maxPixelDimension: 640, quality: 0.8, format: .jpeg, enhancement: .light)
        let processed = try XCTUnwrap(PhotoCaptureProcessor().process(image: image, settings: settings))
        XCTAssertEqual(processed.format, .jpeg)
        XCTAssertEqual(processed.image.width, 640)
        XCTAssertEqual(processed.image.height, 360)
    }

    func test_callCaptureSettings_areJpegAndBounded() {
        XCTAssertEqual(PhotoCaptureSettings.callCapture.format, .jpeg)
        XCTAssertLessThanOrEqual(PhotoCaptureSettings.callCapture.maxPixelDimension, 1920)
        XCTAssertEqual(PhotoCaptureSettings.callCapture.enhancement, .light)
    }

    func test_captureSettings_keepSourceFormatAndBoundTheUpload() {
        XCTAssertNil(PhotoCaptureSettings.capture.format)
        XCTAssertLessThanOrEqual(PhotoCaptureSettings.capture.maxPixelDimension, 2560)
        XCTAssertEqual(PhotoCaptureSettings.capture.enhancement, .light)
    }

    // MARK: - Fabriques

    private static func gradient(width: Int, height: Int) -> CGImage? {
        let colorSpace = CGColorSpaceCreateDeviceRGB()
        guard let context = CGContext(
            data: nil, width: width, height: height, bitsPerComponent: 8, bytesPerRow: 0,
            space: colorSpace, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
        ) else { return nil }
        let colors = [CGColor(red: 0.1, green: 0.2, blue: 0.6, alpha: 1), CGColor(red: 0.9, green: 0.7, blue: 0.2, alpha: 1)]
        guard let gradient = CGGradient(colorsSpace: colorSpace, colors: colors as CFArray, locations: [0, 1]) else { return nil }
        context.drawLinearGradient(gradient, start: .zero, end: CGPoint(x: width, y: height), options: [])
        return context.makeImage()
    }

    private static func jpeg(width: Int, height: Int, orientation: Int, lensModel: String? = nil) throws -> Data {
        let image = try XCTUnwrap(gradient(width: width, height: height))
        let data = NSMutableData()
        let destination = try XCTUnwrap(CGImageDestinationCreateWithData(data, UTType.jpeg.identifier as CFString, 1, nil))
        let exif: [CFString: Any] = lensModel.map { [kCGImagePropertyExifLensModel: $0] } ?? [:]
        let properties: [CFString: Any] = [
            kCGImagePropertyOrientation: orientation,
            kCGImagePropertyExifDictionary: exif,
        ]
        CGImageDestinationAddImage(destination, image, properties as CFDictionary)
        XCTAssertTrue(CGImageDestinationFinalize(destination))
        return data as Data
    }

    private static func properties(of data: Data) throws -> [CFString: Any] {
        let source = try XCTUnwrap(CGImageSourceCreateWithData(data as CFData, nil))
        return try XCTUnwrap(CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any])
    }

    private static func pixelSize(of data: Data) throws -> CGSize {
        let properties = try properties(of: data)
        let width = try XCTUnwrap(properties[kCGImagePropertyPixelWidth] as? Int)
        let height = try XCTUnwrap(properties[kCGImagePropertyPixelHeight] as? Int)
        return CGSize(width: width, height: height)
    }
}
