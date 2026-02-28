import Foundation
import CryptoKit

/// Gère l'état et l'établissement des sessions de chiffrement de bout en bout
public final class SessionManager {
    public static let shared = SessionManager()
    
    // Cache en mémoire des clés de session symétriques
    // En production, stocker en base locale chiffrée (CoreData, Realm...)
    private var activeSessions: [String: SymmetricKey] = [:]
    
    private init() {}
    
    /// Récupère la session pour un utilisateur, ou l'établit via Diffie-Hellman si elle n'existe pas.
    public func getOrCreateSession(with userId: String, conversationId: String) async throws -> SymmetricKey {
        if let key = activeSessions[userId] {
            return key
        }
        
        // Fetch bundle from server
        let bundle = try await E2EAPI.shared.fetchBundle(for: userId)
        
        // Notify the server we establish a session
        try await E2EAPI.shared.establishSession(with: userId, in: conversationId)
        
        // Derive symmetric key based on our local IdentityKey and recipient's SignedPreKey
        let myIdentityKey = try E2EEService.shared.getOrGenerateIdentityKey()
        
        guard let signedPreKeyData = Data(base64Encoded: bundle.signedPreKeyPublic) else {
            throw NSError(domain: "E2EE", code: 3, userInfo: [NSLocalizedDescriptionKey: "Invalid base64 payload from backend"])
        }
        
        // MVP: Double Ratchet simplifé via un ECDH unique pour générer la session.
        let symmetricKey = try E2EEService.shared.deriveSymmetricKey(
            privateKey: myIdentityKey,
            publicKeyData: signedPreKeyData
        )
        
        activeSessions[userId] = symmetricKey
        return symmetricKey
    }
    
    /// Appelé lors de la réception du premier message E2EE d'un User B.
    /// Dérive la clé symétrique à partir de l'identité publique de l'expéditeur.
    public func deriveSessionFromIncoming(senderId: String, senderIdentityPublic: Data) throws -> SymmetricKey {
        // MVP: On utilise notre SignedPreKey locale combinée à la clé publique de l'expéditeur
        let mySignedPreKey = try E2EEService.shared.getOrGenerateSignedPreKey()
        
        let symmetricKey = try E2EEService.shared.deriveSymmetricKey(
            privateKey: mySignedPreKey,
            publicKeyData: senderIdentityPublic
        )
        
        activeSessions[senderId] = symmetricKey
        return symmetricKey
    }
    
    /// Chiffre le payload d'un message text/json
    public func encryptMessage(_ payload: Data, for userId: String, conversationId: String) async throws -> Data {
        let sessionKey = try await getOrCreateSession(with: userId, conversationId: conversationId)
        return try E2EEService.shared.encrypt(message: payload, symmetricKey: sessionKey)
    }
    
    /// Déchiffre le ciphertext provenant du réseau
    public func decryptMessage(_ ciphertext: Data, from userId: String, senderIdentity: Data? = nil) async throws -> Data {
        let sessionKey: SymmetricKey
        
        if let key = activeSessions[userId] {
            sessionKey = key
        } else if let pubKey = senderIdentity {
            sessionKey = try deriveSessionFromIncoming(senderId: userId, senderIdentityPublic: pubKey)
        } else {
            throw NSError(domain: "E2EE", code: 2, userInfo: [NSLocalizedDescriptionKey: "Session non initialisée et senderIdentityPublic manquante."])
        }
        
        return try E2EEService.shared.decrypt(combinedData: ciphertext, symmetricKey: sessionKey)
    }
    
    /// Nettoie les sessions en mémoire (ex: lors de la déconnexion)
    public func clearSessions() {
        activeSessions.removeAll()
    }
}
