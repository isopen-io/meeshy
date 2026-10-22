import Foundation
import CoreGraphics
import ImageIO

/// **Le sous-échantillonneur ImageIO unique (#11845).**
///
/// Quinze fichiers réécrivaient leurs options de `CGImageSourceCreateThumbnailAtIndex`,
/// avec des écarts qu'aucun ne disait. Les règles vivent ici :
/// - la transformée EXIF est TOUJOURS appliquée : une photo prise téléphone
///   tourné sort debout ;
/// - la vignette est TOUJOURS calculée depuis l'image, jamais la vignette
///   embarquée (souvent 160 px, floue une fois agrandie) ;
/// - la source ne garde pas de cache de décodage (`kCGImageSourceShouldCache`) ;
/// - `decodeImmediately` force le décodage ICI — à réserver à l'appelant qui
///   connaît la taille AFFICHÉE et tourne hors du fil principal (#9872) ; sinon
///   le bitmap se décode au premier dessin.
///
/// Le plafond par tier d'appareil reste à l'appelant (`DecodedBitmapStore`) : la
/// brique borne ce qu'on lui demande, elle ne décide pas de la taille.
public enum ImageDownsampler {
    public static func options(maxPixelSize: CGFloat, decodeImmediately: Bool) -> CFDictionary {
        [
            kCGImageSourceShouldCache: false,
            kCGImageSourceShouldCacheImmediately: decodeImmediately,
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceThumbnailMaxPixelSize: maxPixelSize,
        ] as CFDictionary
    }

    public static func thumbnail(source: CGImageSource, index: Int = 0,
                                 maxPixelSize: CGFloat, decodeImmediately: Bool) -> CGImage? {
        CGImageSourceCreateThumbnailAtIndex(source, index,
                                            options(maxPixelSize: maxPixelSize, decodeImmediately: decodeImmediately))
    }

    public static func thumbnail(data: Data, maxPixelSize: CGFloat, decodeImmediately: Bool) -> CGImage? {
        guard let source = CGImageSourceCreateWithData(data as CFData, sourceOptions) else { return nil }
        return thumbnail(source: source, maxPixelSize: maxPixelSize, decodeImmediately: decodeImmediately)
    }

    /// Lit le fichier sans en recopier les octets en mémoire.
    public static func thumbnail(fileURL: URL, maxPixelSize: CGFloat, decodeImmediately: Bool) -> CGImage? {
        guard let source = CGImageSourceCreateWithURL(fileURL as CFURL, sourceOptions) else { return nil }
        return thumbnail(source: source, maxPixelSize: maxPixelSize, decodeImmediately: decodeImmediately)
    }

    private static var sourceOptions: CFDictionary {
        [kCGImageSourceShouldCache: false] as CFDictionary
    }
}
