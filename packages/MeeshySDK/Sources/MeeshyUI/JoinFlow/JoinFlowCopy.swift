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
}
