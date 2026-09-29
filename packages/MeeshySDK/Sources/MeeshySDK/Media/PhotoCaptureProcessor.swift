import CoreGraphics
import CoreImage
import Foundation
import ImageIO
import UniformTypeIdentifiers

/// **Une photo prise dans Meeshy passe par UN traitement** (#8695).
///
/// Conversation, post, réel, story, capture d'appel : la même chaîne, sans
/// exception. Elle redresse les pixels (plus aucun lecteur n'a à interpréter
/// une orientation EXIF), borne la plus grande dimension (des Mo en moins par
/// envoi), applique une amélioration légère — ombres relevées, bruit doux,
/// netteté fine — puis ré-encode en JPEG ou HEIC en gardant les métadonnées
/// de la prise (EXIF, TIFF, GPS quand l'app y a droit).
///
/// Paramètres opaques, aucun singleton nommé : l'hôte choisit ses réglages,
/// le SDK ne décide ni quand ni pour qui (SDK Purity).
public enum PhotoCaptureFormat: String, Sendable, Equatable {
    case jpeg
    case heic

    public init?(typeIdentifier: String) {
        switch typeIdentifier {
        case UTType.jpeg.identifier: self = .jpeg
        case UTType.heic.identifier, UTType.heif.identifier: self = .heic
        default: return nil
        }
    }

    public var fileExtension: String { self == .jpeg ? "jpg" : "heic" }
    public var mimeType: String { self == .jpeg ? "image/jpeg" : "image/heic" }

    var typeIdentifier: CFString { (self == .jpeg ? UTType.jpeg : UTType.heic).identifier as CFString }
}

public enum PhotoCaptureEnhancement: Sendable, Equatable {
    case none
    case light
}

public struct PhotoCaptureSettings: Sendable, Equatable {
    public let maxPixelDimension: CGFloat
    public let quality: CGFloat
    /// `nil` : le format de la source (HEIC reste HEIC), JPEG à défaut.
    public let format: PhotoCaptureFormat?
    public let enhancement: PhotoCaptureEnhancement

    public init(maxPixelDimension: CGFloat, quality: CGFloat, format: PhotoCaptureFormat?, enhancement: PhotoCaptureEnhancement) {
        self.maxPixelDimension = maxPixelDimension
        self.quality = min(max(quality, 0), 1)
        self.format = format
        self.enhancement = enhancement
    }

    /// La prise de l'objectif : ~6,5 Mpx, largement assez pour un post plein écran.
    public static let capture = PhotoCaptureSettings(maxPixelDimension: 2560, quality: 0.85, format: nil, enhancement: .light)
    /// Une trame d'appel (720p à 1080p) : JPEG, lisible partout.
    public static let callCapture = PhotoCaptureSettings(maxPixelDimension: 1920, quality: 0.85, format: .jpeg, enhancement: .light)
}

public struct ProcessedPhoto: @unchecked Sendable {
    /// Les octets à écrire ou envoyer.
    public let data: Data
    /// Les mêmes pixels, déjà redressés, pour l'affichage immédiat.
    public let image: CGImage
    /// Le format RÉEL des octets (un HEIC indisponible retombe en JPEG).
    public let format: PhotoCaptureFormat
}

public protocol PhotoCaptureProcessorProviding: Sendable {
    func process(encoded data: Data, settings: PhotoCaptureSettings) -> ProcessedPhoto?
    func process(image: CGImage, settings: PhotoCaptureSettings) -> ProcessedPhoto?
}

public final class PhotoCaptureProcessor: PhotoCaptureProcessorProviding, @unchecked Sendable {
    public static let shared = PhotoCaptureProcessor()

    private let context: CIContext

    public init(context: CIContext = CIContext(options: [.cacheIntermediates: false])) {
        self.context = context
    }

    public func process(encoded data: Data, settings: PhotoCaptureSettings) -> ProcessedPhoto? {
        guard let source = CGImageSourceCreateWithData(data as CFData, nil),
              let type = CGImageSourceGetType(source),
              let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any],
              let image = CIImage(data: data, options: [.applyOrientationProperty: true]) else { return nil }
        let format = settings.format ?? PhotoCaptureFormat(typeIdentifier: type as String) ?? .jpeg
        return render(image, metadata: PhotoCaptureMetadata.carried(from: properties), format: format, settings: settings)
    }

    public func process(image: CGImage, settings: PhotoCaptureSettings) -> ProcessedPhoto? {
        render(CIImage(cgImage: image), metadata: PhotoCaptureMetadata.carried(from: [:]), format: settings.format ?? .jpeg, settings: settings)
    }

    private func render(_ input: CIImage, metadata: [CFString: Any], format: PhotoCaptureFormat, settings: PhotoCaptureSettings) -> ProcessedPhoto? {
        let origin = input.extent.origin
        let anchored = input.transformed(by: CGAffineTransform(translationX: -origin.x, y: -origin.y))
        guard let target = PhotoCaptureGeometry.targetSize(for: anchored.extent.size, maxPixelDimension: settings.maxPixelDimension) else { return nil }
        let frame = CGRect(origin: .zero, size: target)
        let enhanced = PhotoCaptureEnhancementChain.apply(settings.enhancement, to: Self.scaled(anchored, to: target))
        let colorSpace = input.colorSpace.flatMap { $0.model == .rgb ? $0 : nil }
            ?? CGColorSpace(name: CGColorSpace.sRGB) ?? CGColorSpaceCreateDeviceRGB()
        guard let rendered = context.createCGImage(enhanced, from: frame, format: .RGBA8, colorSpace: colorSpace),
              let encoded = PhotoCaptureEncoder.encode(rendered, as: format, quality: settings.quality, metadata: metadata) else { return nil }
        return ProcessedPhoto(data: encoded.data, image: rendered, format: encoded.format)
    }

    private static func scaled(_ image: CIImage, to target: CGSize) -> CIImage {
        let size = image.extent.size
        guard target != size else { return image }
        let scale = target.height / size.height
        let aspect = (target.width / size.width) / scale
        return image
            .applyingFilter("CILanczosScaleTransform", parameters: [kCIInputScaleKey: scale, kCIInputAspectRatioKey: aspect])
            .cropped(to: CGRect(origin: .zero, size: target))
    }
}

public enum PhotoCaptureGeometry {
    public static func targetSize(for size: CGSize, maxPixelDimension: CGFloat) -> CGSize? {
        guard size.width > 0, size.height > 0, maxPixelDimension > 0 else { return nil }
        let longest = max(size.width, size.height)
        guard longest > maxPixelDimension else { return CGSize(width: size.width.rounded(), height: size.height.rounded()) }
        let ratio = maxPixelDimension / longest
        return CGSize(width: (size.width * ratio).rounded(), height: (size.height * ratio).rounded())
    }
}

/// Ce qui voyage de la prise au fichier : l'EXIF, le TIFF, la position, l'IPTC.
/// Les pixels étant redressés, l'orientation devient 1 ; les dimensions sont
/// réécrites par l'encodeur ; les notes fabricant (opaques, lourdes) ne suivent pas.
enum PhotoCaptureMetadata {
    private static var carriedKeys: Set<CFString> {
        [
            kCGImagePropertyExifDictionary,
            kCGImagePropertyTIFFDictionary,
            kCGImagePropertyGPSDictionary,
            kCGImagePropertyIPTCDictionary,
        ]
    }

    static func carried(from source: [CFString: Any]) -> [CFString: Any] {
        let kept = source
            .filter { carriedKeys.contains($0.key) }
            .map { ($0.key, rewritten($0.value, under: $0.key)) }
        return Dictionary(uniqueKeysWithValues: kept)
            .merging([kCGImagePropertyOrientation: 1]) { _, upright in upright }
    }

    private static func rewritten(_ value: Any, under key: CFString) -> Any {
        guard let dictionary = value as? [CFString: Any] else { return value }
        if key == kCGImagePropertyExifDictionary {
            return dictionary.filter { $0.key != kCGImagePropertyExifPixelXDimension && $0.key != kCGImagePropertyExifPixelYDimension }
        }
        if key == kCGImagePropertyTIFFDictionary {
            return dictionary.merging([kCGImagePropertyTIFFOrientation: 1]) { _, upright in upright }
        }
        return dictionary
    }
}

/// L'amélioration LÉGÈRE : jamais un filtre qui se voit, toujours une photo
/// un peu plus propre. Ombres relevées sans toucher aux hautes lumières, bruit
/// de capteur adouci, netteté de luminance fine (après la réduction, pour ne
/// pas raviver le bruit). Les bords sont étendus avant filtrage pour qu'aucune
/// convolution ne les assombrisse.
enum PhotoCaptureEnhancementChain {
    static func apply(_ enhancement: PhotoCaptureEnhancement, to image: CIImage) -> CIImage {
        guard enhancement == .light else { return image }
        return image
            .clampedToExtent()
            .applyingFilter("CIHighlightShadowAdjust", parameters: ["inputShadowAmount": 0.2, "inputHighlightAmount": 0.95])
            .applyingFilter("CIVibrance", parameters: ["inputAmount": 0.08])
            .applyingFilter("CINoiseReduction", parameters: ["inputNoiseLevel": 0.012, "inputSharpness": 0.35])
            .applyingFilter("CISharpenLuminance", parameters: [kCIInputSharpnessKey: 0.25])
            .cropped(to: image.extent)
    }
}

enum PhotoCaptureEncoder {
    struct Encoded {
        let data: Data
        let format: PhotoCaptureFormat
    }

    /// HEIC n'est pas encodable partout (certains simulateurs) : JPEG en repli,
    /// et le format rendu dit TOUJOURS ce que sont les octets.
    static func encode(_ image: CGImage, as format: PhotoCaptureFormat, quality: CGFloat, metadata: [CFString: Any]) -> Encoded? {
        if let data = encoded(image, as: format, quality: quality, metadata: metadata) {
            return Encoded(data: data, format: format)
        }
        guard format == .heic, let data = encoded(image, as: .jpeg, quality: quality, metadata: metadata) else { return nil }
        return Encoded(data: data, format: .jpeg)
    }

    private static func encoded(_ image: CGImage, as format: PhotoCaptureFormat, quality: CGFloat, metadata: [CFString: Any]) -> Data? {
        let buffer = NSMutableData()
        guard let destination = CGImageDestinationCreateWithData(buffer, format.typeIdentifier, 1, nil) else { return nil }
        let options = metadata.merging([kCGImageDestinationLossyCompressionQuality: quality]) { _, requested in requested }
        CGImageDestinationAddImage(destination, image, options as CFDictionary)
        guard CGImageDestinationFinalize(destination) else { return nil }
        return buffer as Data
    }
}
