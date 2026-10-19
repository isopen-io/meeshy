@preconcurrency import UserNotifications
import Foundation
import MeeshySDK

/// Le DÉTAIL d'un message sur l'écran verrouillé (#8858) : la carte d'une
/// position, la vignette d'une vidéo, le corps d'une carte de visite, d'une
/// invitation ou d'un lien. Toutes les décisions sont dans
/// `NotificationDetailPolicy` (pure, témoignée) ; ce fichier ne fait que les
/// exécuter avec les outils de l'extension.
extension NotificationService {

    /// Les libellés du corps détaillé, résolus dans le catalogue de
    /// l'extension (qui ne partage pas celui de l'app), dans la langue que
    /// l'app publie au groupe d'app (#8951).
    static var detailLabels: NotificationMessageDetail.Labels {
        let bundle = InterfaceLanguageResolver.bundle()
        return NotificationMessageDetail.Labels(
            sharedLocation: NSLocalizedString("notification.detail.sharedLocation", bundle: bundle, comment: ""),
            invitation: NSLocalizedString("notification.detail.invitation", bundle: bundle, comment: "")
        )
    }

    /// Réécrit le corps quand la passerelle ne l'a pas composé.
    func applyDetailedBody(to content: UNMutableNotificationContent) {
        guard let body = NotificationDetailPolicy.detailedBody(
            currentBody: content.body,
            userInfo: content.userInfo,
            labels: Self.detailLabels
        ) else { return }
        content.body = body
    }
}
