import Foundation
import MeeshySDK

/// **Quel profil réseau pour le fichier d'un réel, à quel palier (#11283).**
///
/// Politique produit, donc côté app : le SDK ne fournit que le building block
/// opaque (`MediaTransferProfile`, une priorité et un droit au réseau
/// facturé). Ce qu'on regarde ou qu'on va voir au geste suivant (play, decode,
/// mount) passe sur tout réseau : le bloquer sur cellulaire casserait la
/// lecture. Ce qui se prépare pour plus tard (prime, idle) est différable, et
/// ne part sur un réseau facturé (cellulaire, point d'accès) que si le réglage
/// vidéo de l'utilisateur autorise le cellulaire.
nonisolated enum ReelTransferPolicy {
    static func profile(
        for tier: ReelPreloadWindow.Tier,
        videoPolicy: AutoDownloadPolicy
    ) -> MediaTransferProfile {
        let priority = priority(for: tier)
        return MediaTransferProfile(
            priority: priority,
            allowsExpensiveNetworkAccess: priority == .immediate || allowsCellular(videoPolicy)
        )
    }

    static func priority(for tier: ReelPreloadWindow.Tier) -> MediaTransferPriority {
        switch tier {
        case .play, .decode, .mount: return .immediate
        case .prime, .idle: return .deferrable
        }
    }

    private static func allowsCellular(_ policy: AutoDownloadPolicy) -> Bool {
        switch policy {
        case .always, .wifiAndGoodCellular: return true
        case .wifiOnly, .never: return false
        }
    }
}
