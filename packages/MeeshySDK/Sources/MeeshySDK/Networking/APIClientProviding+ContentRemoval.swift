import Foundation

/// Le corps d'un retrait par la modération (#11151) : `{ "reason": … }`.
struct ContentRemovalBody: Encodable, Sendable {
    let reason: String
}

extension APIClientProviding {
    /// **Un DELETE qui porte, ou non, le motif d'un retrait** (#11151). Sans
    /// motif, la requête part SANS corps — l'auteur qui supprime son propre
    /// contenu envoie celle d'avant, à l'octet près (rétrocompatibilité).
    ///
    /// Avec motif, la réponse se lit comme celle du DELETE sans corps : un
    /// accusé (`DeletionAcknowledgement`, #10605). La passerelle sert
    /// `{ messageId, deleted, meta }` au retrait d'un message ; la lire en
    /// `[String: Bool]` faisait d'un retrait réussi une erreur, et l'app
    /// remettait à l'écran le message que le serveur venait de retirer (#11529).
    func deleteRemovingContent(_ endpoint: any MeeshyEndpoint, reason: String?) async throws {
        guard let reason else {
            let _: APIResponse<[String: Bool]> = try await delete(endpoint)
            return
        }
        let body = try JSONEncoder().encode(ContentRemovalBody(reason: reason))
        let _: DeletionAcknowledgement = try await request(endpoint, method: "DELETE", body: body, queryItems: nil)
    }
}
