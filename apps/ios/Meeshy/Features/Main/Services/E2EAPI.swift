import Foundation

/// API Client dédié au protocole de chiffrement de bout en bout (E2EE Signal)
public final class E2EAPI {
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
        // endpoint backend: POST /api/signal/keys
        let _: APIResponse<String> = try await APIClient.shared.post(
            endpoint: "/signal/keys",
            body: bundle
        )
    }
    
    /// Récupère le Bundle cryptographique public d'un contact cible
    public func fetchBundle(for userId: String) async throws -> BackendPreKeyBundle {
        // endpoint backend: GET /api/signal/keys/:userId
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
        let _: APIResponse<String> = try await APIClient.shared.post(
            endpoint: "/signal/session/establish",
            body: body
        )
    }
}
