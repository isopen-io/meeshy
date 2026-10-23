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
    /// Bruit adouci et netteté fine — ni ton ni couleur : la photo rend ce que
    /// le viseur montrait (#9327).
    case faithful
    /// `faithful` plus ombres relevées et vibrance : une trame d'appel, que
    /// personne n'a vue en viseur avant la prise.
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
    public static let capture = PhotoCaptureSettings(maxPixelDimension: 2560, quality: 0.85, format: nil, enhancement: .faithful)
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
        let metadata = PhotoCaptureMetadata.carried(from: properties)
        return renderHDR(data, source: source, metadata: metadata, format: format, settings: settings)
            ?? render(image, metadata: metadata, format: format, settings: settings)
    }

    public func process(image: CGImage, settings: PhotoCaptureSettings) -> ProcessedPhoto? {
        render(CIImage(cgImage: image), metadata: PhotoCaptureMetadata.carried(from: [:]), format: settings.format ?? .jpeg, settings: settings)
    }

    private func render(_ input: CIImage, metadata: [CFString: Any], format: PhotoCaptureFormat, settings: PhotoCaptureSettings) -> ProcessedPhoto? {
        guard let prepared = Self.prepared(input, settings: settings) else { return nil }
        let colorSpace = input.colorSpace.flatMap { $0.model == .rgb ? $0 : nil }
            ?? CGColorSpace(name: CGColorSpace.sRGB) ?? CGColorSpaceCreateDeviceRGB()
        guard let rendered = context.createCGImage(prepared.image, from: prepared.frame, format: .RGBA8, colorSpace: colorSpace),
              let encoded = PhotoCaptureEncoder.encode(rendered, as: format, quality: settings.quality, metadata: metadata) else { return nil }
        return ProcessedPhoto(data: encoded.data, image: rendered, format: encoded.format)
    }

    /// **Le HDR de la prise survit au traitement** (verdict #11247, #11847).
    /// L'image est lue AVEC sa carte de gain (pixels au-delà du blanc de
    /// référence), redressée, réduite et nettoyée comme une prise SDR, rendue en
    /// demi-flottants PQ, puis écrite en UNE génération : une base SDR et une
    /// carte de gain ISO recalculée sur les pixels redressés. Avant iOS 18, ou
    /// sans carte de gain dans la source, la prise reste SDR (`nil`).
    private func renderHDR(_ data: Data, source: CGImageSource, metadata: [CFString: Any],
                           format: PhotoCaptureFormat, settings: PhotoCaptureSettings) -> ProcessedPhoto? {
        guard #available(iOS 18.0, macOS 15.0, *) else { return nil }
        guard OutgoingImageGainMap.isPresent(in: source),
              let input = CIImage(data: data, options: [.applyOrientationProperty: true, .expandToHDR: true]),
              let prepared = Self.prepared(input, settings: settings),
              let space = CGColorSpace(name: CGColorSpace.displayP3_PQ),
              let rendered = context.createCGImage(prepared.image, from: prepared.frame, format: .RGBAh, colorSpace: space),
              let encoded = PhotoCaptureEncoder.encode(rendered, as: format, quality: settings.quality,
                                                       metadata: metadata, gainMap: true),
              let shown = PhotoCaptureEncoder.base(of: encoded.data) else { return nil }
        return ProcessedPhoto(data: encoded.data, image: shown, format: encoded.format)
    }

    /// Redressée, ancrée à l'origine, réduite au plafond et nettoyée — la même
    /// chaîne pour une prise SDR et une prise HDR.
    private static func prepared(_ input: CIImage, settings: PhotoCaptureSettings) -> (frame: CGRect, image: CIImage)? {
        let origin = input.extent.origin
        let anchored = input.transformed(by: CGAffineTransform(translationX: -origin.x, y: -origin.y))
        guard let target = PhotoCaptureGeometry.targetSize(for: anchored.extent.size, maxPixelDimension: settings.maxPixelDimension) else { return nil }
        let enhanced = PhotoCaptureEnhancementChain.apply(settings.enhancement, to: scaled(anchored, to: target))
        return (frame: CGRect(origin: .zero, size: target), image: enhanced)
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

    /// `orientation` : celle des pixels écrits — 1 quand ils ont été redressés,
    /// celle de la source quand ils restent stockés tels quels.
    static func carried(from source: [CFString: Any], orientation: Int = 1) -> [CFString: Any] {
        let kept = source
            .filter { carriedKeys.contains($0.key) }
            .map { ($0.key, rewritten($0.value, under: $0.key, orientation: orientation)) }
        return Dictionary(uniqueKeysWithValues: kept)
            .merging([kCGImagePropertyOrientation: orientation]) { _, written in written }
    }

    private static func rewritten(_ value: Any, under key: CFString, orientation: Int) -> Any {
        guard let dictionary = value as? [CFString: Any] else { return value }
        if key == kCGImagePropertyExifDictionary {
            return dictionary.filter { $0.key != kCGImagePropertyExifPixelXDimension && $0.key != kCGImagePropertyExifPixelYDimension }
        }
        if key == kCGImagePropertyTIFFDictionary {
            return dictionary.merging([kCGImagePropertyTIFFOrientation: orientation]) { _, written in written }
        }
        return dictionary
    }
}

/// L'amélioration : jamais un filtre qui se voit. `faithful` ne fait que
/// nettoyer — bruit de capteur adouci, netteté de luminance fine (après la
/// réduction, pour ne pas raviver le bruit) ; `light` relève en plus les
/// ombres et la vibrance. Les bords sont étendus avant filtrage pour qu'aucune
/// convolution ne les assombrisse.
enum PhotoCaptureEnhancementChain {
    static func apply(_ enhancement: PhotoCaptureEnhancement, to image: CIImage) -> CIImage {
        switch enhancement {
        case .none:
            return image
        case .faithful:
            return cleaned(image.clampedToExtent()).cropped(to: image.extent)
        case .light:
            let toned = image
                .clampedToExtent()
                .applyingFilter("CIHighlightShadowAdjust", parameters: ["inputShadowAmount": 0.2, "inputHighlightAmount": 0.95])
                .applyingFilter("CIVibrance", parameters: ["inputAmount": 0.08])
            return cleaned(toned).cropped(to: image.extent)
        }
    }

    private static func cleaned(_ image: CIImage) -> CIImage {
        image
            .applyingFilter("CINoiseReduction", parameters: ["inputNoiseLevel": 0.012, "inputSharpness": 0.35])
            .applyingFilter("CISharpenLuminance", parameters: [kCIInputSharpnessKey: 0.25])
    }
}

enum PhotoCaptureEncoder {
    struct Encoded {
        let data: Data
        let format: PhotoCaptureFormat
    }

    /// HEIC n'est pas encodable partout (certains simulateurs) : JPEG en repli,
    /// et le format rendu dit TOUJOURS ce que sont les octets.
    /// `gainMap` : l'image est HDR, l'encodeur en écrit une base SDR et la
    /// carte de gain ISO qui la ramène au HDR.
    static func encode(_ image: CGImage, as format: PhotoCaptureFormat, quality: CGFloat,
                       metadata: [CFString: Any], gainMap: Bool = false) -> Encoded? {
        let options = metadata
            .merging([kCGImageDestinationLossyCompressionQuality: quality]) { _, requested in requested }
            .merging(gainMap ? gainMapRequest : [:]) { _, requested in requested }
        if let data = encoded(image, as: format, options: options) {
            return Encoded(data: data, format: format)
        }
        guard format == .heic, let data = encoded(image, as: .jpeg, options: options) else { return nil }
        return Encoded(data: data, format: .jpeg)
    }

    /// La base SDR des octets écrits : ce que l'écran montre tout de suite,
    /// identique à ce qui part.
    static func base(of data: Data) -> CGImage? {
        guard let source = CGImageSourceCreateWithData(data as CFData, nil) else { return nil }
        return CGImageSourceCreateImageAtIndex(source, 0, [kCGImageSourceShouldCacheImmediately: true] as CFDictionary)
    }

    private static var gainMapRequest: [CFString: Any] {
        guard #available(iOS 18.0, macOS 15.0, *) else { return [:] }
        return [kCGImageDestinationEncodeRequest: kCGImageDestinationEncodeToISOGainmap]
    }

    private static func encoded(_ image: CGImage, as format: PhotoCaptureFormat, options: [CFString: Any]) -> Data? {
        let buffer = NSMutableData()
        guard let destination = CGImageDestinationCreateWithData(buffer, format.typeIdentifier, 1, nil) else { return nil }
        CGImageDestinationAddImage(destination, image, options as CFDictionary)
        guard CGImageDestinationFinalize(destination) else { return nil }
        return buffer as Data
    }
}
