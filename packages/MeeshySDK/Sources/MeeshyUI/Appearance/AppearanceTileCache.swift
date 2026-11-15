import UIKit
import MeeshySDK

// MARK: - Le cache BORNÉ des tuiles (#10631, spec §§ 8.2, 13)
//
// Une tuile est rendue UNE fois en `UIImage` puis répétée par le moteur
// graphique : la même clé rend la même image, sans redessiner. Le cache est
// borné (`countLimit`) : les tuiles sont des bitmaps, et un défilement parmi
// les 14 modèles ne doit pas les garder tous.

@MainActor
public final class AppearanceTileCache {
    public static let shared = AppearanceTileCache(countLimit: 32)

    // iOS 26.1 : deinit synthétisée ISOLÉE → double-free au démontage xctest (Swift #85663).
    nonisolated deinit {}

    private let storage = NSCache<NSString, UIImage>()

    public init(countLimit: Int) {
        storage.countLimit = countLimit
    }

    public func image(forKey key: String, render: () -> UIImage?) -> UIImage? {
        if let cached = storage.object(forKey: key as NSString) { return cached }
        guard let rendered = render() else { return nil }
        storage.setObject(rendered, forKey: key as NSString)
        return rendered
    }

    public func removeAll() {
        storage.removeAllObjects()
    }

    /// La clé d'une tuile : le modèle (clé + empreinte de son contenu, qu'un pack
    /// peut changer sous la même clé), le schéma, l'accent effectif, l'échelle d'écran.
    public static func key(design: AppearanceDesign, isDark: Bool, accentHex: String, displayScale: CGFloat) -> String {
        "\(design.key)#\(design.hashValue)|\(isDark ? "dark" : "light")|\(AppearancePaint.normalizedAccent(accentHex))|\(displayScale)"
    }
}
