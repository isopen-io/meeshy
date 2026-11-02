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
    ///
    /// Et seulement là où ImageIO sait les écrire : le simulateur iOS 26.1 de
    /// la CI refuse `kCGImageDestinationEncodeToISOGainmap` sur TOUTE entrée
    /// HDR — PQ, HLG ou linéaire étendu, demi-flottants ou flottants, JPEG ou
    /// HEIC, 1200×800 comme 64×48 — et n'écrit aucune carte depuis une entrée
    /// SDR (sonde du run 39979122593). La fixture ET le code de production
    /// (`PhotoCaptureProcessor.renderHDR`, `OutgoingImageGainMap`) passent par
    /// cette requête : sans elle, il n'y a rien à prouver. La capacité est
    /// MESURÉE sur le runtime qui juge, jamais supposée par sa version.
    static func requireHDREncoding() throws {
        guard #available(iOS 18.0, macOS 15.0, *) else {
            throw XCTSkip("L'écriture d'une carte de gain ISO demande iOS 18.")
        }
        guard writesISOGainMap() else {
            throw XCTSkip("ImageIO de ce runtime n'écrit aucune carte de gain ISO depuis des pixels HDR "
                + "(sonde 16×16 PQ : Finalize refusé ou carte absente, \(system)) — capacité absente, mesurée.")
        }
    }

    /// La sonde : 16×16 pixels au-delà du blanc de référence, rendus en PQ
    /// demi-flottants comme le fait la production, écrits en JPEG avec
    /// `kCGImageDestinationEncodeToISOGainmap`. Vrai si et seulement si la
    /// sortie porte une carte de gain.
    @available(iOS 18.0, macOS 15.0, *)
    static func writesISOGainMap() -> Bool {
        guard let linear = CGColorSpace(name: CGColorSpace.extendedLinearDisplayP3),
              let pq = CGColorSpace(name: CGColorSpace.displayP3_PQ),
              let bright = CIColor(red: 4, green: 3, blue: 2, alpha: 1, colorSpace: linear) else { return false }
        let frame = CGRect(x: 0, y: 0, width: 16, height: 16)
        guard let image = CIContext().createCGImage(CIImage(color: bright).cropped(to: frame), from: frame,
                                                    format: .RGBAh, colorSpace: pq) else { return false }
        let data = NSMutableData()
        guard let destination = CGImageDestinationCreateWithData(data, UTType.jpeg.identifier as CFString, 1, nil) else {
            return false
        }
        let options: [CFString: Any] = [kCGImageDestinationEncodeRequest: kCGImageDestinationEncodeToISOGainmap]
        CGImageDestinationAddImage(destination, image, options as CFDictionary)
        return CGImageDestinationFinalize(destination) && hasGainMap(data as Data)
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
        XCTAssertTrue(CGImageDestinationFinalize(destination), "fixture : Finalize refusé, \(system)")
        let encoded = data as Data
        XCTAssertTrue(hasGainMap(encoded), "fixture sans carte de gain : \(describe(encoded)) \(system)")
        return encoded
    }

    /// La carte de gain Apple ou ISO, telle qu'un lecteur HDR la trouve.
    static func hasGainMap(_ data: Data) -> Bool {
        guard let source = CGImageSourceCreateWithData(data as CFData, nil) else { return false }
        return gainMapTypes.contains { CGImageSourceCopyAuxiliaryDataInfoAtIndex(source, 0, $0) != nil }
    }

    /// Ce que le témoin VOIT d'une sortie sans carte de gain, en une ligne
    /// courte (l'annotation de la CI coupe à 180 caractères) : la sortie, la
    /// source, et ce que deux autres voies d'ImageIO rendent de la même source.
    static func diagnosis(output: Data?, source: Data, maxPixelSize: Int) -> String {
        "out=\(describe(output)) src=\(describe(source)) keep=\(describe(preservedFromSource(source, maxPixelSize: maxPixelSize))) "
            + "hdr=\(describe(reencodedAsHDR(source, maxPixelSize: maxPixelSize))) \(system)"
    }

    static func describe(_ data: Data?) -> String {
        guard let data, let source = CGImageSourceCreateWithData(data as CFData, nil) else { return "nil" }
        let type = (CGImageSourceGetType(source) as String?)?.split(separator: ".").last.map(String.init) ?? "?"
        let found = auxiliaryLabels.filter { CGImageSourceCopyAuxiliaryDataInfoAtIndex(source, 0, $0.type) != nil }
        return "\(type)[\(found.map { $0.label }.joined(separator: ","))]"
    }

    static var system: String {
        let version = ProcessInfo.processInfo.operatingSystemVersion
        return "iOS\(version.majorVersion).\(version.minorVersion)"
    }

    /// Voie 1 : ImageIO réduit lui-même depuis la source, carte de gain gardée.
    private static func preservedFromSource(_ data: Data, maxPixelSize: Int) -> Data? {
        guard let source = CGImageSourceCreateWithData(data as CFData, nil), let type = CGImageSourceGetType(source) else { return nil }
        let buffer = NSMutableData()
        guard let destination = CGImageDestinationCreateWithData(buffer as CFMutableData, type, 1, nil) else { return nil }
        let options: [CFString: Any] = [
            kCGImageDestinationImageMaxPixelSize: maxPixelSize,
            kCGImageDestinationPreserveGainMap: true,
            kCGImageDestinationLossyCompressionQuality: 0.85,
        ]
        CGImageDestinationAddImageFromSource(destination, source, 0, options as CFDictionary)
        return CGImageDestinationFinalize(destination) ? buffer as Data : nil
    }

    /// Voie 2 : décodage réduit EN HDR, puis une carte de gain ISO recalculée.
    private static func reencodedAsHDR(_ data: Data, maxPixelSize: Int) -> Data? {
        guard #available(iOS 18.0, macOS 15.0, *) else { return nil }
        guard let source = CGImageSourceCreateWithData(data as CFData, nil), let type = CGImageSourceGetType(source) else { return nil }
        let decode: [CFString: Any] = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceThumbnailMaxPixelSize: maxPixelSize,
            kCGImageSourceCreateThumbnailWithTransform: false,
            kCGImageSourceDecodeRequest: kCGImageSourceDecodeToHDR,
        ]
        guard let image = CGImageSourceCreateThumbnailAtIndex(source, 0, decode as CFDictionary) else { return nil }
        let buffer = NSMutableData()
        guard let destination = CGImageDestinationCreateWithData(buffer as CFMutableData, type, 1, nil) else { return nil }
        let options: [CFString: Any] = [
            kCGImageDestinationEncodeRequest: kCGImageDestinationEncodeToISOGainmap,
            kCGImageDestinationLossyCompressionQuality: 0.85,
        ]
        CGImageDestinationAddImage(destination, image, options as CFDictionary)
        return CGImageDestinationFinalize(destination) ? buffer as Data : nil
    }

    private static var auxiliaryLabels: [(type: CFString, label: String)] {
        let common: [(type: CFString, label: String)] = [
            (kCGImageAuxiliaryDataTypeHDRGainMap, "apple"),
            (kCGImageAuxiliaryDataTypeDepth, "depth"),
            (kCGImageAuxiliaryDataTypePortraitEffectsMatte, "matte"),
        ]
        guard #available(iOS 18.0, macOS 15.0, *) else { return common }
        return common + [(kCGImageAuxiliaryDataTypeISOGainMap, "iso")]
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
