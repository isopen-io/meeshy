import Foundation

/// Moteur pur de décision « faut-il auto-télécharger ce média maintenant ? ».
/// Table de vérité : 4 (`NetworkCondition`) × 4 (`AutoDownloadPolicy`) = 16 cas
/// + offline gate. Sortie ne dépend que des inputs, sans I/O ni état mutable.
public enum MediaDownloadPolicyEngine {
    public static func shouldAutoDownload(
        kind: MediaKind,
        condition: NetworkCondition,
        prefs: MediaDownloadPreferences
    ) -> Bool {
        guard condition != .offline else { return false }
        switch prefs.policy(for: kind) {
        case .never:               return false
        case .always:              return true
        case .wifiOnly:            return condition == .wifi
        case .wifiAndGoodCellular: return condition == .wifi || condition == .goodCellular
        }
    }
}
