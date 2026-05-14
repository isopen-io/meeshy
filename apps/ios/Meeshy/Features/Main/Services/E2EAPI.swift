import Foundation
import MeeshySDK

/// API Client dédié au protocole de chiffrement de bout en bout (E2EE Signal)
public final class E2EAPI: @unchecked Sendable {
    public static let shared = E2EAPI()
    
    private init() {}
    
    // Structure requise par le backend (alignée avec signal-protocol.ts)
    public struct BackendPreKeyBundle: Codable {
        public let identityKey: String      // Base64
        public let registrationId: Int
        public let deviceId: Int
        public let preKeyId: Int?
        public let preKeyPublic: String?    // Base64
        public let signedPreKeyId: Int
        public let signedPreKeyPublic: String // Base64
        public let signedPreKeySignature: String // Base64
        public let kyberPreKeyId: Int?
        public let kyberPreKeyPublic: String?
        public let kyberPreKeySignature: String?
    }
    
    /// Génère et publie le Bundle cryptographique public de l'utilisateur sur le Key Server
    public func uploadBundle(bundle: BackendPreKeyBundle) async throws {
        // endpoint backend: POST /api/v1/signal/keys
        // Le gateway repond avec `data: { registrationId, deviceId, preKeyId,
        // signedPreKeyId, message }` (objet, pas string). Decoder en
        // `[String: AnyCodable]` matche la forme reelle. Avant, `APIResponse<String>`
        // declenchait `DecodingError: Type mismatch for type String at path data`
        // a chaque cold start, ce qui empechait l'upload du bundle E2EE.
        let _: APIResponse<[String: AnyCodable]> = try await APIClient.shared.post(
            endpoint: "/signal/keys",
            body: bundle
        )
    }
    
    /// Récupère le Bundle cryptographique public d'un contact cible
    public func fetchBundle(for userId: String) async throws -> BackendPreKeyBundle {
        // endpoint backend: GET /api/v1/signal/keys/:userId
        let response: APIResponse<BackendPreKeyBundle> = try await APIClient.shared.request(
            endpoint: "/signal/keys/\(userId)",
            method: "GET"
        )
        return response.data
    }
    
    /// Établit une session avec le serveur
    public func establishSession(with recipientUserId: String, in conversationId: String) async throws {
        struct SessionBody: Codable {
            let recipientUserId: String
            let conversationId: String
        }
        let body = SessionBody(recipientUserId: recipientUserId, conversationId: conversationId)
        // Le gateway renvoie `data: { message: "..." }` ou
        // `data: { preKeyId, preKeyPublic }` selon la branche — toujours
        // un objet, jamais une string. Memo bug que uploadBundle.
        let _: APIResponse<[String: AnyCodable]> = try await APIClient.shared.post(
            endpoint: "/signal/session/establish",
            body: body
        )
    }
}
