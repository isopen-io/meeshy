import CoreGraphics
import Foundation
import ImageIO
import UniformTypeIdentifiers
import XCTest
@testable import MeeshySDK

/// #11291 — l'iPhone envoie ses HEIC tels quels dès que la passerelle les
/// accepte (S8, #11263), et retombe sur un JPEG q 0,92 quand elle ne les
/// accepte pas. Les lois sont pures ; l'exécution joue ImageIO.
final class OutgoingImageHEICDeliveryTests: XCTestCase {

    // MARK: - Le plan : un HEIC natif ne se convertit plus

    func test_plan_nativeHeicWithinBudget_travelsAsIs() {
        let plan = OutgoingImagePlanner.plan(format: .heic, pixelSize: CGSize(width: 4032, height: 3024),
                                             byteCount: 2_500_000, carriesLocation: false, policy: Self.native())
        XCTAssertEqual(plan, .passthrough)
    }

    func test_plan_nativeHeicWithLocation_onlyLosesItsLocation() {
        let plan = OutgoingImagePlanner.plan(format: .heic, pixelSize: CGSize(width: 4032, height: 3024),
                                             byteCount: 2_500_000, carriesLocation: true, policy: Self.native())
        XCTAssertEqual(plan, .stripLocation)
    }

    func test_plan_nativeHeicWithLocationKeptByTheUser_travelsAsIs() {
        let plan = OutgoingImagePlanner.plan(format: .heic, pixelSize: CGSize(width: 4032, height: 3024),
                                             byteCount: 2_500_000, carriesLocation: true,
                                             policy: Self.native(keepsLocation: true))
        XCTAssertEqual(plan, .passthrough)
    }

    func test_plan_nativeHeicBeyondTheBudget_staysHeicWhenResized() {
        let plan = OutgoingImagePlanner.plan(format: .heic, pixelSize: CGSize(width: 8000, height: 6000),
                                             byteCount: 9_000_000, carriesLocation: false, policy: Self.native())
        XCTAssertEqual(plan, .reencode(.heic, maxPixelDimension: 4096))
    }

    func test_plan_heicOnACompatibilityPolicy_becomesOneJpeg() {
        let plan = OutgoingImagePlanner.plan(format: .heic, pixelSize: CGSize(width: 4032, height: 3024),
                                             byteCount: 2_500_000, carriesLocation: false,
                                             policy: Self.native(delivery: .jpegCompatibility))
        XCTAssertEqual(plan, .reencode(.jpeg, maxPixelDimension: nil))
    }

    func test_policy_defaultDelivery_isTheJpegCompatibility_soNoOtherHostChangesBehaviour() {
        let policy = OutgoingImagePolicy(maxPixelDimension: 1200, compresses: false, quality: 0.85, keepsLocation: false)
        XCTAssertEqual(policy.heicDelivery, .jpegCompatibility)
    }

    func test_plan_unknownBytes_stillBecomeAJpegWhateverTheDelivery() {
        let plan = OutgoingImagePlanner.plan(format: .unknown, pixelSize: CGSize(width: 800, height: 600),
                                             byteCount: 400_000, carriesLocation: false, policy: Self.native())
        XCTAssertEqual(plan, .reencode(.jpeg, maxPixelDimension: nil))
    }

    // MARK: - Le repli : JPEG q 0,92

    func test_compatibilityQuality_isTheNinetyTwo() {
        XCTAssertEqual(HEICDeliveryLaw.compatibilityQuality, 0.92, accuracy: 0.0001)
    }

    func test_compatibilityPolicy_encodesAtTheCompatibilityQuality_withoutShrinkingBelowHD() {
        let policy = OutgoingImagePolicy.jpegCompatibility(keepsLocation: false)
        XCTAssertEqual(policy.heicDelivery, .jpegCompatibility)
        XCTAssertEqual(policy.quality, 0.92, accuracy: 0.0001)
        XCTAssertFalse(policy.compresses)
        XCTAssertFalse(policy.keepsLocation)
        XCTAssertEqual(policy.pixelBudget, OutgoingImagePolicy.defaultHDPixelCeiling)
    }

    func test_conversionQuality_liftsTheDefaultToTheCompatibilityQuality() {
        XCTAssertEqual(Self.native(delivery: .jpegCompatibility).forHEICConversion.quality, 0.92, accuracy: 0.0001)
    }

    func test_conversionQuality_neverLowersAHigherQuality() {
        let policy = OutgoingImagePolicy(maxPixelDimension: 1200, compresses: false, quality: 0.97, keepsLocation: false)
        XCTAssertEqual(policy.forHEICConversion.quality, 0.97, accuracy: 0.0001)
    }

    func test_conversionQuality_respectsTheStrongCompressionTheUserChose() {
        let policy = OutgoingImagePolicy(maxPixelDimension: 1200, compresses: true, quality: 0.7, keepsLocation: false)
        XCTAssertEqual(policy.forHEICConversion.quality, 0.7, accuracy: 0.0001)
    }

    // MARK: - Les verdicts du serveur

    func test_verdict_aJpegServedBack_meansTheServerConverts() {
        XCTAssertEqual(HEICDeliveryLaw.verdict(servedMimeType: "image/jpeg"), .converts)
        XCTAssertEqual(HEICDeliveryLaw.verdict(servedMimeType: "image/webp"), .converts)
    }

    func test_verdict_aHeicServedBack_meansTheServerKeptItAsAFile() {
        XCTAssertEqual(HEICDeliveryLaw.verdict(servedMimeType: "image/heic"), .refuses)
        XCTAssertEqual(HEICDeliveryLaw.verdict(servedMimeType: "IMAGE/HEIF; charset=binary"), .refuses)
    }

    func test_isHEIC_readsHeicAndHeifOnly() {
        XCTAssertTrue(HEICDeliveryLaw.isHEIC(mimeType: "image/heic"))
        XCTAssertTrue(HEICDeliveryLaw.isHEIC(mimeType: "image/heif"))
        XCTAssertFalse(HEICDeliveryLaw.isHEIC(mimeType: "image/jpeg"))
        XCTAssertFalse(HEICDeliveryLaw.isHEIC(mimeType: "image/avif"))
    }

    func test_refusal_isOnlyTheUnsupportedMediaType() {
        XCTAssertNotNil(UnsupportedImageFormatRefusal(statusCode: 415))
        XCTAssertNil(UnsupportedImageFormatRefusal(statusCode: 400))
        XCTAssertNil(UnsupportedImageFormatRefusal(statusCode: 413))
        XCTAssertNil(UnsupportedImageFormatRefusal(statusCode: 500))
    }

    // MARK: - Le mémo : un refus se retient 24 h

    func test_memo_withoutHistory_sendsHeicNatively() {
        let defaults = Self.freshDefaults()
        XCTAssertEqual(HEICDeliveryMemo.delivery(in: defaults, now: Self.t0), .native)
    }

    func test_memo_afterARefusal_fallsBackToJpeg() {
        let defaults = Self.freshDefaults()
        HEICDeliveryMemo.record(.refuses, in: defaults, now: Self.t0)
        XCTAssertEqual(HEICDeliveryMemo.delivery(in: defaults, now: Self.t0.addingTimeInterval(3600)), .jpegCompatibility)
    }

    func test_memo_theRefusalExpires_soAnUpgradedServerIsRetried() {
        let defaults = Self.freshDefaults()
        HEICDeliveryMemo.record(.refuses, in: defaults, now: Self.t0)
        let later = Self.t0.addingTimeInterval(HEICDeliveryMemo.refusalLifetime + 1)
        XCTAssertEqual(HEICDeliveryMemo.delivery(in: defaults, now: later), .native)
    }

    func test_memo_aConversionClearsTheRefusal() {
        let defaults = Self.freshDefaults()
        HEICDeliveryMemo.record(.refuses, in: defaults, now: Self.t0)
        HEICDeliveryMemo.record(.converts, in: defaults, now: Self.t0.addingTimeInterval(60))
        XCTAssertEqual(HEICDeliveryMemo.delivery(in: defaults, now: Self.t0.addingTimeInterval(120)), .native)
    }

    // MARK: - L'exécution (ImageIO réel)

    func test_prepare_nativeHeic_travelsByteForByte_asImageHeic() throws {
        let data = try Self.heic()
        let out = try XCTUnwrap(OutgoingImagePreparer().prepare(data, policy: Self.native()))
        XCTAssertEqual(out.data, data)
        XCTAssertEqual(out.format, .heic)
        XCTAssertEqual(out.format.mimeType, "image/heic")
        XCTAssertEqual(out.encodedGenerations, 0)
    }

    func test_prepare_nativeHeicWithLocation_dropsGPS_andStaysHeic() throws {
        let data = try Self.heic(gps: true)
        let out = try XCTUnwrap(OutgoingImagePreparer().prepare(data, policy: Self.native()))
        XCTAssertEqual(OutgoingImageFormat(sniffing: out.data), .heic)
        XCTAssertEqual(out.format.mimeType, "image/heic")
        XCTAssertNil(try Self.properties(of: out.data)[kCGImagePropertyGPSDictionary])
        XCTAssertLessThanOrEqual(out.encodedGenerations, 1, "au plus UNE génération, jamais une conversion en JPEG")
    }

    func test_prepare_nativeHeicWithAPlaceName_dropsThePlace_keepsThePixels_andStaysHeic() throws {
        let data = try Self.heic(place: true)
        let out = try XCTUnwrap(OutgoingImagePreparer().prepare(data, policy: Self.native()))
        XCTAssertEqual(OutgoingImageFormat(sniffing: out.data), .heic)
        XCTAssertEqual(Self.placeNames(in: try Self.properties(of: out.data)), [])
        XCTAssertEqual(try Self.pixels(of: out.data), try Self.pixels(of: data), "retirer le lieu ne ré-encode pas les pixels")
        XCTAssertEqual(out.encodedGenerations, 0)
    }

    func test_prepare_nativeHeicWithAPlaceKeptByTheUser_travelsByteForByte() throws {
        let data = try Self.heic(gps: true, place: true)
        let out = try XCTUnwrap(OutgoingImagePreparer().prepare(data, policy: Self.native(keepsLocation: true)))
        XCTAssertEqual(out.data, data)
    }

    func test_prepare_heicConvertedToJpeg_dropsTheCoordinatesAndThePlaceName() throws {
        let out = try XCTUnwrap(OutgoingImagePreparer().prepare(try Self.heic(gps: true, place: true),
                                                                policy: .jpegCompatibility(keepsLocation: false)))
        XCTAssertEqual(out.format, .jpeg)
        let properties = try Self.properties(of: out.data)
        XCTAssertNil(properties[kCGImagePropertyGPSDictionary])
        XCTAssertEqual(Self.placeNames(in: properties), [])
    }

    func test_removeLocation_heicFileWithGPS_dropsIt_andStaysHeic() throws {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("outgoing-\(UUID().uuidString).heic")
        try Self.heic(gps: true, place: true).write(to: url)
        defer { try? FileManager.default.removeItem(at: url) }
        XCTAssertEqual(OutgoingImageLocationRemoval.removeLocation(fromFileAt: url), .removed)
        let stripped = try Data(contentsOf: url)
        XCTAssertEqual(OutgoingImageFormat(sniffing: stripped), .heic)
        XCTAssertNil(try Self.properties(of: stripped)[kCGImagePropertyGPSDictionary])
        XCTAssertEqual(Self.placeNames(in: try Self.properties(of: stripped)), [])
    }

    func test_prepare_nativeHeicWithAPlaceInXmpOnly_dropsIt_andStaysHeic() throws {
        let data = try Self.heicWithXmpPlace()
        XCTAssertFalse(Self.places(in: data).isEmpty, "le témoin doit porter un lieu XMP")
        let out = try XCTUnwrap(OutgoingImagePreparer().prepare(data, policy: Self.native()))
        XCTAssertEqual(OutgoingImageFormat(sniffing: out.data), .heic)
        XCTAssertEqual(Self.places(in: out.data), [])
        XCTAssertEqual(out.encodedGenerations, 0)
    }

    func test_prepare_nativeHeicWhoseSecondImageCarriesGPS_dropsItEverywhere() throws {
        let data = try Self.heicSequence(gpsOnImage: 1)
        let witness = Self.places(in: data)
        XCTAssertFalse(witness.isEmpty)
        XCTAssertTrue(witness.allSatisfy { $0.hasPrefix("1:") }, "le témoin ne porte le lieu que sur la 2e image : \(witness)")
        let out = try XCTUnwrap(OutgoingImagePreparer().prepare(data, policy: Self.native()))
        XCTAssertEqual(OutgoingImageFormat(sniffing: out.data), .heic)
        XCTAssertEqual(Self.places(in: out.data), [])
    }

    func test_removeLocation_heicFileWhoseSecondImageCarriesGPS_dropsItEverywhere() throws {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("outgoing-\(UUID().uuidString).heic")
        try Self.heicSequence(gpsOnImage: 1).write(to: url)
        defer { try? FileManager.default.removeItem(at: url) }
        XCTAssertEqual(OutgoingImageLocationRemoval.removeLocation(fromFileAt: url), .removed)
        XCTAssertEqual(Self.places(in: try Data(contentsOf: url)), [])
    }

    /// Un HEIC n'a pas de bloc IIM et le lieu du contenu IPTC n'a pas d'équivalent
    /// XMP : seul un JPEG le transporte.
    func test_removeLocation_jpegFileWithAContentLocation_dropsIt() throws {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("outgoing-\(UUID().uuidString).jpg")
        try Self.jpegWithContentLocation().write(to: url)
        defer { try? FileManager.default.removeItem(at: url) }
        XCTAssertFalse(Self.places(in: try Data(contentsOf: url)).isEmpty, "le témoin doit porter un lieu du contenu")
        XCTAssertEqual(OutgoingImageLocationRemoval.removeLocation(fromFileAt: url), .removed)
        XCTAssertEqual(Self.places(in: try Data(contentsOf: url)), [])
    }

    func test_prepare_heicOnACompatibilityPolicy_isARealJpeg() throws {
        let out = try XCTUnwrap(OutgoingImagePreparer().prepare(try Self.heic(), policy: .jpegCompatibility(keepsLocation: false)))
        XCTAssertEqual(out.format, .jpeg)
        XCTAssertEqual(Array(out.data.prefix(3)), [0xFF, 0xD8, 0xFF])
        XCTAssertEqual(out.encodedGenerations, 1)
    }

    func test_prepare_heicConversionAtTheCompatibilityQuality_weighsMoreThanTheStrongCompressionOfTheUser() throws {
        let data = try Self.heic(width: 900, height: 700, noisy: true)
        let strong = OutgoingImagePolicy(maxPixelDimension: 1200, compresses: true, quality: 0.5, keepsLocation: false)
        let defaultQuality = try XCTUnwrap(OutgoingImagePreparer().prepare(data, policy: strong))
        let compat = try XCTUnwrap(OutgoingImagePreparer().prepare(data, policy: .jpegCompatibility(keepsLocation: false)))
        XCTAssertGreaterThan(compat.data.count, defaultQuality.data.count)
    }

    // MARK: - Fabriques

    private static let t0 = Date(timeIntervalSince1970: 1_790_000_000)

    private static func native(delivery: HEICDelivery = .native, keepsLocation: Bool = false) -> OutgoingImagePolicy {
        OutgoingImagePolicy(maxPixelDimension: 1200, compresses: false, quality: 0.85, keepsLocation: keepsLocation,
                            heicDelivery: delivery)
    }

    private static func freshDefaults() -> UserDefaults {
        let name = "heic-delivery-\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: name)!
        defaults.removePersistentDomain(forName: name)
        return defaults
    }

    private static func heic(width: Int = 200, height: Int = 150, gps: Bool = false, place: Bool = false,
                             noisy: Bool = false) throws -> Data {
        let types = CGImageDestinationCopyTypeIdentifiers() as? [String] ?? []
        try XCTSkipUnless(types.contains(UTType.heic.identifier), "l'hôte ne sait pas encoder du HEIC")
        let colorSpace = try XCTUnwrap(CGColorSpace(name: CGColorSpace.sRGB))
        let context = try XCTUnwrap(CGContext(data: nil, width: width, height: height, bitsPerComponent: 8, bytesPerRow: 0,
                                              space: colorSpace, bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue))
        let pixels = try XCTUnwrap(context.data).bindMemory(to: UInt8.self, capacity: context.bytesPerRow * height)
        var seed: UInt32 = 0x9E37_79B9
        (0..<height).forEach { y in
            (0..<width).forEach { x in
                seed = seed &* 1_664_525 &+ 1_013_904_223
                let noise = noisy ? Int(seed >> 26) : 0
                let offset = y * context.bytesPerRow + x * 4
                pixels[offset] = UInt8(min(255, x * 200 / width + noise))
                pixels[offset + 1] = UInt8(min(255, y * 200 / height + noise))
                pixels[offset + 2] = UInt8(min(255, 90 + noise * 2))
            }
        }
        let image = try XCTUnwrap(context.makeImage())
        let data = NSMutableData()
        let destination = try XCTUnwrap(CGImageDestinationCreateWithData(data, UTType.heic.identifier as CFString, 1, nil))
        let coordinates: [CFString: Any] = gps ? [kCGImagePropertyGPSDictionary: [
            kCGImagePropertyGPSLatitude: 48.8566, kCGImagePropertyGPSLatitudeRef: "N",
            kCGImagePropertyGPSLongitude: 2.3522, kCGImagePropertyGPSLongitudeRef: "E",
        ] as [CFString: Any]] : [:]
        let placeName: [CFString: Any] = place ? [kCGImagePropertyIPTCDictionary: [
            kCGImagePropertyIPTCCity: "Paris", kCGImagePropertyIPTCSubLocation: "Rue de Rivoli",
            kCGImagePropertyIPTCProvinceState: "Île-de-France", kCGImagePropertyIPTCCountryPrimaryLocationName: "France",
        ] as [CFString: Any]] : [:]
        let properties = coordinates.merging(placeName) { first, _ in first }
        CGImageDestinationAddImage(destination, image, properties as CFDictionary)
        XCTAssertTrue(CGImageDestinationFinalize(destination))
        return data as Data
    }

    /// Chaque lieu trouvé, image par image : propriétés GPS et IPTC, balises XMP.
    private static func places(in data: Data) -> [String] {
        guard let source = CGImageSourceCreateWithData(data as CFData, nil) else { return ["illisible"] }
        let iptcKeys: [CFString] = [kCGImagePropertyIPTCCity, kCGImagePropertyIPTCSubLocation, kCGImagePropertyIPTCProvinceState,
                                    kCGImagePropertyIPTCCountryPrimaryLocationName, kCGImagePropertyIPTCContentLocationName,
                                    kCGImagePropertyIPTCContentLocationCode, kCGImagePropertyIPTCExtLocationShown,
                                    kCGImagePropertyIPTCExtLocationCreated]
        let xmpNames: Set<String> = ["City", "State", "Country", "Location", "LocationShown", "LocationCreated",
                                     "IIM2-026", "IIM2-027"]
        return (0..<CGImageSourceGetCount(source)).flatMap { index -> [String] in
            let properties = CGImageSourceCopyPropertiesAtIndex(source, index, nil) as? [CFString: Any] ?? [:]
            let iptc = properties[kCGImagePropertyIPTCDictionary] as? [CFString: Any] ?? [:]
            let tags = CGImageSourceCopyMetadataAtIndex(source, index, nil)
                .flatMap { CGImageMetadataCopyTags($0) as? [CGImageMetadataTag] } ?? []
            let xmp = tags.compactMap { CGImageMetadataTagCopyName($0) as String? }
                .filter { $0.hasPrefix("GPS") || xmpNames.contains($0) }
            return (properties[kCGImagePropertyGPSDictionary] != nil ? ["\(index):GPS"] : [])
                + iptcKeys.filter { iptc[$0] != nil }.map { "\(index):IPTC \($0)" }
                + xmp.map { "\(index):XMP \($0)" }
        }
    }

    private static func image(width: Int = 200, height: Int = 150, green: CGFloat = 0.5) throws -> CGImage {
        let colorSpace = try XCTUnwrap(CGColorSpace(name: CGColorSpace.sRGB))
        let context = try XCTUnwrap(CGContext(data: nil, width: width, height: height, bitsPerComponent: 8, bytesPerRow: 0,
                                              space: colorSpace, bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue))
        context.setFillColor(red: 0.3, green: green, blue: 0.2, alpha: 1)
        context.fill(CGRect(x: 0, y: 0, width: width, height: height))
        return try XCTUnwrap(context.makeImage())
    }

    private static func encoded(_ type: UTType, images: [(CGImage, CGImageMetadata?, [CFString: Any])]) throws -> Data {
        let types = CGImageDestinationCopyTypeIdentifiers() as? [String] ?? []
        try XCTSkipUnless(types.contains(type.identifier), "l'hôte ne sait pas encoder \(type.identifier)")
        let data = NSMutableData()
        let destination = try XCTUnwrap(CGImageDestinationCreateWithData(data, type.identifier as CFString, images.count, nil))
        images.forEach { image, metadata, properties in
            CGImageDestinationAddImageAndMetadata(destination, image, metadata, properties as CFDictionary)
        }
        XCTAssertTrue(CGImageDestinationFinalize(destination))
        return data as Data
    }

    private static func heicWithXmpPlace() throws -> Data {
        let metadata = try XCTUnwrap(CGImageMetadataCreateMutable())
        XCTAssertTrue(CGImageMetadataSetValueWithPath(metadata, nil, "photoshop:City" as CFString, "Paris" as CFString))
        XCTAssertTrue(CGImageMetadataSetValueWithPath(metadata, nil, "Iptc4xmpCore:Location" as CFString, "Louvre" as CFString))
        return try encoded(.heic, images: [(try image(), metadata, [:])])
    }

    private static func heicSequence(gpsOnImage gpsIndex: Int) throws -> Data {
        let gps: [CFString: Any] = [kCGImagePropertyGPSDictionary: [
            kCGImagePropertyGPSLatitude: 48.8566, kCGImagePropertyGPSLatitudeRef: "N",
        ] as [CFString: Any]]
        return try encoded(.heic, images: try [0.2, 0.8].enumerated().map { index, green in
            (try image(green: green), nil, index == gpsIndex ? gps : [:])
        })
    }

    private static func jpegWithContentLocation() throws -> Data {
        let iptc: [CFString: Any] = [kCGImagePropertyIPTCDictionary: [
            kCGImagePropertyIPTCContentLocationName: "Tour Eiffel", kCGImagePropertyIPTCContentLocationCode: "FRA",
        ] as [CFString: Any]]
        return try encoded(.jpeg, images: [(try image(), nil, iptc)])
    }

    private static func placeNames(in properties: [CFString: Any]) -> [String] {
        let iptc = properties[kCGImagePropertyIPTCDictionary] as? [CFString: Any] ?? [:]
        return [kCGImagePropertyIPTCCity, kCGImagePropertyIPTCSubLocation, kCGImagePropertyIPTCProvinceState,
                kCGImagePropertyIPTCCountryPrimaryLocationName].compactMap { iptc[$0] as? String }
    }

    /// Les pixels DÉCODÉS : deux fichiers aux mêmes pixels n'ont pas été ré-encodés entre eux.
    private static func pixels(of data: Data) throws -> Data {
        let source = try XCTUnwrap(CGImageSourceCreateWithData(data as CFData, nil))
        let image = try XCTUnwrap(CGImageSourceCreateImageAtIndex(source, 0, nil))
        return try XCTUnwrap(image.dataProvider?.data) as Data
    }

    private static func properties(of data: Data) throws -> [CFString: Any] {
        let source = try XCTUnwrap(CGImageSourceCreateWithData(data as CFData, nil))
        return try XCTUnwrap(CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any])
    }
}
