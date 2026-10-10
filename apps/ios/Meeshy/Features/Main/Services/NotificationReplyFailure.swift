import Foundation
import UserNotifications
import MeeshySDK

/// **La réponse rapide à un commentaire, depuis une notification** (#9743,
/// audit M2).
enum NotificationReplyFailure {

    /// Les clés sous lesquelles une charge de notification peut nommer son
    /// destinataire.
    static let recipientKeys = ["recipientId", "recipientUserId"]

    /// L'auteur de la réponse : le compte que le JETON désigne — `nil` sans
    /// jeton lisible, ou quand la notification nomme un AUTRE destinataire
    /// (elle s'adressait à un compte qui n'est plus le compte actif). Une
    /// charge qui ne nomme pas son destinataire ne peut pas être vérifiée sur
    /// ce point : le jeton fait alors seul foi.
    static func author(token: String?, userInfo: [AnyHashable: Any]) -> String? {
        guard let owner = CommentOwnership.userId(inToken: token) else { return nil }
        let recipient = recipientKeys.lazy
            .compactMap { userInfo[$0] as? String }
            .compactMap(CommentOwnership.identity).first
        if let recipient, recipient != owner { return nil }
        return owner
    }

    /// Prévient, hors de l'app, qu'une réponse n'est pas partie.
    static func post() {
        let content = UNMutableNotificationContent()
        content.body = String(localized: "feed.comments.send_error",
                              defaultValue: "Erreur lors de l'envoi du commentaire", bundle: .main)
        content.sound = .default
        let request = UNNotificationRequest(identifier: "comment-reply-unsent-\(UUID().uuidString)",
                                            content: content, trigger: nil)
        UNUserNotificationCenter.current().add(request)
    }
}
