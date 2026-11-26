import CoreGraphics
import Foundation
import ImageIO
import XCTest
@testable import MeeshySDK

/// #12498 — une photo HDR géolocalisée part, en SDR s'il le faut, quand le
/// runtime ne sait pas écrire sa carte de gain : jamais refusée, jamais avec
/// son lieu, toujours en une génération.
final class OutgoingImageHDRFallbackTests: XCTestCase {

    func test_prepare_geolocatedHdrPhoto_leavesWithoutGPS_inOneGeneration_whateverTheGainMapCapability() throws {
        guard #available(iOS 18.0, macOS 15.0, *) else { throw XCTSkip("La carte de gain demande iOS 18.") }
        let data = try HDRPhotoFixture.geolocatedJPEG(width: 1200, height: 800)
        XCTAssertNotNil(try Self.gps(of: data), "le témoin part d'une photo géolocalisée")
        let policy = OutgoingImagePolicy(maxPixelDimension: 600, compresses: true, quality: 0.85, keepsLocation: false)

        let out = try XCTUnwrap(OutgoingImagePreparer().prepare(data, policy: policy),
                                "la photo HDR géolocalisée doit partir (\(HDRPhotoFixture.system))")

        XCTAssertNil(try Self.gps(of: out.data), "le lieu ne part jamais")
        XCTAssertEqual(out.encodedGenerations, 1)
        XCTAssertEqual(out.pixelSize, CGSize(width: 600, height: 400))
        XCTAssertEqual(HDRPhotoFixture.hasGainMap(out.data), HDRPhotoFixture.writesISOGainMap(),
                       HDRPhotoFixture.diagnosis(output: out.data, source: data, maxPixelSize: 600))
    }

    private static func gps(of data: Data) throws -> Any? {
        let source = try XCTUnwrap(CGImageSourceCreateWithData(data as CFData, nil))
        let properties = try XCTUnwrap(CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any])
        return properties[kCGImagePropertyGPSDictionary]
    }
}
