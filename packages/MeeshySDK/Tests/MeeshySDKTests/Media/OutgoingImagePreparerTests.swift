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

    /// Le défaut compresse : une photo HD part en UNE génération perceptuelle,
    /// sauf si l'original est déjà aussi efficace (décidé après l'essai).
    func test_plan_defaultJpegWithinHD_isEncodedOnceUnlessAlreadyEfficient() {
        let plan = OutgoingImagePlanner.plan(format: .jpeg, pixelSize: CGSize(width: 4032, height: 3024),
                                             byteCount: 5_000_000, carriesLocation: false, policy: Self.hd())
        XCTAssertEqual(plan, .reencodeUnlessAlreadyEfficient(.jpeg, maxPixelDimension: nil))
    }

    func test_plan_defaultJpegBeyondTheHDCeiling_keepsAnHDDefinition() {
        let plan = OutgoingImagePlanner.plan(format: .jpeg, pixelSize: CGSize(width: 8064, height: 6048),
                                             byteCount: 9_000_000, carriesLocation: false, policy: Self.hd())
        XCTAssertEqual(plan, .reencode(.jpeg, maxPixelDimension: OutgoingImagePolicy.defaultHDPixelCeiling))
    }

    /// Au-delà du plafond d'octets, une photo HD ne retombe JAMAIS au budget du contexte.
    func test_plan_defaultAboveTheByteCeiling_neverFallsToTheContextBudget() {
        let plan = OutgoingImagePlanner.plan(format: .jpeg, pixelSize: CGSize(width: 4032, height: 3024),
                                             byteCount: OutgoingImagePolicy.defaultByteCeiling * 2,
                                             carriesLocation: false, policy: Self.hd())
        XCTAssertEqual(plan, .reencodeUnlessAlreadyEfficient(.jpeg, maxPixelDimension: nil))
    }

    func test_plan_strongCompression_reducesToTheContextBudget() {
        let plan = OutgoingImagePlanner.plan(format: .jpeg, pixelSize: CGSize(width: 4032, height: 3024),
                                             byteCount: 3_000_000, carriesLocation: false, policy: Self.strong(max: 1200))
        XCTAssertEqual(plan, .reencode(.jpeg, maxPixelDimension: 1200))
    }

    func test_plan_pngStaysLossless_andOnlyItsLocationIsRemoved() {
        let small = OutgoingImagePlanner.plan(format: .png, pixelSize: CGSize(width: 1170, height: 2532),
                                              byteCount: 2_000_000, carriesLocation: false, policy: Self.hd())
        let located = OutgoingImagePlanner.plan(format: .png, pixelSize: CGSize(width: 512, height: 512),
                                                byteCount: 90_000, carriesLocation: true, policy: Self.hd())
        let large = OutgoingImagePlanner.plan(format: .png, pixelSize: CGSize(width: 3000, height: 2000),
                                              byteCount: 9_000_000, carriesLocation: false, policy: Self.strong(max: 1200))
        XCTAssertEqual(small, .passthrough, "une capture d'écran reste sans perte")
        XCTAssertEqual(located, .stripLocation)
        XCTAssertEqual(large, .reencode(.png, maxPixelDimension: 1200))
    }

    func test_plan_gifAndWebpTravelAsIs() {
        [OutgoingImageFormat.gif, .webp].forEach { format in
            let plan = OutgoingImagePlanner.plan(format: format, pixelSize: CGSize(width: 4000, height: 4000),
                                                 byteCount: 5_000_000, carriesLocation: true, policy: Self.strong(max: 1200))
            XCTAssertEqual(plan, .passthrough, "\(format)")
        }
    }

    func test_plan_heicBecomesOneWebSafeJpeg() {
        let plan = OutgoingImagePlanner.plan(format: .heic, pixelSize: CGSize(width: 4032, height: 3024),
                                             byteCount: 2_500_000, carriesLocation: false, policy: Self.hd())
        XCTAssertEqual(plan, .reencode(.jpeg, maxPixelDimension: nil))
    }

    func test_policy_hdSteps_descendFrom4096To2560_andNeverToTheContextBudget() {
        let policy = Self.hd()
        XCTAssertEqual(policy.step(below: 4032), 3072)
        XCTAssertEqual(policy.step(below: 3072), 2560)
        XCTAssertNil(policy.step(below: 2560))
        XCTAssertNil(Self.strong(max: 1200).step(below: 1200), "la compression forte est déjà au budget")
    }

    func test_policy_qualityFromPercent_isClamped() {
        XCTAssertEqual(OutgoingImagePolicy.quality(percent: 85), 0.85, accuracy: 0.0001)
        XCTAssertEqual(OutgoingImagePolicy.quality(percent: 400), 1, accuracy: 0.0001)
        XCTAssertEqual(OutgoingImagePolicy.quality(percent: 0), 0.5, accuracy: 0.0001)
    }

    // MARK: - L'exécution (ImageIO réel)

    func test_prepare_denseJpeg_isEncodedOnceAtItsDefinition() throws {
        let data = try Self.photo(width: 1600, height: 1200, quality: 1)
        let out = try XCTUnwrap(OutgoingImagePreparer().prepare(data, policy: Self.hd()))
        XCTAssertEqual(out.encodedGenerations, 1)
        XCTAssertEqual(out.pixelSize, CGSize(width: 1600, height: 1200), "la définition HD n'est pas rabotée")
        XCTAssertLessThan(out.data.count, data.count)
    }

    func test_prepare_alreadyEfficientJpeg_travelsAsIs() throws {
        let data = try Self.photo(width: 1600, height: 1200, quality: 0.5)
        let out = try XCTUnwrap(OutgoingImagePreparer().prepare(data, policy: Self.hd()))
        XCTAssertEqual(out.data, data, "réencoder ne ferait pas gagner assez pour payer une génération")
        XCTAssertEqual(out.encodedGenerations, 0)
    }

    func test_prepare_alreadyEfficientJpegWithLocation_dropsGPS_andKeepsThePixels() throws {
        let data = try Self.photo(width: 800, height: 600, quality: 0.5, gps: true)
        XCTAssertNotNil(try Self.properties(of: data)[kCGImagePropertyGPSDictionary], "le témoin part d'une photo géolocalisée")
        let out = try XCTUnwrap(OutgoingImagePreparer().prepare(data, policy: Self.hd()))
        XCTAssertNil(try Self.properties(of: out.data)[kCGImagePropertyGPSDictionary])
        XCTAssertEqual(out.encodedGenerations, 0, "retirer le lieu ne ré-encode pas les pixels")
        XCTAssertEqual(try Self.pixels(of: out.data), try Self.pixels(of: data))
    }

    func test_prepare_locationKeptByTheUser_efficientOriginalTravelsAsIs() throws {
        let data = try Self.photo(width: 800, height: 600, quality: 0.5, gps: true)
        let policy = OutgoingImagePolicy(maxPixelDimension: 1200, compresses: false, quality: 0.85, keepsLocation: true)
        let out = try XCTUnwrap(OutgoingImagePreparer().prepare(data, policy: policy))
        XCTAssertEqual(out.data, data)
    }

    func test_prepare_reencodeDropsGPS() throws {
        let data = try Self.photo(width: 1600, height: 1200, quality: 1, gps: true)
        let out = try XCTUnwrap(OutgoingImagePreparer().prepare(data, policy: Self.hd()))
        XCTAssertEqual(out.encodedGenerations, 1)
        XCTAssertNil(try Self.properties(of: out.data)[kCGImagePropertyGPSDictionary])
    }

    func test_prepare_reencodeKeepsTheColorProfile() throws {
        let data = try Self.photo(width: 800, height: 600, quality: 1, space: CGColorSpace.displayP3)
        let out = try XCTUnwrap(OutgoingImagePreparer().prepare(data, policy: Self.hd()))
        XCTAssertEqual(out.encodedGenerations, 1)
        XCTAssertEqual(try XCTUnwrap(Self.image(of: out.data)).colorSpace?.name as String?, CGColorSpace.displayP3 as String)
    }

    /// Au-delà du plafond d'octets : 4096, puis 3072, puis 2560 — jamais 1200.
    func test_prepare_heavyPhoto_descendsByHDSteps_neverToTheContextBudget() throws {
        let data = try Self.photo(width: 3600, height: 2700, quality: 1)
        let policy = OutgoingImagePolicy(maxPixelDimension: 1200, compresses: false, quality: 0.85,
                                         keepsLocation: false, byteCeiling: 1)
        let out = try XCTUnwrap(OutgoingImagePreparer().prepare(data, policy: policy))
        XCTAssertEqual(out.encodedGenerations, 1, "chaque palier repart de l'original")
        XCTAssertEqual(out.pixelSize, CGSize(width: 2560, height: 1920))
    }

    func test_prepare_strongCompression_reducesToTheContextBudget() throws {
        let data = try Self.photo(width: 2400, height: 1800, quality: 1, gps: true)
        let out = try XCTUnwrap(OutgoingImagePreparer().prepare(data, policy: Self.strong(max: 1200)))
        XCTAssertEqual(out.encodedGenerations, 1)
        XCTAssertEqual(out.pixelSize, CGSize(width: 1200, height: 900))
        XCTAssertNil(try Self.properties(of: out.data)[kCGImagePropertyGPSDictionary])
    }

    func test_prepare_largePng_staysPngWithItsAlpha() throws {
        let data = try Self.encoded(.png, width: 1600, height: 1600, alpha: true)
        let out = try XCTUnwrap(OutgoingImagePreparer().prepare(data, policy: Self.strong(max: 800)))
        XCTAssertEqual(out.format, .png)
        XCTAssertEqual(OutgoingImageFormat(sniffing: out.data), .png)
        let image = try XCTUnwrap(Self.image(of: out.data))
        XCTAssertEqual(image.width, 800)
        XCTAssertTrue([.premultipliedLast, .premultipliedFirst, .last, .first].contains(image.alphaInfo),
                      "un PNG transparent garde son alpha")
    }

    func test_prepare_screenshotPng_travelsLosslessly() throws {
        let data = try Self.encoded(.png, width: 1170, height: 2532)
        let out = try XCTUnwrap(OutgoingImagePreparer().prepare(data, policy: Self.hd()))
        XCTAssertEqual(out.data, data)
    }

    func test_prepare_rotatedDenseJpeg_isUprightOnce() throws {
        let data = try Self.photo(width: 2000, height: 1000, quality: 1, orientation: 6)
        let out = try XCTUnwrap(OutgoingImagePreparer().prepare(data, policy: Self.strong(max: 1000)))
        XCTAssertEqual(out.pixelSize, CGSize(width: 500, height: 1000))
        XCTAssertEqual((try Self.properties(of: out.data)[kCGImagePropertyOrientation] as? Int) ?? 1, 1)
    }

    func test_prepare_rotatedEfficientJpeg_reportsTheUprightSize() throws {
        let data = try Self.photo(width: 400, height: 300, quality: 0.5, orientation: 6)
        let out = try XCTUnwrap(OutgoingImagePreparer().prepare(data, policy: Self.hd()))
        XCTAssertEqual(out.data, data)
        XCTAssertEqual(out.pixelSize, CGSize(width: 300, height: 400))
    }

    func test_prepare_undecodableBytes_travelAsIs() {
        let data = Self.magic([0, 0, 0, 0, 0x66, 0x74, 0x79, 0x70])
        let out = OutgoingImagePreparer().prepare(data, policy: Self.hd())
        XCTAssertEqual(out?.data, data)
        XCTAssertEqual(out?.format, .heic)
        XCTAssertNil(out?.pixelSize)
    }

    /// Le critère de #9885 : une photo de l'objectif ne connaît qu'UNE
    /// génération d'encodage — celle de `PhotoCaptureProcessor`, à q 0,85 —
    /// jusqu'au disque. Réencoder à la même qualité ne gagnerait rien.
    func test_cameraShot_isEncodedExactlyOnceUntilUpload() throws {
        let raw = try Self.photo(width: 1600, height: 1200, quality: 1, gps: true)
        let shot = try XCTUnwrap(PhotoCaptureProcessor().process(encoded: raw, settings: .capture))
        let out = try XCTUnwrap(OutgoingImagePreparer().prepare(shot.data, policy: Self.hd()))
        XCTAssertEqual(out.encodedGenerations, 0)
        XCTAssertEqual(try Self.pixels(of: out.data), try Self.pixels(of: shot.data))
        XCTAssertNil(try Self.properties(of: out.data)[kCGImagePropertyGPSDictionary])
    }

    // MARK: - Fabriques

    /// Le défaut : HD, une génération perceptuelle, lieu retiré.
    private static func hd() -> OutgoingImagePolicy {
        OutgoingImagePolicy(maxPixelDimension: 1200, compresses: false, quality: 0.85, keepsLocation: false)
    }

    /// La compression forte, choisie par l'utilisateur pour économiser des données.
    private static func strong(max: CGFloat) -> OutgoingImagePolicy {
        OutgoingImagePolicy(maxPixelDimension: max, compresses: true, quality: 0.85, keepsLocation: false)
    }

    /// Une image au grain de photo (dégradé + bruit déterministe), encodée en JPEG
    /// à la qualité donnée : `quality: 1` est un original dense, `0.5` un original
    /// déjà plus léger que ce que q 0,85 produirait.
    private static func photo(width: Int, height: Int, quality: CGFloat, orientation: Int = 1, gps: Bool = false,
                              space: CFString = CGColorSpace.sRGB) throws -> Data {
        let colorSpace = try XCTUnwrap(CGColorSpace(name: space))
        let context = try XCTUnwrap(CGContext(data: nil, width: width, height: height, bitsPerComponent: 8, bytesPerRow: 0,
                                              space: colorSpace, bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue))
        let pixels = try XCTUnwrap(context.data).bindMemory(to: UInt8.self, capacity: context.bytesPerRow * height)
        var seed: UInt32 = 0x9E37_79B9
        (0..<height).forEach { y in
            (0..<width).forEach { x in
                seed = seed &* 1_664_525 &+ 1_013_904_223
                let noise = Int(seed >> 26)
                let offset = y * context.bytesPerRow + x * 4
                pixels[offset] = UInt8(min(255, x * 200 / width + noise))
                pixels[offset + 1] = UInt8(min(255, y * 200 / height + noise))
                pixels[offset + 2] = UInt8(min(255, 90 + noise * 2))
            }
        }
        let image = try XCTUnwrap(context.makeImage())
        let data = NSMutableData()
        let destination = try XCTUnwrap(CGImageDestinationCreateWithData(data, UTType.jpeg.identifier as CFString, 1, nil))
        let properties = location(gps).merging([kCGImagePropertyOrientation: orientation,
                                                kCGImageDestinationLossyCompressionQuality: quality]) { garde, _ in garde }
        CGImageDestinationAddImage(destination, image, properties as CFDictionary)
        XCTAssertTrue(CGImageDestinationFinalize(destination))
        return data as Data
    }

    private static func location(_ gps: Bool) -> [CFString: Any] {
        gps ? [kCGImagePropertyGPSDictionary: [
            kCGImagePropertyGPSLatitude: 48.8566, kCGImagePropertyGPSLatitudeRef: "N",
            kCGImagePropertyGPSLongitude: 2.3522, kCGImagePropertyGPSLongitudeRef: "E",
        ] as [CFString: Any]] : [:]
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
        let properties = location(gps).merging([kCGImagePropertyOrientation: orientation]) { garde, _ in garde }
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
