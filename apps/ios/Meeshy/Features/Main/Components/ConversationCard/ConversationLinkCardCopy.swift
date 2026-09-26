import Foundation
import MeeshySDK

/// Les chaînes de la carte de conversation (#8099) — une clé par phrase, toutes
/// au catalogue de l'app dans ses sept langues.
enum ConversationLinkCardCopy {
    static var invitesYou: String {
        String(localized: "conversationCard.invitesYou",
               defaultValue: "vous invite à rejoindre cette conversation", bundle: .main)
    }
    static var join: String {
        String(localized: "conversationCard.join", defaultValue: "Rejoindre", bundle: .main)
    }
    static var joinAnonymously: String {
        String(localized: "conversationCard.joinAnonymously", defaultValue: "Rejoindre en anonyme", bundle: .main)
    }
    static var leave: String {
        String(localized: "conversationCard.leave", defaultValue: "Quitter", bundle: .main)
    }
    static var open: String {
        String(localized: "conversationCard.open", defaultValue: "Ouvrir", bundle: .main)
    }
    static var inProgress: String {
        String(localized: "conversationCard.inProgress", defaultValue: "En cours…", bundle: .main)
    }
    static var expiredTitle: String {
        String(localized: "conversationCard.expired", defaultValue: "Lien expiré", bundle: .main)
    }
    static var expiredHint: String {
        String(localized: "conversationCard.expired.hint",
               defaultValue: "Ce lien d'invitation n'est plus actif.", bundle: .main)
    }
    static var privateTitle: String {
        String(localized: "conversationCard.private", defaultValue: "Conversation privée", bundle: .main)
    }
    static var privateHint: String {
        String(localized: "conversationCard.private.hint",
               defaultValue: "Seuls ses membres peuvent la voir.", bundle: .main)
    }
    static var loading: String {
        String(localized: "conversationCard.loading",
               defaultValue: "Chargement de la conversation", bundle: .main)
    }
    static var leaveConfirmTitle: String {
        String(localized: "conversationCard.leave.confirm.title",
               defaultValue: "Quitter cette conversation ?", bundle: .main)
    }
    static var leaveConfirmMessage: String {
        String(localized: "conversationCard.leave.confirm.message",
               defaultValue: "Vous ne recevrez plus ses messages.", bundle: .main)
    }
    static var cancel: String {
        String(localized: "conversationCard.cancel", defaultValue: "Annuler", bundle: .main)
    }
    static func members(_ count: Int) -> String {
        String(localized: "conversationCard.a11y.members", defaultValue: "Membres : \(count)", bundle: .main)
    }
    static func messages(_ count: Int) -> String {
        String(localized: "conversationCard.a11y.messages", defaultValue: "Messages : \(count)", bundle: .main)
    }
    static func languages(_ list: String) -> String {
        String(localized: "conversationCard.a11y.languages", defaultValue: "Langues : \(list)", bundle: .main)
    }
    static func cardLabel(_ title: String) -> String {
        String(localized: "conversationCard.a11y.label", defaultValue: "Conversation : \(title)", bundle: .main)
    }
    static var leaveError: String {
        String(localized: "conversation.options.error.leaveConversation",
               defaultValue: "Impossible de quitter la conversation.", bundle: .main)
    }

    /// Les refus d'une jonction se disent avec les phrases déjà servies par
    /// l'ouverture d'un lien de partage (`RootView.joinViaShareLink`).
    static func joinError(_ error: Error) -> String {
        switch error as? MeeshyError {
        case .server(404, _):
            return String(localized: "link.error.not-found", defaultValue: "Lien introuvable", bundle: .main)
        case .server(410, _):
            return String(localized: "link.error.inactive", defaultValue: "Ce lien n'est plus actif", bundle: .main)
        case .forbidden:
            return String(localized: "link.error.forbidden",
                          defaultValue: "Accès refusé à cette conversation", bundle: .main)
        default:
            return String(localized: "conversationCard.error.join",
                          defaultValue: "Impossible de rejoindre la conversation", bundle: .main)
        }
    }
}
