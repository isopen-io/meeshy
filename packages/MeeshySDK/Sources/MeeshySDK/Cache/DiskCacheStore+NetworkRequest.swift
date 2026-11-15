import Foundation

// La requête du funnel réseau, extraite de `DiskCacheStore.swift` pour tenir
// le budget de taille du fichier (#9863).
extension DiskCacheStore {
    /// Construit la requête du funnel réseau. Un média hébergé sur l'ORIGINE
    /// de l'API Meeshy (même scheme + host + port que `apiOrigin`) reçoit les
    /// en-têtes d'auth — `Authorization: Bearer` (prioritaire) ou
    /// `X-Session-Token` (session anonyme), même convention qu'`APIClient` —
    /// car certaines routes média sont protégées (`/api/v1/static/:filename`,
    /// audio de la bibliothèque de sons). Toute autre origine (CDN, hôte
    /// tiers) reste une requête NUE : un token ne doit jamais fuiter hors de
    /// l'API. Pure et nonisolated pour être testable sans réseau.
    nonisolated static func networkRequest(
        for url: URL,
        apiOrigin: String?,
        authToken: String?,
        sessionToken: String?
    ) -> URLRequest {
        var request = URLRequest(url: url)
        guard let apiOrigin,
              let origin = URL(string: apiOrigin),
              let originScheme = origin.scheme?.lowercased(),
              let originHost = origin.host?.lowercased(),
              let urlScheme = url.scheme?.lowercased(),
              let urlHost = url.host?.lowercased(),
              urlScheme == originScheme,
              urlHost == originHost,
              normalizedPort(url.port, scheme: urlScheme) == normalizedPort(origin.port, scheme: originScheme)
        else { return request }
        if let authToken {
            request.setValue("Bearer \(authToken)", forHTTPHeaderField: "Authorization")
        } else if let sessionToken {
            request.setValue(sessionToken, forHTTPHeaderField: "X-Session-Token")
        }
        return request
    }

    /// `https://host` et `https://host:443` sont la même origine — replie le
    /// port implicite du scheme pour la comparaison.
    private nonisolated static func normalizedPort(_ port: Int?, scheme: String) -> Int? {
        if let port { return port }
        switch scheme {
        case "https": return 443
        case "http": return 80
        default: return nil
        }
    }
}
