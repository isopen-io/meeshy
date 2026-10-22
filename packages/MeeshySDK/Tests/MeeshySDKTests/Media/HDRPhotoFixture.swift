import CoreGraphics
import CoreImage
import Foundation
import ImageIO
import UniformTypeIdentifiers
import XCTest

/// Une prise HDR fabriquée comme l'appareil la livre : une base SDR et sa carte
/// de gain (ISO 21496-1), lue par ImageIO. Sert les témoins du verdict #11247
/// (« profil couleur et HDR conservés »).
enum HDRPhotoFixture {
    /// Les pixels HDR (au-delà du blanc de référence) ne s'écrivent avec leur
    /// carte de gain que depuis iOS 18 : en deçà, le témoin n'a pas de fixture.
    static func requireHDREncoding() throws {
        guard #available(iOS 18.0, macOS 15.0, *) else {
            throw XCTSkip("L'écriture d'une carte de gain ISO demande iOS 18.")
        }
    }

    @available(iOS 18.0, macOS 15.0, *)
    static func jpeg(width: Int, height: Int, orientation: Int = 1) throws -> Data {
        let linear = try XCTUnwrap(CGColorSpace(name: CGColorSpace.extendedLinearDisplayP3))
        let pq = try XCTUnwrap(CGColorSpace(name: CGColorSpace.displayP3_PQ))
        let dark = try XCTUnwrap(CIColor(red: 0.05, green: 0.1, blue: 0.2, alpha: 1, colorSpace: linear))
        let bright = try XCTUnwrap(CIColor(red: 4, green: 3, blue: 2, alpha: 1, colorSpace: linear))
        let frame = CGRect(x: 0, y: 0, width: width, height: height)
        let gradient = try XCTUnwrap(CIFilter(name: "CILinearGradient", parameters: [
            "inputPoint0": CIVector(x: 0, y: 0),
            "inputPoint1": CIVector(x: CGFloat(width), y: CGFloat(height)),
            "inputColor0": dark,
            "inputColor1": bright,
        ])?.outputImage?.cropped(to: frame))
        let hdr = try XCTUnwrap(CIContext().createCGImage(gradient, from: frame, format: .RGBAh, colorSpace: pq))
        let data = NSMutableData()
        let destination = try XCTUnwrap(CGImageDestinationCreateWithData(data, UTType.jpeg.identifier as CFString, 1, nil))
        let options: [CFString: Any] = [
            kCGImageDestinationEncodeRequest: kCGImageDestinationEncodeToISOGainmap,
            kCGImagePropertyOrientation: orientation,
            kCGImageDestinationLossyCompressionQuality: 0.95,
        ]
        CGImageDestinationAddImage(destination, hdr, options as CFDictionary)
        XCTAssertTrue(CGImageDestinationFinalize(destination))
        let encoded = data as Data
        XCTAssertTrue(hasGainMap(encoded), "la fixture doit porter sa carte de gain, sinon le témoin ne garde rien")
        return encoded
    }

    /// La carte de gain Apple ou ISO, telle qu'un lecteur HDR la trouve.
    static func hasGainMap(_ data: Data) -> Bool {
        guard let source = CGImageSourceCreateWithData(data as CFData, nil) else { return false }
        return gainMapTypes.contains { CGImageSourceCopyAuxiliaryDataInfoAtIndex(source, 0, $0) != nil }
    }

    static func orientation(of data: Data) -> Int {
        guard let source = CGImageSourceCreateWithData(data as CFData, nil),
              let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any] else { return 0 }
        return (properties[kCGImagePropertyOrientation] as? Int) ?? 1
    }

    private static var gainMapTypes: [CFString] {
        guard #available(iOS 18.0, macOS 15.0, *) else { return [kCGImageAuxiliaryDataTypeHDRGainMap] }
        return [kCGImageAuxiliaryDataTypeHDRGainMap, kCGImageAuxiliaryDataTypeISOGainMap]
    }
}
