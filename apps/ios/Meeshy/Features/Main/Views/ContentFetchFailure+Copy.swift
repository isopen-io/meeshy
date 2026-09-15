import Foundation

/// **Ce qu'un échec d'ouverture DIT — une seule table pour les trois surfaces (#6508).**
///
/// Le détail d'un post, la cible d'une notification de story et le lecteur de
/// réels rendent la même cause avec les mêmes mots, sur iPhone comme sur iPad :
/// un échec « serveur » qui parlerait de connexion sur une surface et pas sur
/// l'autre recréerait le mensonge que la loi vient de retirer. Chaque surface
/// garde sa silhouette ; la phrase, l'icône et l'offre de réessai viennent d'ici.
extension ContentFetchFailure {

    var symbolName: String {
        switch self {
        case .network: return "wifi.exclamationmark"
        case .server: return "exclamationmark.triangle"
        case .forbidden, .notFound: return "clock.badge.xmark"
        }
    }

    var title: String {
        switch self {
        case .network:
            return String(localized: "feed.post.detail.loadFailed.title", defaultValue: "Impossible de charger ce contenu", bundle: .main)
        case .server:
            return String(localized: "feed.post.detail.serverFailed.title", defaultValue: "Meeshy n'a pas pu charger ce contenu", bundle: .main)
        case .forbidden, .notFound:
            return String(localized: "feed.post.detail.unavailable.title", defaultValue: "Ce contenu n'est plus disponible", bundle: .main)
        }
    }

    var message: String {
        switch self {
        case .network:
            return String(localized: "feed.post.detail.loadFailed.body", defaultValue: "Vérifiez votre connexion, puis réessayez.", bundle: .main)
        case .server:
            return String(localized: "feed.post.detail.serverFailed.body", defaultValue: "Le problème vient de notre côté. Réessayez dans un instant.", bundle: .main)
        case .forbidden, .notFound:
            return String(localized: "feed.post.detail.unavailable.body", defaultValue: "Il a peut-être expiré ou été retiré par son auteur.", bundle: .main)
        }
    }

    /// Réessayer n'est proposé que là où réessayer peut aboutir.
    var offersRetry: Bool { !isAbsence }
}
