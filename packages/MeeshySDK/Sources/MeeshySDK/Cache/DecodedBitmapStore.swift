import Foundation
import UIKit
import ImageIO

/// Le niveau « bitmap décodé » de `DiskCacheStore` : un `NSCache` d'`UIImage`
/// partagé par tous les stores, ses variantes par palier de taille, et le
/// décodage réduit qui l'alimente. Aucun état du store n'y est lu.
enum DecodedBitmapStore {
    nonisolated(unsafe) private static let cache: NSCache<NSString, UIImage> = {
        let cache = NSCache<NSString, UIImage>()
        cache.countLimit = 150
        cache.totalCostLimit = 80 * 1024 * 1024
        return cache
    }()

    /// Hard cap for the decoded bitmap we will keep resident in the NSCache
    /// (in bytes). A malicious or accidentally-huge image (e.g. 20K×20K JPEG
    /// that decodes to >1 GB of pixel data) would otherwise blow the NSCache
    /// budget and trigger a memory warning, evicting everything else. We
    /// decode to check dimensions, then refuse to cache anything above the
    /// threshold — the `UIImage` still returns so the caller can display it
    /// once, but we won't hold onto it.
    ///
    /// Le plafond suit le tier média de l'appareil (#11281) : il ne fait que
    /// BAISSER pour les tiers bas — `high` et `pro` gardent les 50 Mo
    /// historiques. Mesuré ni sur appareil ni à l'Instruments : argumenté.
    static func maxCacheableDecodedBytes(for tier: DeviceMediaTier) -> Int {
        switch tier {
        case .low: return 24 * 1024 * 1024
        case .mid: return 40 * 1024 * 1024
        case .high, .pro: return 50 * 1024 * 1024
        }
    }

    /// Le plus grand côté qu'un décodage réduit peut produire (#11281). Un
    /// appareil de tier bas décode au plus 1536 px — 17 Mo pour un poster 9:16
    /// au lieu de 30 Mo à 2048 px — sans jamais passer sous le palier de 1024
    /// ni sous le slot plein format (1200).
    static func pixelCeiling(for tier: DeviceMediaTier) -> CGFloat {
        switch tier {
        case .low: return 1536
        case .mid, .high, .pro: return 2048
        }
    }

    /// Quantized decode ceilings for below-full-format requests. Decoding at
    /// the bucket ceiling (never the exact requested size) bounds the number
    /// of resident variants per URL while never serving an under-resolved
    /// bitmap: the bucket is always >= the request.
    private static let pixelSizeBuckets: [CGFloat] = [128, 256, 512, 768, 1024]

    static func image(forKey key: NSString) -> UIImage? {
        cache.object(forKey: key)
    }

    static func removeAll() {
        cache.removeAllObjects()
    }

    static func configure(memoryCostLimitBytes: Int) {
        cache.totalCostLimit = memoryCostLimitBytes
    }

    /// Bucket ceiling for a requested pixel size — `nil` when the request
    /// belongs to the canonical full-format slot.
    static func bucket(for maxPixelSize: CGFloat) -> CGFloat? {
        pixelSizeBuckets.first { $0 >= maxPixelSize }
    }

    /// NSCache key of a decoded variant. Sized variants are suffixed so a
    /// 128 px avatar decode can never occupy — nor be served from — the slot
    /// a full-screen surface reads. The bare key remains reserved for the
    /// full-format decode.
    static func cacheKey(fileKey: String, bucket: CGFloat?) -> NSString {
        guard let bucket else { return fileKey as NSString }
        return "\(fileKey)#px\(Int(bucket))" as NSString
    }

    /// « Une variante décodée, n'importe laquelle, est-elle résidente ? » —
    /// probe de résidence (badge de téléchargement, gates) qui ne doit pas
    /// dépendre du bucket sous lequel la surface d'affichage a décodé.
    static func hasAnyVariant(fileKey: String) -> Bool {
        if cache.object(forKey: fileKey as NSString) != nil { return true }
        return pixelSizeBuckets.contains { bucket in
            cache.object(forKey: cacheKey(fileKey: fileKey, bucket: bucket)) != nil
        }
    }

    /// Retire le slot plein format et toutes les variantes par palier d'une clé.
    static func removeVariants(fileKey: String) {
        cache.removeObject(forKey: fileKey as NSString)
        for bucket in pixelSizeBuckets {
            cache.removeObject(forKey: cacheKey(fileKey: fileKey, bucket: bucket))
        }
    }

    /// Centralised NSCache insertion with a size guard so a single oversized
    /// image never evicts the rest of the in-memory cache. We compute the
    /// decoded cost once and skip caching when it blows past
    /// `maxCacheableDecodedBytes` — the caller still gets the `UIImage`, it
    /// just won't be kept around for the next scroll.
    static func insertWithinBudget(_ image: UIImage, key: String, tier: DeviceMediaTier = .current) {
        let cost = image.cgImage.map { $0.bytesPerRow * $0.height } ?? 0
        guard cost > 0, cost <= maxCacheableDecodedBytes(for: tier) else { return }
        // Insert synchronously. `NSCache` mutations are thread-safe, so the
        // previous `Task { @MainActor … }` deferral bought nothing and created a
        // race: the image wasn't resident yet when `image(for:)` returned, so a
        // synchronous `cachedImage(for:)` immediately after still missed (and
        // the UI showed a thumbHash flash for one extra frame). Matches the
        // direct insertion already used by `warmedImage(for:)`.
        cache.setObject(image, forKey: key as NSString, cost: cost)
    }

    /// **Décode à la taille d'affichage, jamais l'image pleine** (#9685) :
    /// `CGImageSourceCreateThumbnailAtIndex` borne le plus grand côté à
    /// `maxPixelSize` (taille affichée × échelle, quantifiée par `bucket(for:)`),
    /// et `kCGImageSourceShouldCacheImmediately` force le décodage ICI — hors du
    /// fil principal sur le chemin asynchrone de l'acteur —, au lieu de le laisser
    /// au premier dessin.
    static func downsampledImage(data: Data, maxPixelSize: CGFloat = 1200, tier: DeviceMediaTier = .current) -> UIImage? {
        guard let source = CGImageSourceCreateWithData(data as CFData, nil),
              let cgImage = CGImageSourceCreateThumbnailAtIndex(source, 0, thumbnailOptions(min(maxPixelSize, pixelCeiling(for: tier))))
        else { return UIImage(data: data) }
        return UIImage(cgImage: cgImage)
    }

    /// Même réduction, lue directement depuis le fichier du cache (aucune copie
    /// des octets en mémoire).
    static func downsampledImage(fileURL: URL, maxPixelSize: CGFloat, tier: DeviceMediaTier = .current) -> UIImage? {
        let sourceOptions = [kCGImageSourceShouldCache: false] as CFDictionary
        guard let source = CGImageSourceCreateWithURL(fileURL as CFURL, sourceOptions),
              let cgImage = CGImageSourceCreateThumbnailAtIndex(source, 0, thumbnailOptions(min(maxPixelSize, pixelCeiling(for: tier))))
        else { return nil }
        return UIImage(cgImage: cgImage)
    }

    private static func thumbnailOptions(_ maxPixelSize: CGFloat) -> CFDictionary {
        [
            kCGImageSourceShouldCache: false,
            kCGImageSourceShouldCacheImmediately: true,
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceThumbnailMaxPixelSize: maxPixelSize
        ] as CFDictionary
    }
}
