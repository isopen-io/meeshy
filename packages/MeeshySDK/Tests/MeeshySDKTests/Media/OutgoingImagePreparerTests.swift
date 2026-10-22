import CoreGraphics
import Foundation
import ImageIO
import UniformTypeIdentifiers
import XCTest
@testable import MeeshySDK

/// #9885 — une photo n'est encodée qu'UNE fois entre la caméra et l'envoi.
/// Verdict porteur #11247 (2026-10-22) : compresser sans perte VISUELLE, garder
/// l'effet HD ; sans-perte strict pour les PNG ; GPS retiré au client sauf
/// réglage explicite « conserver le lieu ».
final class OutgoingImagePreparerTests: XCTestCase {

    // MARK: - Format lu dans les octets

    func test_format_sniffsTheBytesNotTheName() throws {
        XCTAssertEqual(OutgoingImageFormat(sniffing: try Self.encoded(.jpeg)), .jpeg)
        XCTAssertEqual(OutgoingImageFormat(sniffing: try Self.encoded(.png)), .png)
        XCTAssertEqual(OutgoingImageFormat(sniffing: Self.magic([0x47, 0x49, 0x46, 0x38])), .gif)
        XCTAssertEqual(OutgoingImageFormat(sniffing: Self.webpMagic()), .webp)
        XCTAssertEqual(OutgoingImageFormat(sniffing: Self.magic([0, 0, 0, 0, 0x66, 0x74, 0x79, 0x70])), .heic)
        XCTAssertEqual(OutgoingImageFormat(sniffing: Data([0xFF, 0xD8])), .unknown)
    }

    // MARK: - Le plan (loi pure)

    func test_plan_jpegWithinBudget_travelsAsIs() {
        let plan = OutgoingImagePlanner.plan(format: .jpeg, pixelSize: CGSize(width: 1000, height: 800),
                                             byteCount: 400_000, carriesLocation: false, policy: Self.compressing(max: 1200))
        XCTAssertEqual(plan, .passthrough)
    }

    func test_plan_jpegOverBudget_isEncodedOnceAtTheBudget() {
        let plan = OutgoingImagePlanner.plan(format: .jpeg, pixelSize: CGSize(width: 4032, height: 3024),
                                             byteCount: 3_000_000, carriesLocation: false, policy: Self.compressing(max: 1200))
        XCTAssertEqual(plan, .reencode(.jpeg, maxPixelDimension: 1200))
    }

    func test_plan_jpegWithLocation_stripsItWithoutReencoding() {
        let plan = OutgoingImagePlanner.plan(format: .jpeg, pixelSize: CGSize(width: 800, height: 600),
                                             byteCount: 200_000, carriesLocation: true, policy: Self.compressing(max: 1200))
        XCTAssertEqual(plan, .stripLocation)
    }

    func test_plan_locationKeptByTheUser_travelsAsIs() {
        let policy = OutgoingImagePolicy(maxPixelDimension: 1200, compresses: true, quality: 0.85, keepsLocation: true)
        let plan = OutgoingImagePlanner.plan(format: .jpeg, pixelSize: CGSize(width: 800, height: 600),
                                             byteCount: 200_000, carriesLocation: true, policy: policy)
        XCTAssertEqual(plan, .passthrough)
    }

    func test_plan_pngIsNeverTurnedIntoJpeg() {
        let small = OutgoingImagePlanner.plan(format: .png, pixelSize: CGSize(width: 512, height: 512),
                                              byteCount: 90_000, carriesLocation: false, policy: Self.compressing(max: 1200))
        let large = OutgoingImagePlanner.plan(format: .png, pixelSize: CGSize(width: 3000, height: 2000),
                                              byteCount: 9_000_000, carriesLocation: false, policy: Self.compressing(max: 1200))
        XCTAssertEqual(small, .passthrough)
        XCTAssertEqual(large, .reencode(.png, maxPixelDimension: 1200))
    }

    func test_plan_gifAndWebpTravelAsIs() {
        [OutgoingImageFormat.gif, .webp].forEach { format in
            let plan = OutgoingImagePlanner.plan(format: format, pixelSize: CGSize(width: 4000, height: 4000),
                                                 byteCount: 5_000_000, carriesLocation: true, policy: Self.compressing(max: 1200))
            XCTAssertEqual(plan, .passthrough, "\(format)")
        }
    }

    func test_plan_heicBecomesOneWebSafeJpeg() {
        let plan = OutgoingImagePlanner.plan(format: .heic, pixelSize: CGSize(width: 1000, height: 750),
                                             byteCount: 300_000, carriesLocation: false, policy: Self.compressing(max: 1200))
        XCTAssertEqual(plan, .reencode(.jpeg, maxPixelDimension: nil))
    }

    func test_plan_compressionOff_keepsTheHDDefinition() {
        let policy = OutgoingImagePolicy(maxPixelDimension: 1200, compresses: false, quality: 0.85, keepsLocation: false)
        let plan = OutgoingImagePlanner.plan(format: .jpeg, pixelSize: CGSize(width: 4032, height: 3024),
                                             byteCount: 4_000_000, carriesLocation: false, policy: policy)
        XCTAssertEqual(plan, .passthrough, "compressImagesOnUpload = false : la définition HD part intacte")
    }

    func test_plan_compressionOff_aboveTheByteCeiling_fallsBackToTheBudget() {
        let policy = OutgoingImagePolicy(maxPixelDimension: 1200, compresses: false, quality: 0.85, keepsLocation: false)
        let plan = OutgoingImagePlanner.plan(format: .jpeg, pixelSize: CGSize(width: 4032, height: 3024),
                                             byteCount: OutgoingImagePolicy.defaultPassthroughByteCeiling + 1,
                                             carriesLocation: false, policy: policy)
        XCTAssertEqual(plan, .reencode(.jpeg, maxPixelDimension: 1200))
    }

    func test_policy_qualityFromPercent_isClamped() {
        XCTAssertEqual(OutgoingImagePolicy.quality(percent: 85), 0.85, accuracy: 0.0001)
        XCTAssertEqual(OutgoingImagePolicy.quality(percent: 400), 1, accuracy: 0.0001)
        XCTAssertEqual(OutgoingImagePolicy.quality(percent: 0), 0.5, accuracy: 0.0001)
    }

    // MARK: - L'exécution (ImageIO réel)

    func test_prepare_jpegWithinBudget_bytesAreIdentical() throws {
        let data = try Self.encoded(.jpeg, width: 800, height: 600)
        let out = try XCTUnwrap(OutgoingImagePreparer().prepare(data, policy: Self.compressing(max: 1200)))
        XCTAssertEqual(out.data, data)
        XCTAssertEqual(out.format, .jpeg)
        XCTAssertEqual(out.encodedGenerations, 0)
        XCTAssertEqual(out.pixelSize, CGSize(width: 800, height: 600))
    }

    func test_prepare_jpegWithLocation_dropsGPS_andKeepsThePixels() throws {
        let data = try Self.encoded(.jpeg, width: 400, height: 300, gps: true)
        XCTAssertNotNil(try Self.properties(of: data)[kCGImagePropertyGPSDictionary], "le témoin doit partir d'une photo géolocalisée")
        let out = try XCTUnwrap(OutgoingImagePreparer().prepare(data, policy: Self.compressing(max: 1200)))
        XCTAssertNil(try Self.properties(of: out.data)[kCGImagePropertyGPSDictionary])
        XCTAssertEqual(out.encodedGenerations, 0, "retirer le lieu ne ré-encode pas les pixels")
        XCTAssertEqual(try Self.pixels(of: out.data), try Self.pixels(of: data))
    }

    func test_prepare_locationKept_gpsTravels() throws {
        let data = try Self.encoded(.jpeg, width: 400, height: 300, gps: true)
        let policy = OutgoingImagePolicy(maxPixelDimension: 1200, compresses: true, quality: 0.85, keepsLocation: true)
        let out = try XCTUnwrap(OutgoingImagePreparer().prepare(data, policy: policy))
        XCTAssertEqual(out.data, data)
    }

    func test_prepare_reencodeDropsGPS() throws {
        let data = try Self.encoded(.jpeg, width: 2400, height: 1800, gps: true)
        let out = try XCTUnwrap(OutgoingImagePreparer().prepare(data, policy: Self.compressing(max: 1200)))
        XCTAssertEqual(out.encodedGenerations, 1)
        XCTAssertEqual(out.pixelSize, CGSize(width: 1200, height: 900))
        XCTAssertNil(try Self.properties(of: out.data)[kCGImagePropertyGPSDictionary])
    }

    func test_prepare_largePng_staysPngWithItsAlpha() throws {
        let data = try Self.encoded(.png, width: 1600, height: 1600, alpha: true)
        let out = try XCTUnwrap(OutgoingImagePreparer().prepare(data, policy: Self.compressing(max: 800)))
        XCTAssertEqual(out.format, .png)
        XCTAssertEqual(OutgoingImageFormat(sniffing: out.data), .png)
        let image = try XCTUnwrap(Self.image(of: out.data))
        XCTAssertEqual(image.width, 800)
        XCTAssertTrue([.premultipliedLast, .premultipliedFirst, .last, .first].contains(image.alphaInfo),
                      "un PNG transparent garde son alpha")
    }

    func test_prepare_rotatedJpegOverBudget_isUprightOnce() throws {
        let data = try Self.encoded(.jpeg, width: 2000, height: 1000, orientation: 6)
        let out = try XCTUnwrap(OutgoingImagePreparer().prepare(data, policy: Self.compressing(max: 1000)))
        XCTAssertEqual(out.pixelSize, CGSize(width: 500, height: 1000))
        XCTAssertEqual((try Self.properties(of: out.data)[kCGImagePropertyOrientation] as? Int) ?? 1, 1)
    }

    func test_prepare_rotatedJpegWithinBudget_reportsTheUprightSize() throws {
        let data = try Self.encoded(.jpeg, width: 400, height: 300, orientation: 6)
        let out = try XCTUnwrap(OutgoingImagePreparer().prepare(data, policy: Self.compressing(max: 1200)))
        XCTAssertEqual(out.data, data)
        XCTAssertEqual(out.pixelSize, CGSize(width: 300, height: 400))
    }

    func test_prepare_undecodableBytes_travelAsIs() {
        let data = Self.magic([0, 0, 0, 0, 0x66, 0x74, 0x79, 0x70])
        let out = OutgoingImagePreparer().prepare(data, policy: Self.compressing(max: 1200))
        XCTAssertEqual(out?.data, data)
        XCTAssertEqual(out?.format, .heic)
        XCTAssertNil(out?.pixelSize)
    }

    /// Le critère de #9885 : une photo de l'objectif ne connaît qu'UNE
    /// génération d'encodage — celle de `PhotoCaptureProcessor` — jusqu'au disque.
    func test_cameraShot_isEncodedExactlyOnceUntilUpload() throws {
        let raw = try Self.encoded(.jpeg, width: 1600, height: 1200, gps: true)
        let shot = try XCTUnwrap(PhotoCaptureProcessor().process(encoded: raw, settings: .capture))
        let policy = OutgoingImagePolicy(maxPixelDimension: 1200, compresses: false, quality: 0.85, keepsLocation: false)
        let out = try XCTUnwrap(OutgoingImagePreparer().prepare(shot.data, policy: policy))
        XCTAssertEqual(out.encodedGenerations, 0)
        XCTAssertEqual(try Self.pixels(of: out.data), try Self.pixels(of: shot.data))
        XCTAssertNil(try Self.properties(of: out.data)[kCGImagePropertyGPSDictionary])
    }

    // MARK: - Fabriques

    private static func compressing(max: CGFloat) -> OutgoingImagePolicy {
        OutgoingImagePolicy(maxPixelDimension: max, compresses: true, quality: 0.85, keepsLocation: false)
    }

    private static func magic(_ prefix: [UInt8]) -> Data {
        Data(prefix + [UInt8](repeating: 0, count: max(0, 24 - prefix.count)))
    }

    private static func webpMagic() -> Data {
        magic([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50])
    }

    private static func gradient(width: Int, height: Int, alpha: Bool) -> CGImage? {
        let colorSpace = CGColorSpace(name: CGColorSpace.sRGB)!
        guard let context = CGContext(data: nil, width: width, height: height, bitsPerComponent: 8, bytesPerRow: 0,
                                      space: colorSpace, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { return nil }
        let opacity: CGFloat = alpha ? 0.4 : 1
        let colors = [CGColor(srgbRed: 0.1, green: 0.2, blue: 0.6, alpha: opacity),
                      CGColor(srgbRed: 0.9, green: 0.7, blue: 0.2, alpha: opacity)]
        guard let gradient = CGGradient(colorsSpace: colorSpace, colors: colors as CFArray, locations: [0, 1]) else { return nil }
        context.drawLinearGradient(gradient, start: .zero, end: CGPoint(x: width, y: height), options: [])
        return context.makeImage()
    }

    private enum Kind { case jpeg, png }

    private static func encoded(_ kind: Kind, width: Int = 200, height: Int = 150, orientation: Int = 1,
                                gps: Bool = false, alpha: Bool = false) throws -> Data {
        let image = try XCTUnwrap(gradient(width: width, height: height, alpha: alpha))
        let type = kind == .jpeg ? UTType.jpeg : UTType.png
        let data = NSMutableData()
        let destination = try XCTUnwrap(CGImageDestinationCreateWithData(data, type.identifier as CFString, 1, nil))
        let location: [CFString: Any] = gps ? [kCGImagePropertyGPSDictionary: [
            kCGImagePropertyGPSLatitude: 48.8566, kCGImagePropertyGPSLatitudeRef: "N",
            kCGImagePropertyGPSLongitude: 2.3522, kCGImagePropertyGPSLongitudeRef: "E",
        ] as [CFString: Any]] : [:]
        let properties = location.merging([kCGImagePropertyOrientation: orientation]) { garde, _ in garde }
        CGImageDestinationAddImage(destination, image, properties as CFDictionary)
        XCTAssertTrue(CGImageDestinationFinalize(destination))
        return data as Data
    }

    private static func properties(of data: Data) throws -> [CFString: Any] {
        let source = try XCTUnwrap(CGImageSourceCreateWithData(data as CFData, nil))
        return try XCTUnwrap(CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any])
    }

    private static func image(of data: Data) -> CGImage? {
        CGImageSourceCreateWithData(data as CFData, nil).flatMap { CGImageSourceCreateImageAtIndex($0, 0, nil) }
    }

    /// Les pixels DÉCODÉS : deux fichiers aux mêmes pixels n'ont pas été ré-encodés entre eux.
    private static func pixels(of data: Data) throws -> Data {
        let image = try XCTUnwrap(image(of: data))
        let decoded = try XCTUnwrap(image.dataProvider?.data)
        return decoded as Data
    }
}
