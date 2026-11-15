import Foundation

/// A single raw-URL → tracking-token mapping attached to a message or post by
/// the gateway. The client never rewrites the message content; instead it
/// resolves `<web origin>/l/<token>` as the tappable destination for the
/// raw URL (capture + 302 redirect to the original page), keeping the displayed
/// text and any video preview intact. Optional everywhere → older payloads
/// without this field decode unchanged (rollout-safe).
public struct TrackedLink: Codable, Sendable, Equatable {
    public let url: String
    public let token: String

    public init(url: String, token: String) {
        self.url = url
        self.token = token
    }
}

extension Sequence where Element == TrackedLink {
    /// Collapses a list of `{ url, token }` mappings into a `[url: token]`
    /// lookup. Last token wins on a duplicate URL (gateway sends one per URL).
    public var trackedLinkMap: [String: String] {
        reduce(into: [:]) { $0[$1.url] = $1.token }
    }
}

extension TrackedLink {
    /// La redirection suivie d'un jeton — `<origine web>/l/<token>` (#9075).
    ///
    /// L'origine est celle de l'environnement ACTIF (`MeeshyConfig.webOrigin` :
    /// `staging.meeshy.me` sur staging), jamais `meeshy.me` en dur : un jeton
    /// émis par la passerelle de staging n'existe pas en production, et le
    /// routeur in-app ne reconnaît que l'hôte de l'environnement sélectionné.
    public static func redirectURL(token: String,
                                   webOrigin: String = MeeshyConfig.shared.webOrigin) -> URL? {
        URL(string: "\(webOrigin)/l/\(token)")
    }
}
