import UIKit
import AVFoundation

/// Extraction de vignettes filmstrip pour les clips vidéo de la timeline.
/// Atome pur : URL locale → N frames réparties sur la durée, cache mémoire
/// (NSCache, thread-safe) keyé URL+count pour que les rebuilds de lanes ne
/// relancent jamais une extraction déjà faite.
enum VideoFilmstrip {

    private nonisolated(unsafe) static let cache = NSCache<NSString, NSArray>()

    static func frames(url: URL, count: Int, maxHeight: CGFloat) async -> [UIImage] {
        let key = "\(url.absoluteString)|\(count)|\(Int(maxHeight))" as NSString
        if let cached = cache.object(forKey: key) as? [UIImage] { return cached }

        let asset = AVURLAsset(url: url)
        guard let duration = try? await asset.load(.duration),
              duration.seconds.isFinite, duration.seconds > 0 else { return [] }

        let generator = AVAssetImageGenerator(asset: asset)
        generator.appliesPreferredTrackTransform = true
        generator.maximumSize = CGSize(width: maxHeight * 4, height: maxHeight * UIScreen.main.scale)
        // Tolérance large : le filmstrip est un repère visuel, pas un montage
        // frame-accurate — les seeks précis coûtent une décompression GOP par frame.
        generator.requestedTimeToleranceBefore = CMTime(seconds: 0.5, preferredTimescale: 600)
        generator.requestedTimeToleranceAfter = CMTime(seconds: 0.5, preferredTimescale: 600)

        var result: [UIImage] = []
        for i in 0..<max(1, count) {
            let fraction = (Double(i) + 0.5) / Double(max(1, count))
            let time = CMTime(seconds: duration.seconds * fraction, preferredTimescale: 600)
            guard let cg = try? await generator.image(at: time).image else { continue }
            result.append(UIImage(cgImage: cg))
        }
        if !result.isEmpty {
            cache.setObject(result as NSArray, forKey: key)
        }
        return result
    }
}
