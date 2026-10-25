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
    /// La notification s'adresse-t-elle au compte actif ? Une charge qui ne
    /// nomme pas son destinataire ne peut pas être vérifiée : le compte actif
    /// fait alors foi. Plusieurs comptes sur l'appareil : un push du compte A
    /// touché pendant que B est actif ne doit rien faire au nom de B.
    static func isAddressed(to userId: String?, userInfo: [AnyHashable: Any]) -> Bool {
        let recipient = recipientKeys.lazy
            .compactMap { userInfo[$0] as? String }
            .compactMap(CommentOwnership.identity).first
        guard let recipient else { return true }
        return recipient == CommentOwnership.identity(userId)
    }

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

    /// **Une réponse refusée sous PIN ne disparaît pas en silence** (#12655).
    /// « Répondre » s'exécute en arrière-plan : sans ce message, l'utilisateur
    /// croyait sa réponse partie. Le corps est un libellé du catalogue, jamais
    /// le texte saisi ; la charge ne porte que la route vers la conversation,
    /// que la porte du routeur garde par le PIN, et la catégorie sans action.
    static func refusedUnderConversationPinContent(
        conversationId: String?,
        bundle: Bundle = InterfaceLanguageResolver.bundle()
    ) -> UNMutableNotificationContent {
        let content = UNMutableNotificationContent()
        content.body = String(
            localized: "notifications.reply_refused.locked_conversation",
            defaultValue: "Réponse non envoyée : ouvrez la conversation",
            bundle: bundle
        )
        content.sound = .default
        content.categoryIdentifier = NSEAttachmentPolicy.lockedConversationCategory
        guard let conversationId, !conversationId.isEmpty else { return content }
        content.userInfo = ["type": "new_message", "conversationId": conversationId]
        content.threadIdentifier = "conversation:\(conversationId)"
        return content
    }

    static func postRefusedUnderConversationPin(conversationId: String?) {
        let request = UNNotificationRequest(
            identifier: "reply-refused-locked-\(UUID().uuidString)",
            content: refusedUnderConversationPinContent(conversationId: conversationId),
            trigger: nil
        )
        UNUserNotificationCenter.current().add(request)
    }
}
