import Foundation
import CryptoKit
import Security
import MeeshySDK

/// Gère les opérations cryptographiques de base pour le chiffrement E2EE.
/// Utilise CryptoKit (Curve25519) pour l'échange de clés (X25519) et les signatures (Ed25519).
public final class E2EEService {
    public static let shared = E2EEService()

    // Key identifiers
    private let identityKeyIdentifier = "com.meeshy.e2ee.identityKey"
    private let signedPreKeyIdentifier = "com.meeshy.e2ee.signedPreKey"

    private init() {}

    // MARK: - Keychain helpers for Curve25519 keys

    private func saveCurve25519Key(_ key: Curve25519.KeyAgreement.PrivateKey, identifier: String) throws {
        let keyData = key.rawRepresentation
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: identifier,
            kSecValueData as String: keyData,
            kSecAttrAccessible as String: kSecAttrAccessibleWhenUnlockedThisDeviceOnly
        ]
        SecItemDelete(query as CFDictionary)
        let status = SecItemAdd(query as CFDictionary, nil)
        guard status == errSecSuccess else {
            throw E2EError.keychainError(status)
        }
    }

    private func loadCurve25519Key(identifier: String) throws -> Curve25519.KeyAgreement.PrivateKey {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: identifier,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne
        ]
        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)
        guard status == errSecSuccess, let keyData = item as? Data else {
            throw E2EError.keychainError(status)
        }
        return try Curve25519.KeyAgreement.PrivateKey(rawRepresentation: keyData)
    }

    private func curve25519KeyExists(identifier: String) -> Bool {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: identifier,
            kSecReturnData as String: false,
            kSecMatchLimit as String: kSecMatchLimitOne
        ]
        return SecItemCopyMatching(query as CFDictionary, nil) == errSecSuccess
    }

    private enum E2EError: Error {
        case keychainError(OSStatus)
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

    /// Signe des données (comme la clé publique SignedPreKey) en utilisant une clé Ed25519 dérivée de l'IdentityKey.
    public func signData(data: Data, using identityKey: Curve25519.KeyAgreement.PrivateKey) throws -> Data {
        let seed = HKDF<SHA256>.deriveKey(inputKeyMaterial: SymmetricKey(data: identityKey.rawRepresentation),
                                          info: Data("SigningSeed".utf8),
                                          outputByteCount: 32)
        let signingKey = try Curve25519.Signing.PrivateKey(rawRepresentation: seed)
        return try signingKey.signature(for: data)
    }

    // MARK: - Bundle Generation

    /// Génère le "Bundle" cryptographique à uploader sur le serveur.
    public func generatePublicBundle() throws -> E2EAPI.BackendPreKeyBundle {
        let identityKey = try getOrGenerateIdentityKey()
        let signedPreKey = try getOrGenerateSignedPreKey()

        let identityPublic = identityKey.publicKey.rawRepresentation
        let signedPrePublic = signedPreKey.publicKey.rawRepresentation

        let signature = try signData(data: signedPrePublic, using: identityKey)

        let preKey = Curve25519.KeyAgreement.PrivateKey()
        try saveCurve25519Key(preKey, identifier: "com.meeshy.e2ee.otpk.1")
        let preKeyPublic = preKey.publicKey.rawRepresentation

        return E2EAPI.BackendPreKeyBundle(
            identityKey: identityPublic.base64EncodedString(),
            registrationId: Int.random(in: 1...16380),
            deviceId: 1,
            preKeyId: Int.random(in: 1...16777215),
            preKeyPublic: preKeyPublic.base64EncodedString(),
            signedPreKeyId: Int.random(in: 1...16777215),
            signedPreKeyPublic: signedPrePublic.base64EncodedString(),
            signedPreKeySignature: signature.base64EncodedString(),
            kyberPreKeyId: nil,
            kyberPreKeyPublic: nil,
            kyberPreKeySignature: nil
        )
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
