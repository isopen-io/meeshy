import Foundation

/// L'adresse d'une session TUS, telle que le serveur la nomme dans `Location`
/// ou qu'un point de reprise l'a gardée. Chaque PATCH et HEAD y porte la
/// créance de l'appelant : elle ne se résout donc que sur l'ORIGINE de l'API
/// (même schéma, même hôte, même port). Une adresse absolue vers un autre hôte
/// ne reçoit aucune requête.
enum TusUploadLocation {

    static func resolve(_ location: String, baseURL: URL) -> URL? {
        guard let url = URL(string: location, relativeTo: baseURL)?.absoluteURL,
              let scheme = url.scheme?.lowercased(),
              let host = url.host?.lowercased(),
              let baseScheme = baseURL.scheme?.lowercased(),
              let baseHost = baseURL.host?.lowercased(),
              scheme == baseScheme,
              host == baseHost,
              port(of: url, scheme: scheme) == port(of: baseURL, scheme: baseScheme)
        else { return nil }
        return url
    }

    private static func port(of url: URL, scheme: String) -> Int? {
        if let port = url.port { return port }
        switch scheme {
        case "https": return 443
        case "http": return 80
        default: return nil
        }
    }
}
