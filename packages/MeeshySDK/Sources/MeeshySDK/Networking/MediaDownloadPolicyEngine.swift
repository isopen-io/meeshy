import Foundation

/// Moteur pur de décision « faut-il auto-télécharger ce média maintenant ? ».
/// Table de vérité : 4 (`NetworkCondition`) × 4 (`AutoDownloadPolicy`) = 16 cas
/// + offline gate + seuil du petit média. Sortie ne dépend que des inputs, sans
/// I/O ni état mutable.
public enum MediaDownloadPolicyEngine {
    /// **Sous 100 Ko, un média se télécharge seul, quel que soit le réseau** (#14639,
    /// directive porteur) : seul le hors-ligne le retient. Miroir de
    /// `SMALL_MEDIA_AUTO_DOWNLOAD_BYTES` (`packages/shared`) et de sa jumelle Kotlin.
    public static let smallMediaAutoDownloadBytes = 102_400

    /// - Parameter byteSize: la taille CONNUE de la pièce ; `nil` ou `0` (le modèle
    ///   n'en a pas) ne prouve rien, la politique réseau décide alors.
    public static func shouldAutoDownload(
        kind: MediaKind,
        condition: NetworkCondition,
        prefs: MediaDownloadPreferences,
        byteSize: Int? = nil
    ) -> Bool {
        guard condition != .offline else { return false }
        if isSmallMedia(byteSize) { return true }
        switch prefs.policy(for: kind) {
        case .never:               return false
        case .always:              return true
        case .wifiOnly:            return condition == .wifi
        case .wifiAndGoodCellular: return condition == .wifi || condition == .goodCellular
        }
    }

    public static func isSmallMedia(_ byteSize: Int?) -> Bool {
        guard let byteSize, byteSize > 0 else { return false }
        return byteSize < smallMediaAutoDownloadBytes
    }
}
