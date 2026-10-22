import CoreGraphics
import Foundation
import ImageIO
import UniformTypeIdentifiers

/// **Une photo n'est encodée qu'UNE fois entre la prise et l'envoi** (#9885).
///
/// Verdict porteur #11247 : « sans perte » veut dire sans perte
/// VISUELLE, en gardant l'effet d'image HD. Les octets d'origine partent tels
/// quels dès qu'ils tiennent dans le budget ; un PNG n'est jamais converti en
/// JPEG ; le lieu (GPS) est retiré SANS ré-encoder les pixels, sauf si
/// l'utilisateur a choisi de le conserver. Une seule génération d'encodage
/// quand il faut réduire, ou rendre un HEIC lisible par le web.
///
/// Paramètres opaques, aucun singleton : l'hôte décide du budget et lit les
/// préférences (SDK Purity).
public enum OutgoingImageFormat: String, Sendable, Equatable, CaseIterable {
    case jpeg
    case png
    case gif
    case webp
    case heic
    case unknown

    /// Le type lu dans les OCTETS, jamais dans le nom du fichier.
    public init(sniffing data: Data) {
        guard data.count >= 12 else { self = .unknown; return }
        let head = [UInt8](data.prefix(12))
        self = Self.signatures.first { signature in
            signature.marks.allSatisfy { mark in
                Array(head[mark.offset..<(mark.offset + mark.bytes.count)]) == mark.bytes
            }
        }?.format ?? .unknown
    }

    private struct Mark {
        let offset: Int
        let bytes: [UInt8]
    }

    private static let signatures: [(format: OutgoingImageFormat, marks: [Mark])] = [
        (.jpeg, [Mark(offset: 0, bytes: [0xFF, 0xD8, 0xFF])]),
        (.png, [Mark(offset: 0, bytes: [0x89, 0x50, 0x4E, 0x47])]),
        (.gif, [Mark(offset: 0, bytes: [0x47, 0x49, 0x46, 0x38])]),
        (.webp, [Mark(offset: 0, bytes: [0x52, 0x49, 0x46, 0x46]), Mark(offset: 8, bytes: [0x57, 0x45, 0x42, 0x50])]),
        (.heic, [Mark(offset: 4, bytes: [0x66, 0x74, 0x79, 0x70])]),
    ]

    /// `nil` pour un format que les octets ne disent pas.
    public var mimeType: String? {
        switch self {
        case .jpeg: return "image/jpeg"
        case .png: return "image/png"
        case .gif: return "image/gif"
        case .webp: return "image/webp"
        case .heic: return "image/heic"
        case .unknown: return nil
        }
    }

    var typeIdentifier: CFString? {
        switch self {
        case .jpeg: return UTType.jpeg.identifier as CFString
        case .png: return UTType.png.identifier as CFString
        case .heic: return UTType.heic.identifier as CFString
        case .gif, .webp, .unknown: return nil
        }
    }

    var isLossy: Bool { self != .png }
}

public struct OutgoingImagePolicy: Sendable, Equatable {
    /// Le plancher perceptuel du verdict #11247.
    public static let perceptualQuality: CGFloat = 0.85
    /// Préférence `compressImagesOnUpload` coupée : la définition HD part intacte
    /// jusqu'à ce plafond (12 Mpx d'un iPhone tiennent dessous).
    public static let defaultHDPixelCeiling: CGFloat = 4096
    /// Au-delà, même sans compression demandée, la photo revient au budget du contexte.
    public static let defaultPassthroughByteCeiling = 12 * 1024 * 1024

    public let maxPixelDimension: CGFloat
    public let compresses: Bool
    public let quality: CGFloat
    public let keepsLocation: Bool
    public let hdPixelCeiling: CGFloat
    public let passthroughByteCeiling: Int

    public init(maxPixelDimension: CGFloat, compresses: Bool, quality: CGFloat, keepsLocation: Bool,
                hdPixelCeiling: CGFloat = OutgoingImagePolicy.defaultHDPixelCeiling,
                passthroughByteCeiling: Int = OutgoingImagePolicy.defaultPassthroughByteCeiling) {
        self.maxPixelDimension = max(maxPixelDimension, 1)
        self.compresses = compresses
        self.quality = min(max(quality, 0.5), 1)
        self.keepsLocation = keepsLocation
        self.hdPixelCeiling = max(hdPixelCeiling, self.maxPixelDimension)
        self.passthroughByteCeiling = passthroughByteCeiling
    }

    /// `imageCompressionQuality` (0–100) ramené à une qualité d'encodeur bornée.
    public static func quality(percent: Int) -> CGFloat {
        min(max(CGFloat(percent) / 100, 0.5), 1)
    }

    /// La plus grande dimension admise pour ce fichier.
    public func pixelBudget(byteCount: Int) -> CGFloat {
        compresses || byteCount > passthroughByteCeiling ? maxPixelDimension : hdPixelCeiling
    }
}

public enum OutgoingImagePlan: Sendable, Equatable {
    /// Les octets d'origine, à l'identique.
    case passthrough
    /// Les mêmes pixels compressés, sans le lieu : réécriture des métadonnées seule.
    case stripLocation
    /// UNE génération d'encodage ; `maxPixelDimension == nil` garde la définition.
    case reencode(OutgoingImageFormat, maxPixelDimension: CGFloat?)
}

public enum OutgoingImagePlanner {
    public static func plan(format: OutgoingImageFormat, pixelSize: CGSize, byteCount: Int,
                            carriesLocation: Bool, policy: OutgoingImagePolicy) -> OutgoingImagePlan {
        let budget = policy.pixelBudget(byteCount: byteCount)
        let resize: CGFloat? = max(pixelSize.width, pixelSize.height) > budget ? budget : nil
        switch format {
        case .gif, .webp:
            return .passthrough
        case .heic, .unknown:
            return .reencode(.jpeg, maxPixelDimension: resize)
        case .jpeg, .png:
            if let resize { return .reencode(format, maxPixelDimension: resize) }
            return carriesLocation && !policy.keepsLocation ? .stripLocation : .passthrough
        }
    }
}

public struct OutgoingImage: Sendable, Equatable {
    public let data: Data
    public let format: OutgoingImageFormat
    /// Définition DEBOUT des octets remis ; `nil` s'ils ne se décodent pas.
    public let pixelSize: CGSize?
    /// Encodages de pixels faits ICI : 0 (octets d'origine) ou 1.
    public let encodedGenerations: Int
}

public protocol OutgoingImagePreparing: Sendable {
    func prepare(_ data: Data, policy: OutgoingImagePolicy) -> OutgoingImage?
}

public struct OutgoingImagePreparer: OutgoingImagePreparing {
    public init() {}

    /// `nil` ⇒ l'image ne peut pas partir sans emporter un lieu que
    /// l'utilisateur n'a pas choisi de partager (fail-closed).
    public func prepare(_ data: Data, policy: OutgoingImagePolicy) -> OutgoingImage? {
        let format = OutgoingImageFormat(sniffing: data)
        guard let source = CGImageSourceCreateWithData(data as CFData, [kCGImageSourceShouldCache: false] as CFDictionary),
              CGImageSourceGetCount(source) > 0,
              let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any],
              let stored = OutgoingImageGeometry.storedSize(properties) else {
            return OutgoingImage(data: data, format: format, pixelSize: nil, encodedGenerations: 0)
        }
        let upright = OutgoingImageGeometry.upright(stored, properties: properties)
        let carriesLocation = properties[kCGImagePropertyGPSDictionary] != nil
        let original = OutgoingImage(data: data, format: format, pixelSize: upright, encodedGenerations: 0)
        let mayFallBackToOriginal = !carriesLocation || policy.keepsLocation
        switch OutgoingImagePlanner.plan(format: format, pixelSize: upright, byteCount: data.count,
                                         carriesLocation: carriesLocation, policy: policy) {
        case .passthrough:
            return original
        case .stripLocation:
            let stripped = OutgoingImageWriter.withoutLocation(source)
                .map { OutgoingImage(data: $0, format: format, pixelSize: upright, encodedGenerations: 0) }
            return stripped ?? OutgoingImageWriter.reencoded(source, properties: properties, as: format,
                                                             maxPixelDimension: nil, policy: policy)
        case .reencode(let target, let maxPixelDimension):
            let reencoded = OutgoingImageWriter.reencoded(source, properties: properties, as: target,
                                                          maxPixelDimension: maxPixelDimension, policy: policy)
            return reencoded ?? (mayFallBackToOriginal ? original : nil)
        }
    }
}

enum OutgoingImageGeometry {
    static func storedSize(_ properties: [CFString: Any]) -> CGSize? {
        guard let width = (properties[kCGImagePropertyPixelWidth] as? NSNumber)?.doubleValue,
              let height = (properties[kCGImagePropertyPixelHeight] as? NSNumber)?.doubleValue,
              width > 0, height > 0 else { return nil }
        return CGSize(width: width, height: height)
    }

    /// Les orientations EXIF 5 à 8 couchent l'image : sa définition debout s'inverse.
    static func upright(_ size: CGSize, properties: [CFString: Any]) -> CGSize {
        let orientation = (properties[kCGImagePropertyOrientation] as? NSNumber)?.intValue ?? 1
        return (5...8).contains(orientation) ? CGSize(width: size.height, height: size.width) : size
    }
}

enum OutgoingImageWriter {
    /// Réécrit les métadonnées sans toucher aux données compressées des pixels.
    static func withoutLocation(_ source: CGImageSource) -> Data? {
        guard let type = CGImageSourceGetType(source) else { return nil }
        let buffer = NSMutableData()
        guard let destination = CGImageDestinationCreateWithData(buffer as CFMutableData, type, 1, nil) else { return nil }
        let options: [CFString: Any] = [kCGImageMetadataShouldExcludeGPS: true]
        guard CGImageDestinationCopyImageSource(destination, source, options as CFDictionary, nil) else { return nil }
        return buffer as Data
    }

    /// LA génération d'encodage : décodage réduit et redressé par ImageIO, profil
    /// couleur porté par l'image, métadonnées de la prise sans le lieu sauf choix contraire.
    static func reencoded(_ source: CGImageSource, properties: [CFString: Any], as format: OutgoingImageFormat,
                          maxPixelDimension: CGFloat?, policy: OutgoingImagePolicy) -> OutgoingImage? {
        guard let type = format.typeIdentifier,
              let stored = OutgoingImageGeometry.storedSize(properties) else { return nil }
        let limit = maxPixelDimension ?? max(stored.width, stored.height)
        let thumbnailOptions: [CFString: Any] = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceShouldCacheImmediately: true,
            kCGImageSourceThumbnailMaxPixelSize: limit,
        ]
        guard let image = CGImageSourceCreateThumbnailAtIndex(source, 0, thumbnailOptions as CFDictionary) else { return nil }
        let carried = PhotoCaptureMetadata.carried(from: properties)
            .filter { policy.keepsLocation || $0.key != kCGImagePropertyGPSDictionary }
        let quality: [CFString: Any] = format.isLossy ? [kCGImageDestinationLossyCompressionQuality: policy.quality] : [:]
        let options = carried.merging(quality) { _, requested in requested }
        let buffer = NSMutableData()
        guard let destination = CGImageDestinationCreateWithData(buffer as CFMutableData, type, 1, nil) else { return nil }
        CGImageDestinationAddImage(destination, image, options as CFDictionary)
        guard CGImageDestinationFinalize(destination) else { return nil }
        return OutgoingImage(data: buffer as Data, format: format,
                             pixelSize: CGSize(width: image.width, height: image.height), encodedGenerations: 1)
    }
}

/// Réglages › Médias « Conserver le lieu des photos envoyées » — désactivé par
/// défaut (#11247, point 2). Préférence de l'appareil, lue par l'hôte.
public enum OutgoingImageLocationSetting {
    public static let key = "media.outgoing.keepsPhotoLocation"
    public static let standard = false

    public static func stored(in defaults: UserDefaults = .standard) -> Bool {
        defaults.object(forKey: key) as? Bool ?? standard
    }
}
