import Foundation

/// **Le lien que l'extension de partage ouvre** — `meeshy://compose-share?id=…`
/// (#5056, vue `2a`).
///
/// Un type à lui, et non un cas de `DeepLinkParser` : ce lien ne désigne aucun
/// LIEU de l'app. Il demande de reprendre une fiche déposée dans le conteneur
/// App Group, et c'est un cover racine qui la présente. Lui donner un cas
/// d'énumération dans le parseur des destinations aurait fait porter à celui-ci
/// une chose qui n'en est pas une — la même confusion que « le format est un
/// champ, pas une identité », un cran plus haut.
///
/// **L'ORTHOGRAPHE du lien vit ici, une fois.** L'extension la compose
/// (`ShareComposeHandoff.openURL`), l'app la lit. Deux écritures de la même
/// chaîne divergeraient au premier renommage, et la divergence serait
/// SILENCIEUSE : l'app ne reconnaîtrait plus le lien, l'extension continuerait
/// de l'ouvrir, et la pièce n'arriverait qu'au balayage suivant — c'est-à-dire
/// que le défaut passerait pour de la lenteur.
///
/// Garde : `ShareComposeContractTests`.
nonisolated enum ShareComposeLink {

    static let scheme = "meeshy"
    static let host = "compose-share"
    static let identifierQueryItem = "id"

    /// L'identifiant porté par le lien, ou `nil` si ce n'est pas ce lien.
    ///
    /// **Un lien SANS identifiant rend `nil`, donc n'est pas reconnu.** Le
    /// tenter « au mieux » en reprenant la fiche la plus ancienne ouvrirait la
    /// mauvaise pièce sur deux partages rapides — un défaut qui a l'air d'un
    /// bug de contenu, pas d'un bug de routage, et qu'on chercherait longtemps.
    /// Le balayage de réveil, lui, a le droit de prendre la plus ancienne :
    /// personne ne lui a désigné laquelle.
    static func shareId(from url: URL) -> String? {
        guard url.scheme?.lowercased() == scheme,
              url.host?.lowercased() == host,
              let composants = URLComponents(url: url, resolvingAgainstBaseURL: false),
              let valeur = composants.queryItems?.first(where: { $0.name == identifierQueryItem })?.value,
              !valeur.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        else { return nil }
        return valeur
    }
}
