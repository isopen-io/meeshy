import Foundation
import MeeshySDK

public nonisolated enum JoinFlowCopy {
    @MainActor
    public static func loadFailure(_ error: Error) -> String {
        loadFailure(error, in: .module)
    }

    @MainActor
    public static func joinFailure(_ error: Error) -> String {
        joinFailure(error, in: .module)
    }

    @MainActor
    public static func joinedSentence(conversationTitle: String?, username: String) -> String {
        joinedSentence(conversationTitle: conversationTitle, username: username, in: .module)
    }

    nonisolated static func loadFailure(_ error: Error, in bundle: Bundle) -> String {
        guard let meeshy = error as? MeeshyError else {
            return String(localized: "joinFlow.error.loadFailed", defaultValue: "Impossible de charger les informations du lien", bundle: bundle)
        }
        switch meeshy {
        case .server(404, _):
            return String(localized: "joinFlow.error.linkNotFound", defaultValue: "Ce lien de conversation est introuvable", bundle: bundle)
        case .server(410, let message):
            return message
        default:
            return meeshy.errorDescription ?? String(localized: "joinFlow.error.unknown", defaultValue: "Erreur inconnue", bundle: bundle)
        }
    }

    nonisolated static func joinFailure(_ error: Error, in bundle: Bundle) -> String {
        guard let meeshy = error as? MeeshyError else {
            return String(localized: "joinFlow.error.unexpected", defaultValue: "Erreur inattendue", bundle: bundle)
        }
        switch meeshy {
        case .server(409, let message), .server(410, let message):
            return message
        case .forbidden(let reason, _):
            return reason ?? meeshy.errorDescription ?? ""
        case .server(429, _):
            return String(localized: "joinFlow.error.tooManyUsers", defaultValue: "Trop d'utilisateurs connectés", bundle: bundle)
        case .auth:
            return meeshy.errorDescription ?? ""
        default:
            return meeshy.errorDescription ?? String(localized: "joinFlow.error.joinFailed", defaultValue: "Erreur lors de la connexion", bundle: bundle)
        }
    }

    nonisolated static func joinedSentence(conversationTitle: String?, username: String, in bundle: Bundle) -> String {
        let title = conversationTitle ?? String(
            localized: "joinFlow.success.conversationFallback",
            defaultValue: "la conversation",
            bundle: bundle
        )
        return String(localized: "joinFlow.success.joined", defaultValue: "Vous avez rejoint \(title) en tant que \(username)", bundle: bundle)
    }

    /// Le lien n'est plus valable — expiré, éteint par son créateur ou plein (410) : ce n'est pas une panne qui se
    /// réessaie, et la planche `Etat-Erreur` vue 3 le dit autrement qu'une erreur.
    public static func isGone(_ error: Error) -> Bool {
        guard case .server(410, _)? = error as? MeeshyError else { return false }
        return true
    }

    nonisolated static func goneTitle(in bundle: Bundle) -> String {
        String(localized: "joinFlow.gone.title", defaultValue: "Ce lien n'est plus valable", bundle: bundle)
    }

    nonisolated static func goneMessage(in bundle: Bundle) -> String {
        String(localized: "joinFlow.gone.message", defaultValue: "Demande un nouveau lien à la personne qui te l'a envoyé.", bundle: bundle)
    }

    /// « Demande un nouveau lien à Aïssa. » quand l'aperçu a nommé son créateur ; la phrase anonyme sinon.
    nonisolated static func goneMessage(creatorFirstName: String?, in bundle: Bundle) -> String {
        guard let name = creatorFirstName else { return goneMessage(in: bundle) }
        return String(localized: "joinFlow.gone.messageNamed", defaultValue: "Demande un nouveau lien à \(name).", bundle: bundle)
    }

    nonisolated static func goneInvitation(in bundle: Bundle) -> String {
        String(localized: "joinFlow.gone.invitation", defaultValue: "Invitation", bundle: bundle)
    }

    nonisolated static func goneTicketLabel(title: String, address: String, in bundle: Bundle) -> String {
        String(localized: "joinFlow.gone.ticketLabel", defaultValue: "\(title), \(address), lien qui n'est plus valable", bundle: bundle)
    }

    nonisolated static func goneCreatorCaption(in bundle: Bundle) -> String {
        String(localized: "joinFlow.gone.creatorRole", defaultValue: "a créé ce lien", bundle: bundle)
    }
}
