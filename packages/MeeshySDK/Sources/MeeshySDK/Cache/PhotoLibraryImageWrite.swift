import Foundation
import ImageIO
import UniformTypeIdentifiers

/// **Comment une image part vers Photos — sans jamais la décoder en `UIImage`** (#9685).
///
/// Le type est lu dans l'EN-TÊTE (`CGImageSourceGetType`), ce qui ne décode aucun pixel :
/// - `asIs` : Photos accepte le format, les octets (ou le fichier) partent tels quels — EXIF,
///   profil colorimétrique et métadonnées compris ;
/// - `transcode` : une image valide dans un format que Photos refuse (WebP, AVIF, BMP…),
///   ré-encodée en JPEG par ImageIO, métadonnées portées ;
/// - `rejected` : ce n'est pas une image.
public enum PhotoLibraryImageWrite: Equatable, Sendable {
    case asIs
    case transcode
    case rejected

    private static let acceptedFamilies: [UTType] = [.jpeg, .png, .heic, .heif, .gif, .tiff, .rawImage]

    public static func decide(typeIdentifier: String?) -> PhotoLibraryImageWrite {
        guard let typeIdentifier, let type = UTType(typeIdentifier), type.conforms(to: .image) else {
            return .rejected
        }
        return acceptedFamilies.contains { type.conforms(to: $0) } ? .asIs : .transcode
    }

    public static func decide(data: Data) -> PhotoLibraryImageWrite {
        decide(typeIdentifier: typeIdentifier(of: data))
    }

    public static func decide(fileAt url: URL) -> PhotoLibraryImageWrite {
        decide(typeIdentifier: typeIdentifier(ofFileAt: url))
    }

    public static func typeIdentifier(of data: Data) -> String? {
        guard let source = CGImageSourceCreateWithData(data as CFData, nil) else { return nil }
        return validType(of: source)
    }

    public static func typeIdentifier(ofFileAt url: URL) -> String? {
        guard let source = CGImageSourceCreateWithURL(url as CFURL, nil) else { return nil }
        return validType(of: source)
    }

    /// Ré-encode en JPEG par ImageIO (aucun `UIImage`), métadonnées de la source portées.
    static func jpegTranscoded(data: Data) -> Data? {
        guard let source = CGImageSourceCreateWithData(data as CFData, nil) else { return nil }
        return jpegTranscoded(source: source)
    }

    static func jpegTranscoded(fileAt url: URL) -> Data? {
        guard let source = CGImageSourceCreateWithURL(url as CFURL, nil) else { return nil }
        return jpegTranscoded(source: source)
    }

    private static func validType(of source: CGImageSource) -> String? {
        guard CGImageSourceGetCount(source) > 0 else { return nil }
        return CGImageSourceGetType(source) as String?
    }

    private static func jpegTranscoded(source: CGImageSource) -> Data? {
        guard CGImageSourceGetCount(source) > 0 else { return nil }
        let output = NSMutableData()
        guard let destination = CGImageDestinationCreateWithData(
            output as CFMutableData, UTType.jpeg.identifier as CFString, 1, nil
        ) else { return nil }
        let options = [kCGImageDestinationLossyCompressionQuality: 0.95] as CFDictionary
        CGImageDestinationAddImageFromSource(destination, source, 0, options)
        guard CGImageDestinationFinalize(destination) else { return nil }
        return output as Data
    }
}
