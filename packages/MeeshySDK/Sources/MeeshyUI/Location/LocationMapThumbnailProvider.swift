import MapKit
import UIKit
import os

/// Fournit l'image statique de la vignette carte d'un message de lieu.
///
/// La vignette de `LocationMessageView` pose `allowsHitTesting(false)` et
/// délègue toute interaction à `LocationFullscreenView` : elle n'a donc aucun
/// besoin d'une `Map` vivante. Une carte vivante y composait ses tuiles en
/// async via CAMetalLayer pendant que swift-snapshot-testing capturait la
/// hiérarchie synchroniquement (UIGraphicsImageRenderer) — course non
/// déterministe (SIGSEGV `_platform_memmove` / diff / pass selon le run).
/// L'atome est injectable pour que les tests fournissent un rendu déterministe.
public protocol LocationMapThumbnailProviding {
    func thumbnail(coordinate: CLLocationCoordinate2D, size: CGSize, isDark: Bool) async -> UIImage?
}

/// Implémentation par défaut : `MKMapSnapshotter` (région centrée ~500 m,
/// apparence pilotée par `isDark`) + cache mémoire `NSCache` keyé
/// (lat, lon, taille, apparence). Paramètres opaques, aucun singleton produit.
public struct LocationMapThumbnailProvider: LocationMapThumbnailProviding {
    private static let cache: NSCache<NSString, UIImage> = {
        let cache = NSCache<NSString, UIImage>()
        cache.countLimit = 64
        return cache
    }()

    private static let logger = Logger(subsystem: "me.meeshy.app", category: "location-thumbnail")

    public init() {}

    public func thumbnail(coordinate: CLLocationCoordinate2D, size: CGSize, isDark: Bool) async -> UIImage? {
        let key = Self.cacheKey(coordinate: coordinate, size: size, isDark: isDark)
        if let cached = Self.cache.object(forKey: key) {
            return cached
        }

        let options = MKMapSnapshotter.Options()
        options.region = MKCoordinateRegion(center: coordinate,
                                            latitudinalMeters: 500,
                                            longitudinalMeters: 500)
        options.size = size
        options.traitCollection = UITraitCollection(traitsFrom: [
            options.traitCollection,
            UITraitCollection(userInterfaceStyle: isDark ? .dark : .light),
        ])

        do {
            let snapshot = try await MKMapSnapshotter(options: options).start()
            Self.cache.setObject(snapshot.image, forKey: key)
            return snapshot.image
        } catch {
            Self.logger.error("MKMapSnapshotter a échoué pour (\(coordinate.latitude, privacy: .public), \(coordinate.longitude, privacy: .public)) : \(error.localizedDescription, privacy: .public)")
            return nil
        }
    }

    private static func cacheKey(coordinate: CLLocationCoordinate2D, size: CGSize, isDark: Bool) -> NSString {
        "\(coordinate.latitude),\(coordinate.longitude),\(size.width)x\(size.height),\(isDark ? "dark" : "light")" as NSString
    }
}
