import CoreGraphics
import CoreImage
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

/// **Ce que l'envoi fait d'une photo** (#9885, verdict #11247).
///
/// Par défaut (`compresses == false`) : la définition HD est gardée (au plus
/// `hdPixelCeiling` de côté long) et la photo part en UNE génération perceptuelle
/// à q 0,85, sauf si l'original est déjà aussi efficace. Au-delà de `byteCeiling`,
/// la définition descend par paliers HD (`hdSteps`), jamais au budget du contexte.
///
/// `compresses == true` est la **compression forte** que l'utilisateur choisit
/// pour économiser des données (`compressImagesOnUpload`) : budget du contexte
/// (1 200 px pour un message) et qualité de sa préférence.
public struct OutgoingImagePolicy: Sendable, Equatable {
    /// Le plancher perceptuel du verdict #11247.
    public static let perceptualQuality: CGFloat = 0.85
    public static let defaultHDPixelCeiling: CGFloat = 4096
    /// Les paliers HD, du plus grand au plus petit, qu'une photo trop lourde descend.
    public static let hdSteps: [CGFloat] = [4096, 3072, 2560]
    /// Le poids jugé déraisonnable pour une photo HD (au-delà, palier suivant).
    public static let defaultByteCeiling = 8 * 1024 * 1024
    /// Un réencodage qui gagne moins que cette part du poids ne paie pas sa
    /// génération : l'original, déjà efficace, part tel quel.
    public static let minimumGain = 0.15

    public let maxPixelDimension: CGFloat
    public let compresses: Bool
    public let quality: CGFloat
    public let keepsLocation: Bool
    public let hdPixelCeiling: CGFloat
    public let byteCeiling: Int
    /// Ce que devient un HEIC (#11291) : tel quel, ou un JPEG de compatibilité.
    /// Le défaut est le JPEG : seul un hôte qui sait repartir en JPEG quand le
    /// serveur refuse (`HEICUploadFallback`) passe en `.native`.
    public let heicDelivery: HEICDelivery

    public init(maxPixelDimension: CGFloat, compresses: Bool, quality: CGFloat, keepsLocation: Bool,
                hdPixelCeiling: CGFloat = OutgoingImagePolicy.defaultHDPixelCeiling,
                byteCeiling: Int = OutgoingImagePolicy.defaultByteCeiling,
                heicDelivery: HEICDelivery = .jpegCompatibility) {
        self.maxPixelDimension = max(maxPixelDimension, 1)
        self.compresses = compresses
        self.quality = min(max(quality, 0.5), 1)
        self.keepsLocation = keepsLocation
        self.hdPixelCeiling = max(hdPixelCeiling, self.maxPixelDimension)
        self.byteCeiling = byteCeiling
        self.heicDelivery = heicDelivery
    }

    /// `imageCompressionQuality` (0–100) ramené à une qualité d'encodeur bornée.
    public static func quality(percent: Int) -> CGFloat {
        min(max(CGFloat(percent) / 100, 0.5), 1)
    }

    /// La plus grande dimension admise : le budget du contexte en compression
    /// forte, le plafond HD sinon.
    public var pixelBudget: CGFloat {
        compresses ? maxPixelDimension : hdPixelCeiling
    }

    /// Le palier HD suivant, strictement sous `longestSide` ; `nil` en compression
    /// forte (déjà au budget) ou sous le dernier palier.
    public func step(below longestSide: CGFloat) -> CGFloat? {
        guard !compresses else { return nil }
        return Self.hdSteps.first { $0 < longestSide && $0 <= hdPixelCeiling }
    }
}

public enum OutgoingImagePlan: Sendable, Equatable {
    /// Les octets d'origine, à l'identique.
    case passthrough
    /// Les mêmes pixels compressés, sans le lieu : réécriture des métadonnées seule.
    case stripLocation
    /// UNE génération d'encodage ; `maxPixelDimension == nil` garde la définition.
    case reencode(OutgoingImageFormat, maxPixelDimension: CGFloat?)
    /// Une génération, SAUF si l'original pèse déjà à peine plus que l'essai
    /// (gain < `minimumGain`) : il part alors tel quel, lieu retiré.
    case reencodeUnlessAlreadyEfficient(OutgoingImageFormat, maxPixelDimension: CGFloat?)
}

public enum OutgoingImagePlanner {
    public static func plan(format: OutgoingImageFormat, pixelSize: CGSize, byteCount: Int,
                            carriesLocation: Bool, policy: OutgoingImagePolicy) -> OutgoingImagePlan {
        let budget = policy.pixelBudget
        let resize: CGFloat? = max(pixelSize.width, pixelSize.height) > budget ? budget : nil
        switch format {
        case .gif, .webp:
            return .passthrough
        case .heic where policy.heicDelivery == .native:
            if let resize { return .reencode(.heic, maxPixelDimension: resize) }
            return carriesLocation && !policy.keepsLocation ? .stripLocation : .passthrough
        case .heic, .unknown:
            return .reencode(.jpeg, maxPixelDimension: resize)
        case .png:
            if let resize { return .reencode(.png, maxPixelDimension: resize) }
            return carriesLocation && !policy.keepsLocation ? .stripLocation : .passthrough
        case .jpeg:
            if let resize { return .reencode(.jpeg, maxPixelDimension: resize) }
            return .reencodeUnlessAlreadyEfficient(.jpeg, maxPixelDimension: nil)
        }
    }

    /// L'essai ne gagne pas assez sur l'original pour payer une génération.
    public static func originalIsAlreadyEfficient(originalBytes: Int, reencodedBytes: Int) -> Bool {
        Double(reencodedBytes) > Double(originalBytes) * (1 - OutgoingImagePolicy.minimumGain)
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
        let original = OriginalImage(data: data, source: source, properties: properties, format: format,
                                     upright: OutgoingImageGeometry.upright(stored, properties: properties))
        switch OutgoingImagePlanner.plan(format: format, pixelSize: original.upright, byteCount: data.count,
                                         carriesLocation: original.carriesLocation, policy: policy) {
        case .passthrough:
            return original.asIs
        case .stripLocation:
            return original.withoutLocation(policy: policy)
                ?? OutgoingImageWriter.encode(original, as: format, maxPixelDimension: nil, policy: policy)
                ?? (format == .heic ? OutgoingImageWriter.encode(original, as: .jpeg, maxPixelDimension: nil,
                                                                 policy: policy.forHEICConversion) : nil)
        case .reencode(let target, let maxPixelDimension):
            let effective = format == .heic && target == .jpeg ? policy.forHEICConversion : policy
            return OutgoingImageWriter.encode(original, as: target, maxPixelDimension: maxPixelDimension, policy: effective)
                ?? original.fallback(policy: policy)
        case .reencodeUnlessAlreadyEfficient(let target, let maxPixelDimension):
            guard let essai = OutgoingImageWriter.encode(original, as: target, maxPixelDimension: maxPixelDimension,
                                                         policy: policy) else { return original.fallback(policy: policy) }
            let efficace = data.count <= policy.byteCeiling
                && OutgoingImagePlanner.originalIsAlreadyEfficient(originalBytes: data.count, reencodedBytes: essai.data.count)
            return efficace ? (original.withoutLocation(policy: policy) ?? essai) : essai
        }
    }
}

/// L'image d'origine, lue une fois, et ce qu'elle peut devenir sans ré-encodage.
struct OriginalImage {
    let data: Data
    let source: CGImageSource
    let properties: [CFString: Any]
    let format: OutgoingImageFormat
    let upright: CGSize

    var carriesLocation: Bool { properties[kCGImagePropertyGPSDictionary] != nil }

    var asIs: OutgoingImage {
        OutgoingImage(data: data, format: format, pixelSize: upright, encodedGenerations: 0)
    }

    /// Les octets d'origine, lieu retiré s'il le faut ; `nil` si le retrait échoue.
    func withoutLocation(policy: OutgoingImagePolicy) -> OutgoingImage? {
        guard carriesLocation, !policy.keepsLocation else { return asIs }
        return OutgoingImageWriter.withoutLocation(source)
            .map { OutgoingImage(data: $0, format: format, pixelSize: upright, encodedGenerations: 0) }
    }

    /// Un encodage a échoué : l'original part s'il n'emporte aucun lieu interdit.
    func fallback(policy: OutgoingImagePolicy) -> OutgoingImage? {
        !carriesLocation || policy.keepsLocation ? asIs : nil
    }
}

enum OutgoingImageGeometry {
    static func storedSize(_ properties: [CFString: Any]) -> CGSize? {
        guard let width = (properties[kCGImagePropertyPixelWidth] as? NSNumber)?.doubleValue,
              let height = (properties[kCGImagePropertyPixelHeight] as? NSNumber)?.doubleValue,
              width > 0, height > 0 else { return nil }
        return CGSize(width: width, height: height)
    }

    static func orientation(_ properties: [CFString: Any]) -> Int {
        (properties[kCGImagePropertyOrientation] as? NSNumber)?.intValue ?? 1
    }

    static func isUpright(_ properties: [CFString: Any]) -> Bool {
        orientation(properties) == 1
    }

    /// Les orientations EXIF 5 à 8 couchent l'image : sa définition debout s'inverse.
    static func upright(_ size: CGSize, properties: [CFString: Any]) -> CGSize {
        (5...8).contains(orientation(properties)) ? CGSize(width: size.height, height: size.width) : size
    }
}

enum OutgoingImageWriter {
    /// Réécrit les métadonnées sans toucher aux données compressées des pixels.
    /// `kCGImageMetadataShouldExcludeGPS` ne retire pas le lieu d'un HEIC : le
    /// résultat est relu, et un lieu qui survit rend `nil` (fail-closed) — le
    /// plan retombe alors sur un ré-encodage, qui ne recopie jamais le GPS.
    static func withoutLocation(_ source: CGImageSource) -> Data? {
        guard let type = CGImageSourceGetType(source) else { return nil }
        let buffer = NSMutableData()
        guard let destination = CGImageDestinationCreateWithData(buffer as CFMutableData, type, 1, nil) else { return nil }
        let options: [CFString: Any] = [kCGImageMetadataShouldExcludeGPS: true]
        guard CGImageDestinationCopyImageSource(destination, source, options as CFDictionary, nil) else { return nil }
        let data = buffer as Data
        guard let written = CGImageSourceCreateWithData(data as CFData, nil),
              OutgoingImageLocationProbe.isLocationFree(written) else { return nil }
        return data
    }

    /// LA génération d'encodage. Au-delà de `byteCeiling`, l'essai recommence
    /// au palier HD suivant — toujours depuis l'ORIGINAL, donc toujours une seule
    /// génération sur les pixels qui partent.
    static func encode(_ original: OriginalImage, as format: OutgoingImageFormat, maxPixelDimension: CGFloat?,
                       policy: OutgoingImagePolicy) -> OutgoingImage? {
        let limit = maxPixelDimension ?? max(original.upright.width, original.upright.height)
        guard let essai = encodeOnce(original, as: format, limit: limit, policy: policy) else { return nil }
        guard essai.data.count > policy.byteCeiling, let palier = policy.step(below: limit) else { return essai }
        return encode(original, as: format, maxPixelDimension: palier, policy: policy) ?? essai
    }

    /// Décodage réduit par ImageIO ; le profil couleur suit l'image ; les
    /// métadonnées de la prise suivent, sans le lieu sauf choix contraire.
    /// Les pixels sont redressés, SAUF ceux d'une photo HDR (#11847) : ils
    /// restent couchés, l'orientation voyage avec eux, et la carte de gain les suit.
    private static func encodeOnce(_ original: OriginalImage, as format: OutgoingImageFormat, limit: CGFloat,
                                   policy: OutgoingImagePolicy) -> OutgoingImage? {
        guard let type = format.typeIdentifier else { return nil }
        let carriesGainMap = format.isLossy && OutgoingImageGainMap.isPresent(in: original.source)
        let redresses = !carriesGainMap || OutgoingImageGeometry.isUpright(original.properties)
        let decoded = carriesGainMap
            ? OutgoingImageGainMap.decoded(original, maxPixelSize: limit, upright: redresses)
            : nil
        guard let image = decoded ?? ImageDownsampler.thumbnail(source: original.source, maxPixelSize: limit,
                                                                decodeImmediately: true, keepsStoredOrientation: !redresses) else {
            return nil
        }
        let written = CGSize(width: image.width, height: image.height)
        let orientation = redresses ? 1 : OutgoingImageGeometry.orientation(original.properties)
        let carried = PhotoCaptureMetadata.carried(from: original.properties, orientation: orientation)
            .filter { policy.keepsLocation || $0.key != kCGImagePropertyGPSDictionary }
        let quality: [CFString: Any] = format.isLossy ? [kCGImageDestinationLossyCompressionQuality: policy.quality] : [:]
        let options = carried
            .merging(quality) { _, requested in requested }
            .merging(decoded != nil ? OutgoingImageGainMap.encodeRequest : [:]) { _, requested in requested }
        let buffer = NSMutableData()
        guard let destination = CGImageDestinationCreateWithData(buffer as CFMutableData, type, 1, nil) else { return nil }
        CGImageDestinationAddImage(destination, image, options as CFDictionary)
        if carriesGainMap, decoded == nil {
            OutgoingImageGainMap.carry(from: original.source, to: destination)
        }
        guard CGImageDestinationFinalize(destination) else { return nil }
        return OutgoingImage(data: buffer as Data, format: format,
                             pixelSize: redresses ? written : OutgoingImageGeometry.upright(written, properties: original.properties),
                             encodedGenerations: 1)
    }
}

/// **Le HDR suit la photo** (verdict #11247, #11847).
///
/// Depuis iOS 18, la carte de gain est RECALCULÉE, jamais recopiée : l'image est
/// décodée AVEC sa carte (`expandToHDR`, pixels au-delà du blanc de référence),
/// réduite, rendue en demi-flottants PQ, puis écrite en UNE génération par
/// `kCGImageDestinationEncodeToISOGainmap` — une base SDR et une carte ISO
/// 21496-1 calculée sur les pixels qui partent. C'est la voie de
/// `PhotoCaptureProcessor`, prouvée par ses témoins. Recopier l'auxiliaire de la
/// source (`CGImageDestinationAddAuxiliaryDataInfo`) à côté d'une base réduite
/// et réencodée rendait un JPEG SANS carte : la CI de #11974 l'a montré sur la
/// photo droite comme sur la couchée. Avant iOS 18, aucun encodeur de carte
/// n'existe : seule la recopie de la carte Apple est tentée.
enum OutgoingImageGainMap {
    static func isPresent(in source: CGImageSource) -> Bool {
        gainMapTypes.contains { CGImageSourceCopyAuxiliaryDataInfoAtIndex(source, 0, $0) != nil }
    }

    /// Les pixels HDR réduits, couchés ou redressés ; `nil` avant iOS 18.
    static func decoded(_ original: OriginalImage, maxPixelSize: CGFloat, upright: Bool) -> CGImage? {
        guard #available(iOS 18.0, macOS 15.0, *) else { return nil }
        guard let input = CIImage(data: original.data, options: [.applyOrientationProperty: upright, .expandToHDR: true]),
              let space = CGColorSpace(name: CGColorSpace.displayP3_PQ) else { return nil }
        let origin = input.extent.origin
        let anchored = input.transformed(by: CGAffineTransform(translationX: -origin.x, y: -origin.y))
        guard let target = PhotoCaptureGeometry.targetSize(for: anchored.extent.size, maxPixelDimension: maxPixelSize) else {
            return nil
        }
        return CIContext(options: [.cacheIntermediates: false])
            .createCGImage(PhotoCaptureProcessor.scaled(anchored, to: target), from: CGRect(origin: .zero, size: target),
                           format: .RGBAh, colorSpace: space)
    }

    static var encodeRequest: [CFString: Any] {
        guard #available(iOS 18.0, macOS 15.0, *) else { return [:] }
        return [kCGImageDestinationEncodeRequest: kCGImageDestinationEncodeToISOGainmap]
    }

    /// Avant iOS 18 seulement : la carte Apple de la source, recopiée.
    static func carry(from source: CGImageSource, to destination: CGImageDestination) {
        guard let info = CGImageSourceCopyAuxiliaryDataInfoAtIndex(source, 0, kCGImageAuxiliaryDataTypeHDRGainMap) else { return }
        CGImageDestinationAddAuxiliaryDataInfo(destination, kCGImageAuxiliaryDataTypeHDRGainMap, info)
    }

    private static var gainMapTypes: [CFString] {
        guard #available(iOS 18.0, macOS 15.0, *) else { return [kCGImageAuxiliaryDataTypeHDRGainMap] }
        return [kCGImageAuxiliaryDataTypeHDRGainMap, kCGImageAuxiliaryDataTypeISOGainMap]
    }
}

/// **Le lieu retiré d'un FICHIER image, sans en décoder les pixels** (#11847).
///
/// Pour un hôte qui ne peut pas tenir l'image en mémoire (l'extension de
/// partage, plafonnée à ~120 Mo) : ImageIO lit le fichier et en réécrit une
/// copie sans GPS par `CGImageDestinationCopyImageSource`, données compressées
/// des pixels intactes, puis la copie remplace l'original.
public enum OutgoingImageLocationRemoval {
    public enum Outcome: Sendable, Equatable {
        /// Pas une image, ou une image sans lieu : le fichier n'a pas bougé.
        case untouched
        case removed
        /// Le lieu est là et n'a pas pu être retiré : l'image ne doit pas partir.
        case failed
    }

    public static func removeLocation(fromFileAt url: URL) -> Outcome {
        guard let source = CGImageSourceCreateWithURL(url as CFURL, [kCGImageSourceShouldCache: false] as CFDictionary),
              CGImageSourceGetCount(source) > 0,
              let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any],
              properties[kCGImagePropertyGPSDictionary] != nil else { return .untouched }
        guard let type = CGImageSourceGetType(source) else { return .failed }
        let copy = url.deletingLastPathComponent().appendingPathComponent(".\(UUID().uuidString).\(url.pathExtension)")
        guard writeWithoutLocation(source, type: type, to: copy),
              let written = CGImageSourceCreateWithURL(copy as CFURL, [kCGImageSourceShouldCache: false] as CFDictionary),
              OutgoingImageLocationProbe.isLocationFree(written),
              (try? FileManager.default.replaceItemAt(url, withItemAt: copy)) != nil else {
            try? FileManager.default.removeItem(at: copy)
            return .failed
        }
        return .removed
    }

    /// La destination est relâchée au retour : le fichier est complet avant de remplacer l'original.
    private static func writeWithoutLocation(_ source: CGImageSource, type: CFString, to url: URL) -> Bool {
        guard let destination = CGImageDestinationCreateWithURL(url as CFURL, type, CGImageSourceGetCount(source), nil) else {
            return false
        }
        return CGImageDestinationCopyImageSource(destination, source, [kCGImageMetadataShouldExcludeGPS: true] as CFDictionary, nil)
    }
}

/// Une image écrite est relue avant de partir : chacune de ses images est sans lieu.
enum OutgoingImageLocationProbe {
    static func isLocationFree(_ source: CGImageSource) -> Bool {
        let count = CGImageSourceGetCount(source)
        guard count > 0 else { return false }
        return (0..<count).allSatisfy { index in
            guard let properties = CGImageSourceCopyPropertiesAtIndex(source, index, nil) as? [CFString: Any] else {
                return false
            }
            return properties[kCGImagePropertyGPSDictionary] == nil
        }
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
