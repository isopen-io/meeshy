import Foundation
import CryptoKit
import MeeshySDK
import os

public actor SessionManager {
    public static let shared = SessionManager()

    enum SessionError: LocalizedError {
        case invalidBase64Payload
        case missingSession

        var errorDescription: String? {
            switch self {
            case .invalidBase64Payload: return "Invalid base64 payload from backend"
            case .missingSession: return "Session not initialized and senderIdentityPublic missing"
            }
        }
    }

    private let keychainPrefix = "me.meeshy.e2ee.session."
    private let peerListKey = "me.meeshy.e2ee.knownPeers"

    private var activeSessions: [String: SymmetricKey] = [:]

    private init() {}

    // MARK: - Peer Tracking

    private func registerPeer(_ peerId: String) {
        var peers = UserDefaults.standard.stringArray(forKey: peerListKey) ?? []
        if !peers.contains(peerId) {
            peers.append(peerId)
            UserDefaults.standard.set(peers, forKey: peerListKey)
        }
    }

    private func unregisterPeer(_ peerId: String) {
        var peers = UserDefaults.standard.stringArray(forKey: peerListKey) ?? []
        peers.removeAll { $0 == peerId }
        UserDefaults.standard.set(peers, forKey: peerListKey)
    }

    // MARK: - Keychain Persistence

    private func persistSession(peerId: String, key: SymmetricKey) {
        let keyData = key.withUnsafeBytes { Data($0) }
        do {
            try KeychainManager.shared.save(keyData.base64EncodedString(), forKey: keychainPrefix + peerId)
        } catch {
            Logger.e2ee.error("Failed to persist session key for peer \(peerId): \(error)")
        }
        registerPeer(peerId)
        activeSessions[peerId] = key
    }

    private func loadSession(peerId: String) -> SymmetricKey? {
        if let cached = activeSessions[peerId] { return cached }
        guard let base64 = KeychainManager.shared.load(forKey: keychainPrefix + peerId),
              let data = Data(base64Encoded: base64) else { return nil }
        let key = SymmetricKey(data: data)
        activeSessions[peerId] = key
        return key
    }

    public func removeSession(peerId: String) {
        activeSessions.removeValue(forKey: peerId)
        KeychainManager.shared.delete(forKey: keychainPrefix + peerId)
        unregisterPeer(peerId)
    }

    // MARK: - Session Management

    /// Récupère la session pour un utilisateur, ou l'établit via Diffie-Hellman si elle n'existe pas.
    public func getOrCreateSession(with userId: String, conversationId: String) async throws -> SymmetricKey {
        if let key = loadSession(peerId: userId) {
            return key
        }

        // Fetch bundle from server
        let bundle = try await E2EAPI.shared.fetchBundle(for: userId)

        // Notify the server we establish a session
        try await E2EAPI.shared.establishSession(with: userId, in: conversationId)

        // Derive symmetric key based on our local IdentityKey and recipient's SignedPreKey
        let myIdentityKey = try E2EEService.shared.getOrGenerateIdentityKey()

        guard let signedPreKeyData = Data(base64Encoded: bundle.signedPreKeyPublic) else {
            throw SessionError.invalidBase64Payload
        }

        // MVP: Double Ratchet simplifé via un ECDH unique pour générer la session.
        let symmetricKey = try E2EEService.shared.deriveSymmetricKey(
            privateKey: myIdentityKey,
            publicKeyData: signedPreKeyData
        )

        persistSession(peerId: userId, key: symmetricKey)
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

        persistSession(peerId: senderId, key: symmetricKey)
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

        if let key = loadSession(peerId: userId) {
            sessionKey = key
        } else if let pubKey = senderIdentity {
            sessionKey = try deriveSessionFromIncoming(senderId: userId, senderIdentityPublic: pubKey)
        } else {
            throw SessionError.missingSession
        }

        return try E2EEService.shared.decrypt(combinedData: ciphertext, symmetricKey: sessionKey)
    }

    public func clearSessions() {
        let allPeers = UserDefaults.standard.stringArray(forKey: peerListKey) ?? []
        for peerId in allPeers {
            KeychainManager.shared.delete(forKey: keychainPrefix + peerId)
        }
        UserDefaults.standard.removeObject(forKey: peerListKey)
        activeSessions.removeAll()
        E2EEService.shared.clearAllKeys()
    }
}

// Logger.e2ee is defined in Logger+Categories.swift
