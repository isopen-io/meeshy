import CoreGraphics
import Foundation
import ImageIO
import UniformTypeIdentifiers

/// **La photo rendue garde les métadonnées de la prise** (décision porteur
/// 2026-10-04, #9347) : date et lieu de prise, appareil, objectif — rendus VRAIS
/// pour l'image qui part (orientation 1 : les pixels sont debout ; dimensions du
/// rendu). Un seul encodeur pour la conversation, la galerie et « Terminé ».
nonisolated enum ComposerPhotoEncoding {

    /// Encodée au type de la prise (HEIC, JPEG) ; sans prise lisible — ou si
    /// l'encodeur de ce type manque (simulateur sans HEVC) — en JPEG.
    static func encoded(_ image: CGImage, like original: Data?, quality: CGFloat = 0.92) -> Data? {
        let prise = original.flatMap { CGImageSourceCreateWithData($0 as CFData, nil) }
        let proprietes = prise.flatMap { CGImageSourceCopyPropertiesAtIndex($0, 0, nil) as? [CFString: Any] } ?? [:]
        let jpeg = UTType.jpeg.identifier as CFString
        let types = [prise.flatMap { CGImageSourceGetType($0) }, jpeg].compactMap { $0 }
        return types.lazy.compactMap { type in
            write(image, type: type, properties: metadata(proprietes, for: image, quality: quality))
        }.first
    }

    static func metadata(_ original: [CFString: Any], for image: CGImage, quality: CGFloat) -> [CFString: Any] {
        let tiff = (original[kCGImagePropertyTIFFDictionary] as? [CFString: Any] ?? [:])
            .merging([kCGImagePropertyTIFFOrientation: 1]) { _, rendu in rendu }
        let exif = (original[kCGImagePropertyExifDictionary] as? [CFString: Any] ?? [:])
            .merging([kCGImagePropertyExifPixelXDimension: image.width,
                      kCGImagePropertyExifPixelYDimension: image.height]) { _, rendu in rendu }
        return original
            .filter { $0.key != kCGImagePropertyPixelWidth && $0.key != kCGImagePropertyPixelHeight }
            .merging([kCGImagePropertyOrientation: 1,
                      kCGImagePropertyTIFFDictionary: tiff,
                      kCGImagePropertyExifDictionary: exif,
                      kCGImageDestinationLossyCompressionQuality: quality]) { _, rendu in rendu }
    }

    /// Le nom du fichier en galerie, à l'extension du type encodé.
    static func fileName(for data: Data, id: String) -> String {
        let type = CGImageSourceCreateWithData(data as CFData, nil)
            .flatMap { CGImageSourceGetType($0) }
            .flatMap { UTType($0 as String) }
        let suffixe = type.flatMap { $0.conforms(to: .jpeg) ? "jpg" : $0.preferredFilenameExtension } ?? "jpg"
        return "Meeshy_\(id).\(suffixe)"
    }

    /// Hors du fil principal : encoder 12 Mpx en HEIC coûte des centaines de ms.
    @concurrent
    static func encode(_ image: CGImage, like original: Data?) async -> Data? {
        encoded(image, like: original)
    }

    private static func write(_ image: CGImage, type: CFString, properties: [CFString: Any]) -> Data? {
        let sortie = NSMutableData()
        guard let destination = CGImageDestinationCreateWithData(sortie as CFMutableData, type, 1, nil) else { return nil }
        CGImageDestinationAddImage(destination, image, properties as CFDictionary)
        return CGImageDestinationFinalize(destination) ? sortie as Data : nil
    }
}
