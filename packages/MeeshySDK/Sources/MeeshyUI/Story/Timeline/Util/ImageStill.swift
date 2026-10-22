import Foundation
import UIKit
import ImageIO
import MeeshySDK

/// Vignette FIXE (image) pour les lanes — pendant du filmstrip vidéo.
/// `CGImageSourceCreateThumbnailAtIndex` décode à la taille cible (jamais le
/// bitmap plein format en mémoire), cache keyé URL+hauteur+échelle.
enum ImageStill {

    private nonisolated(unsafe) static let cache: NSCache<NSString, UIImage> = {
        let cache = NSCache<NSString, UIImage>()
        // Borne le nombre de vignettes décodées résidentes (une par média ×
        // hauteur) — sans elle le cache ne rendait jamais rien au système.
        cache.countLimit = 64
        return cache
    }()

    static func thumbnail(url: URL, maxHeight: CGFloat, scale: CGFloat) async -> UIImage? {
        let key = "\(url.absoluteString)|\(Int(maxHeight))|\(scale)" as NSString
        if let cached = cache.object(forKey: key) { return cached }
        let image: UIImage? = await Task.detached(priority: .utility) {
            ImageDownsampler.thumbnail(fileURL: url, maxPixelSize: maxHeight * 4 * scale, decodeImmediately: false)
                .map { UIImage(cgImage: $0) }
        }.value
        if let image {
            cache.setObject(image, forKey: key)
        }
        return image
    }
}
