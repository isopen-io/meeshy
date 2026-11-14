import SwiftUI
import MeeshyUI

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

    /// Seule une ABSENCE explique : un échec de réseau ou de serveur tient dans son titre et son
    /// bouton « Réessayer » (règle 4 de l'épure, #18109).
    var message: String? {
        switch self {
        case .network, .server:
            return nil
        case .forbidden, .notFound:
            return String(localized: "feed.post.detail.unavailable.body", defaultValue: "Il a peut-être expiré ou été retiré par son auteur.", bundle: .main)
        }
    }

    /// Réessayer n'est proposé que là où réessayer peut aboutir.
    var offersRetry: Bool { !isAbsence }
}

/// La phrase d'une absence, rendue seulement s'il y en a une : un échec de réseau ou de serveur n'écrit
/// rien sous son titre (#18109), les trois surfaces partagent ce rendu.
struct ContentFetchFailureMessage: View {
    let message: String?
    let tint: Color

    var body: some View {
        if let message {
            Text(message)
                .font(MeeshyFont.relative(MeeshyFont.labelSize))
                .foregroundStyle(tint)
                .multilineTextAlignment(.center)
        }
    }
}
