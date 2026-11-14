import Foundation

/// **Pourquoi le détail d'une communauté n'a pas pu s'ouvrir — la cause que
/// l'écran DIT (#7816).** Jamais le message brut du serveur (il est en anglais
/// et parle HTTP) : trois causes, parce que le lecteur n'a pas la même chose à
/// faire devant chacune.
///
/// - `refused` — le serveur a répondu NON (403 ou 404, rendus pareils : un
///   identifiant ne dit pas si une communauté privée existe, comme le web) :
///   réessayer échouerait identiquement, on n'offre que le retour ;
/// - `network` — la requête n'est pas arrivée : vérifier sa connexion, réessayer ;
/// - `server` — le serveur a échoué : réessayer, sans parler de connexion.
public enum CommunityLoadFailure: Equatable, Sendable {
    case refused
    case network
    case server

    public var offersRetry: Bool { self != .refused }
}

extension CommunityLoadFailure {

    public var symbolName: String {
        switch self {
        case .refused: return "person.3"
        case .network: return "wifi.exclamationmark"
        case .server: return "exclamationmark.triangle"
        }
    }

    public var title: String {
        switch self {
        case .refused:
            return String(localized: "community.detail.refused.title", defaultValue: "Communauté introuvable", bundle: .module)
        case .network:
            return String(localized: "community.detail.loadFailed.title", defaultValue: "Impossible de charger cette communauté", bundle: .module)
        case .server:
            return String(localized: "community.detail.serverFailed.title", defaultValue: "Meeshy n'a pas pu charger cette communauté", bundle: .module)
        }
    }

    /// Seul un refus s'explique : le titre dit l'échec réseau ou serveur, et « Réessayer » dit quoi faire (épure #18088).
    public var message: String? {
        switch self {
        case .refused:
            return String(localized: "community.detail.refused.body", defaultValue: "Elle n'existe pas, ou elle est privée et vous n'en êtes pas membre.", bundle: .module)
        case .network, .server:
            return nil
        }
    }

    /// « Réessayer » là où réessayer peut aboutir ; sinon le retour.
    public var actionLabel: String {
        offersRetry
            ? String(localized: "common.retry", defaultValue: "Réessayer", bundle: .module)
            : String(localized: "community.detail.refused.back", defaultValue: "Retour aux communautés", bundle: .module)
    }
}
