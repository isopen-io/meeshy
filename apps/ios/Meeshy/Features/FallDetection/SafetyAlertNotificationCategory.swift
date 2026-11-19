import Foundation
import MeeshySDK
import UIKit
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

    /// La personne dont un push `safety_alert_cleared` lève l'alerte — `nil` pour tout autre push.
    nonisolated static func clearedUserId(in userInfo: [AnyHashable: Any]) -> String? {
        guard userInfo["type"] as? String == FallDetectionContract.safetyAlertClearedPushType,
              let userId = userInfo["userId"] as? String, !userId.isEmpty else { return nil }
        return userId
    }

    /// Le push de l'alerte de sécurité reçu app OUVERTE : la levée (`safety_alert_cleared`) retire TOUJOURS l'état de la
    /// personne nommée ; avec la socket accrochée, ni l'alerte ni la levée ne font de bannière — `fall:detected` et
    /// `fall:cleared` ont déjà parlé, par la SyncPill. Socket absente, la bannière part.
    nonisolated static func routesForegroundPush(_ userInfo: [AnyHashable: Any]) -> Bool {
        let type = userInfo["type"] as? String
        guard type == FallDetectionContract.safetyAlertPushType || type == FallDetectionContract.safetyAlertClearedPushType else { return false }
        if let clearedUserId = clearedUserId(in: userInfo) {
            Task { @MainActor in shared.receivePushedClearing(userId: clearedUserId) }
        }
        return MessageSocketManager.shared.isConnected
    }

    /// La levée reçue app FERMÉE ou en arrière-plan (`content-available`) : l'état sort du cache AVANT que l'app ne se
    /// rouvre — sans quoi le démarrage à froid repeindrait une chute déjà close jusqu'au rattrapage.
    static func handledClearingWake(
        _ userInfo: [AnyHashable: Any],
        completionHandler: @escaping (UIBackgroundFetchResult) -> Void
    ) -> Bool {
        guard let userId = clearedUserId(in: userInfo) else { return false }
        Task { @MainActor in
            shared.receivePushedClearing(userId: userId)
            completionHandler(.newData)
        }
        return true
    }
}
