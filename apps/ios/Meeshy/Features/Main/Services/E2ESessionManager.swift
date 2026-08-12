import Foundation
import CryptoKit
import MeeshySDK
import os

public actor SessionManager {
    public static let shared = SessionManager()

    enum SessionError: LocalizedError {
        case invalidBase64Payload
        case missingSession
        case sessionUnavailable

        var errorDescription: String? {
            switch self {
            case .invalidBase64Payload: return "Invalid base64 payload from backend"
            case .missingSession: return "Session not initialized and senderIdentityPublic missing"
            case .sessionUnavailable: return "E2EE session unavailable — establishment recently failed, retry on cooldown"
            }
        }
    }

    private let keychainPrefix = "me.meeshy.e2ee.session."
    private let peerListKey = "me.meeshy.e2ee.knownPeers"

    // MARK: - Per-user Keychain Namespace

    /// Returns the current user ID from AuthManager (MainActor hop required since
    /// SessionManager is an actor and AuthManager is @MainActor).
    private func currentUserId() async -> String? {
        let userId = await MainActor.run { AuthManager.shared.currentUser?.id }
        if let userId {
            lastKnownUserId = userId
        }
        return userId
    }

    /// Pure resolution: which userId should scope the Keychain wipe in
    /// `clearSessions()`. `current` is whatever `currentUserId()` reads at
    /// call time (already `nil` once the auth teardown has run); `cached`
    /// is the last non-nil id this actor observed while a session was still
    /// live. Falls back to `cached` so the wipe targets the OUTGOING
    /// account's Keychain namespace instead of `nil` (which silently no-ops
    /// against `persistSession`'s namespaced saves).
    nonisolated static func resolveWipeUserId(current: String?, cached: String?) -> String? {
        current ?? cached
    }

    private var activeSessions: [String: SymmetricKey] = [:]

    /// P1 — last non-nil userId observed by `currentUserId()` while a
    /// session was still active. `clearSessions()` is invoked from
    /// `MeeshyApp`'s `adaptiveOnChange(of: authManager.isAuthenticated)`
    /// `else` branch, which only fires AFTER `AuthManager.logout()` has
    /// already set `currentUser = nil` — so reading `currentUserId()` fresh
    /// at that point always returns `nil`, and the Keychain `delete(forKey:account:)`
    /// silently targets the WRONG (un-namespaced) entry, leaving the
    /// outgoing user's E2EE session keys on the Keychain. This cache lets
    /// `clearSessions()` fall back to the last known real userId instead.
    private var lastKnownUserId: String?

    /// Negative cache: peers whose session establishment recently failed.
    /// Prevents re-hitting the (possibly permanently unavailable) Signal
    /// Protocol endpoints on every message — see `getOrCreateSession`.
    private var failedSessionAttempts: [String: Date] = [:]

    /// Cooldown before a peer with a failed establishment is retried. While a
    /// peer is in cooldown its DMs fall back to the existing plaintext path
    /// (the MVP fallback in `ConversationViewModel.sendMessage`); the window
    /// is bounded so a server-side Signal Protocol recovery is picked up
    /// without requiring an app restart.
    private static let failedSessionCooldown: TimeInterval = 600

    /// Pure decision for the negative cache: is a peer still within its
    /// post-failure cooldown? Extracted as a `nonisolated static` so the
    /// policy is unit-testable without the E2EAPI / E2EEService / Keychain
    /// singletons that `getOrCreateSession` otherwise pulls in.
    nonisolated static func isWithinFailureCooldown(
        failedAt: Date?,
        now: Date,
        cooldown: TimeInterval
    ) -> Bool {
        guard let failedAt else { return false }
        return now.timeIntervalSince(failedAt) < cooldown
    }

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

    private func persistSession(peerId: String, key: SymmetricKey) async {
        let keyData = key.withUnsafeBytes { Data($0) }
        let userId = await currentUserId()
        do {
            try await KeychainManager.shared.saveAsync(
                keyData.base64EncodedString(),
                forKey: keychainPrefix + peerId,
                account: userId
            )
        } catch {
            Logger.e2ee.error("Failed to persist session key for peer \(peerId): \(error)")
        }
        registerPeer(peerId)
        activeSessions[peerId] = key
    }

    private func loadSession(peerId: String) async -> SymmetricKey? {
        if let cached = activeSessions[peerId] { return cached }
        let userId = await currentUserId()
        guard let base64 = await KeychainManager.shared.loadAsync(
            forKey: keychainPrefix + peerId,
            account: userId
        ), let data = Data(base64Encoded: base64) else { return nil }
        let key = SymmetricKey(data: data)
        activeSessions[peerId] = key
        return key
    }

    public func removeSession(peerId: String) {
        activeSessions.removeValue(forKey: peerId)
        Task {
            let userId = await currentUserId()
            KeychainManager.shared.delete(forKey: keychainPrefix + peerId, account: userId)
        }
        unregisterPeer(peerId)
    }

    // MARK: - Session Management

    /// Récupère la session pour un utilisateur, ou l'établit via Diffie-Hellman si elle n'existe pas.
    public func getOrCreateSession(with userId: String, conversationId: String) async throws -> SymmetricKey {
        if let key = await loadSession(peerId: userId) {
            return key
        }

        // Negative cache — when session establishment recently failed (the
        // gateway Signal Protocol endpoint is unavailable), fail fast instead
        // of re-hitting the network on every message. `sendMessage` catches
        // this and falls back to a plaintext send; the cooldown lets a
        // server-side recovery eventually get picked up.
        if Self.isWithinFailureCooldown(
            failedAt: failedSessionAttempts[userId],
            now: Date(),
            cooldown: Self.failedSessionCooldown
        ) {
            throw SessionError.sessionUnavailable
        }

        do {
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

            await persistSession(peerId: userId, key: symmetricKey)
            failedSessionAttempts.removeValue(forKey: userId)
            return symmetricKey
        } catch {
            // A cancelled send (user left the screen, switched conversation…)
            // is not a server failure — recording it would poison the negative
            // cache and silently downgrade this peer's DMs to plaintext for the
            // whole cooldown window. Only cache genuine establishment failures.
            if !Task.isCancelled {
                failedSessionAttempts[userId] = Date()
            }
            throw error
        }
    }

    /// Appelé lors de la réception du premier message E2EE d'un User B.
    /// Dérive la clé symétrique à partir de l'identité publique de l'expéditeur.
    public func deriveSessionFromIncoming(senderId: String, senderIdentityPublic: Data) async throws -> SymmetricKey {
        // MVP: On utilise notre SignedPreKey locale combinée à la clé publique de l'expéditeur
        let mySignedPreKey = try E2EEService.shared.getOrGenerateSignedPreKey()

        let symmetricKey = try E2EEService.shared.deriveSymmetricKey(
            privateKey: mySignedPreKey,
            publicKeyData: senderIdentityPublic
        )

        await persistSession(peerId: senderId, key: symmetricKey)
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

        if let key = await loadSession(peerId: userId) {
            sessionKey = key
        } else if let pubKey = senderIdentity {
            sessionKey = try await deriveSessionFromIncoming(senderId: userId, senderIdentityPublic: pubKey)
        } else {
            throw SessionError.missingSession
        }

        return try E2EEService.shared.decrypt(combinedData: ciphertext, symmetricKey: sessionKey)
    }

    // MARK: - Keychain Namespace Migration

    /// One-time migration of legacy un-namespaced session keys to the per-user namespace.
    ///
    /// Must be called after login once `AuthManager.shared.currentUser` is set.
    /// A UserDefaults flag scoped to the userId prevents the migration from running twice.
    ///
    /// Dynamic peer keys (keychainPrefix + peerId) can only be migrated for peers that are
    /// already tracked in the peerList at the time of migration. Sessions with peers not yet
    /// in the list will be re-established via normal E2E handshake on next use.
    public func migrateKeychainIfNeeded() async {
        guard let userId = await currentUserId() else { return }

        let flagKey = "meeshy.keychain.namespaceMigration.\(userId)"
        guard !UserDefaults.standard.bool(forKey: flagKey) else { return }

        let knownPeers = UserDefaults.standard.stringArray(forKey: peerListKey) ?? []
        let legacyKeys = knownPeers.map { keychainPrefix + $0 }

        KeychainManager.shared.migrateToNamespaced(userId: userId, keys: legacyKeys)
        UserDefaults.standard.set(true, forKey: flagKey)
    }

    public func clearSessions() async {
        let userId = Self.resolveWipeUserId(current: await currentUserId(), cached: lastKnownUserId)
        let allPeers = UserDefaults.standard.stringArray(forKey: peerListKey) ?? []
        for peerId in allPeers {
            KeychainManager.shared.delete(forKey: keychainPrefix + peerId, account: userId)
        }
        UserDefaults.standard.removeObject(forKey: peerListKey)
        activeSessions.removeAll()
        lastKnownUserId = nil
        E2EEService.shared.clearAllKeys()
    }
}

// MARK: - DecryptionSessionProviding Adapter

/// Bridges SessionManager (actor) to DecryptionSessionProviding.
/// SessionManager.decryptMessage has an extra `senderIdentity` parameter,
/// so direct protocol conformance is not possible — this thin adapter bridges the gap.
struct LiveSessionProvider: DecryptionSessionProviding {
    func decryptMessage(_ ciphertext: Data, from senderId: String) async throws -> Data {
        try await SessionManager.shared.decryptMessage(ciphertext, from: senderId)
    }
}

// Logger.e2ee is defined in Logger+Categories.swift
