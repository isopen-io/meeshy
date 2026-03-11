import Foundation
import CryptoKit
import MeeshySDK
import os

public final class E2EEService: @unchecked Sendable {
    public static let shared = E2EEService()

    private let identityKeyIdentifier = "me.meeshy.e2ee.identityKey"
    private let signedPreKeyIdentifier = "me.meeshy.e2ee.signedPreKey"
    private let signingKeyIdentifier = "me.meeshy.e2ee.signingKey"
    private let otpkPrefix = "me.meeshy.e2ee.otpk."

    private let keychain = KeychainManager.shared

    private init() {
        Self.migrateOldKeychainPrefix()
    }

    // MARK: - Old Prefix Migration

    private static let migrationKey = "me.meeshy.e2ee.migrated.v1"

    private static func migrateOldKeychainPrefix() {
        guard !UserDefaults.standard.bool(forKey: migrationKey) else { return }
        let oldKeys = [
            "com.meeshy.e2ee.identityKey",
            "com.meeshy.e2ee.signedPreKey",
            "com.meeshy.e2ee.signingKey",
            "com.meeshy.e2ee.otpk.1"
        ]
        for key in oldKeys {
            KeychainManager.shared.delete(forKey: key)
        }
        UserDefaults.standard.set(true, forKey: migrationKey)
    }

    // MARK: - Keychain helpers for Curve25519 keys

    private func saveCurve25519Key(_ key: Curve25519.KeyAgreement.PrivateKey, identifier: String) throws {
        try keychain.save(key.rawRepresentation.base64EncodedString(), forKey: identifier)
    }

    private func loadCurve25519Key(identifier: String) throws -> Curve25519.KeyAgreement.PrivateKey {
        guard let base64 = keychain.load(forKey: identifier),
              let data = Data(base64Encoded: base64) else {
            throw E2EError.keyNotFound(identifier)
        }
        return try Curve25519.KeyAgreement.PrivateKey(rawRepresentation: data)
    }

    private func curve25519KeyExists(identifier: String) -> Bool {
        keychain.load(forKey: identifier) != nil
    }

    // MARK: - Keychain helpers for Curve25519 Signing key

    private func saveCurve25519SigningKey(_ key: Curve25519.Signing.PrivateKey, identifier: String) throws {
        try keychain.save(key.rawRepresentation.base64EncodedString(), forKey: identifier)
    }

    private func loadCurve25519SigningKey(identifier: String) throws -> Curve25519.Signing.PrivateKey {
        guard let base64 = keychain.load(forKey: identifier),
              let data = Data(base64Encoded: base64) else {
            throw E2EError.keyNotFound(identifier)
        }
        return try Curve25519.Signing.PrivateKey(rawRepresentation: data)
    }

    private func signingKeyExists() -> Bool {
        keychain.load(forKey: signingKeyIdentifier) != nil
    }

    public func getOrGenerateSigningKey() throws -> Curve25519.Signing.PrivateKey {
        if signingKeyExists() {
            return try loadCurve25519SigningKey(identifier: signingKeyIdentifier)
        }
        let key = Curve25519.Signing.PrivateKey()
        try saveCurve25519SigningKey(key, identifier: signingKeyIdentifier)
        return key
    }

    private enum E2EError: LocalizedError {
        case keyNotFound(String)

        var errorDescription: String? {
            switch self {
            case .keyNotFound(let id): return "E2EE key not found: \(id)"
            }
        }
    }

    // MARK: - Identity Key Management

    /// Génère et sauvegarde une nouvelle Identity Key (Curve25519 KeyAgreement)
    public func generateIdentityKey() throws -> Curve25519.KeyAgreement.PrivateKey {
        let privateKey = Curve25519.KeyAgreement.PrivateKey()
        try saveCurve25519Key(privateKey, identifier: identityKeyIdentifier)
        return privateKey
    }

    /// Récupère l'Identity Key. La génère si elle n'existe pas.
    public func getOrGenerateIdentityKey() throws -> Curve25519.KeyAgreement.PrivateKey {
        if curve25519KeyExists(identifier: identityKeyIdentifier) {
            return try loadCurve25519Key(identifier: identityKeyIdentifier)
        }
        return try generateIdentityKey()
    }

    // MARK: - PreKey Management

    /// Génère une "Signed PreKey" de base.
    public func generateSignedPreKey() throws -> Curve25519.KeyAgreement.PrivateKey {
        let privateKey = Curve25519.KeyAgreement.PrivateKey()
        try saveCurve25519Key(privateKey, identifier: signedPreKeyIdentifier)
        return privateKey
    }

    /// Récupère la "Signed PreKey". La génère si elle n'existe pas.
    public func getOrGenerateSignedPreKey() throws -> Curve25519.KeyAgreement.PrivateKey {
        if curve25519KeyExists(identifier: signedPreKeyIdentifier) {
            return try loadCurve25519Key(identifier: signedPreKeyIdentifier)
        }
        return try generateSignedPreKey()
    }

    /// Signe des données (comme la clé publique SignedPreKey) avec la clé de signature dédiée.
    /// Clé distincte de la clé d'accord : pas de réutilisation de matériau cryptographique entre X25519 et Ed25519.
    public func signData(data: Data) throws -> Data {
        let signingKey = try getOrGenerateSigningKey()
        return try signingKey.signature(for: data)
    }

    // MARK: - Stable ID Persistence

    private static func getOrCreateStableId(key: String) -> Int {
        if let base64 = KeychainManager.shared.load(forKey: key),
           let data = Data(base64Encoded: base64),
           data.count >= 4 {
            return Int(data.withUnsafeBytes { $0.load(as: Int32.self) })
        }
        let newId = Int.random(in: 1...65535)
        var value = Int32(newId)
        let data = Data(bytes: &value, count: 4)
        do {
            try KeychainManager.shared.save(data.base64EncodedString(), forKey: key)
        } catch {
            Logger.e2ee.error("Failed to persist stable ID for \(key): \(error)")
        }
        return newId
    }

    // MARK: - Bundle Generation

    /// Génère le "Bundle" cryptographique à uploader sur le serveur.
    public func generatePublicBundle() throws -> E2EAPI.BackendPreKeyBundle {
        let identityKey = try getOrGenerateIdentityKey()
        let signedPreKey = try getOrGenerateSignedPreKey()

        let identityPublic = identityKey.publicKey.rawRepresentation
        let signedPrePublic = signedPreKey.publicKey.rawRepresentation

        let signature = try signData(data: signedPrePublic)

        let preKey = Curve25519.KeyAgreement.PrivateKey()
        try saveCurve25519Key(preKey, identifier: otpkPrefix + "1")
        let preKeyPublic = preKey.publicKey.rawRepresentation

        let registrationId = Self.getOrCreateStableId(key: "me.meeshy.e2ee.registrationId")
        let preKeyId = Self.getOrCreateStableId(key: "me.meeshy.e2ee.preKeyId")
        let signedPreKeyId = Self.getOrCreateStableId(key: "me.meeshy.e2ee.signedPreKeyId")

        return E2EAPI.BackendPreKeyBundle(
            identityKey: identityPublic.base64EncodedString(),
            registrationId: registrationId,
            deviceId: 1,
            preKeyId: preKeyId,
            preKeyPublic: preKeyPublic.base64EncodedString(),
            signedPreKeyId: signedPreKeyId,
            signedPreKeyPublic: signedPrePublic.base64EncodedString(),
            signedPreKeySignature: signature.base64EncodedString(),
            kyberPreKeyId: nil,
            kyberPreKeyPublic: nil,
            kyberPreKeySignature: nil
        )
    }

    // MARK: - Key Cleanup

    public func clearAllKeys() {
        keychain.delete(forKey: identityKeyIdentifier)
        keychain.delete(forKey: signedPreKeyIdentifier)
        keychain.delete(forKey: signingKeyIdentifier)
        keychain.delete(forKey: otpkPrefix + "1")
        keychain.delete(forKey: "me.meeshy.e2ee.registrationId")
        keychain.delete(forKey: "me.meeshy.e2ee.preKeyId")
        keychain.delete(forKey: "me.meeshy.e2ee.signedPreKeyId")
    }

    // MARK: - Ciphering Basics (AES-GCM)

    /// Chiffre un texte avec une clé symétrique partagée en AES-GCM.
    public func encrypt(message: Data, symmetricKey: SymmetricKey) throws -> Data {
        let sealedBox = try AES.GCM.seal(message, using: symmetricKey)
        guard let combined = sealedBox.combined else {
            throw NSError(domain: "E2EE", code: 1, userInfo: [NSLocalizedDescriptionKey: "Erreur de chiffrement (pas de combined data)"])
        }
        return combined
    }

    /// Déchiffre un ciphertext avec une clé symétrique partagée en AES-GCM.
    public func decrypt(combinedData: Data, symmetricKey: SymmetricKey) throws -> Data {
        let sealedBox = try AES.GCM.SealedBox(combined: combinedData)
        return try AES.GCM.open(sealedBox, using: symmetricKey)
    }

    /// Effectue un Diffie-Hellman (X25519) et dérive une clé symétrique AES.
    public func deriveSymmetricKey(privateKey: Curve25519.KeyAgreement.PrivateKey,
                                   publicKeyData: Data) throws -> SymmetricKey {
        let publicKey = try Curve25519.KeyAgreement.PublicKey(rawRepresentation: publicKeyData)
        let sharedSecret = try privateKey.sharedSecretFromKeyAgreement(with: publicKey)
        return sharedSecret.hkdfDerivedSymmetricKey(
            using: SHA256.self,
            salt: Data(),
            sharedInfo: Data("MeeshyE2EE".utf8),
            outputByteCount: 32
        )
    }
}

private extension Logger {
    static let e2ee = Logger(subsystem: "me.meeshy.app", category: "e2ee")
}
