import Foundation
import UserNotifications

/// Le Centre de notifications du système, vu comme ce que la sortie de session
/// en retire (#18911, ios-systeme-2) : les bannières déjà posées (aperçus en
/// clair, vignettes et vocaux joints) et celles encore planifiées.
public protocol DeliveredNotificationsPurging: Sendable {
    func removeAllDeliveredNotifications()
    func removeAllPendingNotificationRequests()
}

/// `UNUserNotificationCenter.current()` se résout à l'APPEL, jamais à la
/// construction : un hôte de test SPM, sans bundle d'application, ne peut pas le
/// résoudre.
public struct SystemDeliveredNotificationsPurger: DeliveredNotificationsPurging {
    public init() {}

    public func removeAllDeliveredNotifications() {
        UNUserNotificationCenter.current().removeAllDeliveredNotifications()
    }

    public func removeAllPendingNotificationRequests() {
        UNUserNotificationCenter.current().removeAllPendingNotificationRequests()
    }
}

/// Quelle sortie de session vide le Centre de notifications. Une seule loi, lue
/// par `AuthManager.leaveActiveSession`.
///
/// Purge la sortie qui TERMINE la session (Déconnexion, suspension sans garde :
/// `endingIt`) ou qui retire le compte actif supprimé côté serveur. Ne purge PAS
/// le simple changement de compte : la session de A est gardée, ses pushes
/// restent prévus et son retour les retrouve. Rien ne les protège encore sous B :
/// une charge APNs ne nomme pas son destinataire (`recipientUserId` n'est posé que
/// sur FCM), donc toucher une bannière de A sous B ouvre sa conversation sous B
/// (#8668).
public enum SessionExitNotificationPolicy {
    public static func purgesDelivered(endingIt: Bool, retiringActiveAccount: Bool) -> Bool {
        endingIt || retiringActiveAccount
    }
}
