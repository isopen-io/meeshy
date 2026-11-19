import Foundation
import MeeshySDK
import UserNotifications

/// **L'alerte de sécurité d'un Sang** (#18748, la chute détectée). La passerelle pose la catégorie
/// `MEESHY_SAFETY_ALERT` sur un push GÉNÉRIQUE (« ⚠️ Alerte de sécurité », aucun mot de santé) ; la catégorie ne porte
/// aucune action — « Je vais bien » appartient à l'émetteur, pas au lecteur —, et l'aperçu masqué ne dit rien de plus.
enum SafetyAlertNotificationCategory {
    static func category(bundle: Bundle) -> UNNotificationCategory {
        UNNotificationCategory(
            identifier: FallDetectionContract.safetyAlertCategory,
            actions: [],
            intentIdentifiers: [],
            hiddenPreviewsBodyPlaceholder: FallDetectionWording.hiddenPreviewPlaceholder(bundle: bundle),
            options: []
        )
    }
}

extension FallDetectionCenter {

    /// Le push de l'alerte de sécurité reçu app OUVERTE : la levée (`safety_alert_cleared`) retire TOUJOURS l'état de la
    /// personne nommée ; avec la socket accrochée, ni l'alerte ni la levée ne font de bannière — `fall:detected` et
    /// `fall:cleared` ont déjà parlé, par la SyncPill. Socket absente, la bannière part.
    nonisolated static func routesForegroundPush(_ userInfo: [AnyHashable: Any]) -> Bool {
        let type = userInfo["type"] as? String
        guard type == FallDetectionContract.safetyAlertPushType || type == FallDetectionContract.safetyAlertClearedPushType else { return false }
        let clearedUserId = type == FallDetectionContract.safetyAlertClearedPushType ? userInfo["userId"] as? String : nil
        if let clearedUserId, !clearedUserId.isEmpty {
            Task { @MainActor in shared.receivePushedClearing(userId: clearedUserId) }
        }
        return MessageSocketManager.shared.isConnected
    }
}
