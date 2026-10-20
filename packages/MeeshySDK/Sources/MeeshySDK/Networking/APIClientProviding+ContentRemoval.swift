import Foundation

/// Le corps d'un retrait par la modération (#11151) : `{ "reason": … }`.
struct ContentRemovalBody: Encodable, Sendable {
    let reason: String
}

extension APIClientProviding {
    /// **Un DELETE qui porte, ou non, le motif d'un retrait** (#11151). Sans
    /// motif, la requête part SANS corps — l'auteur qui supprime son propre
    /// contenu envoie celle d'avant, à l'octet près (rétrocompatibilité).
    func deleteRemovingContent(_ endpoint: any MeeshyEndpoint, reason: String?) async throws {
        guard let reason else {
            let _: APIResponse<[String: Bool]> = try await delete(endpoint)
            return
        }
        let _: APIResponse<[String: Bool]> = try await delete(endpoint, body: ContentRemovalBody(reason: reason))
    }
}
