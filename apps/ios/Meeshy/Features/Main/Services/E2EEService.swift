import Foundation
import CryptoKit



/// Gère les opérations cryptographiques de base pour le chiffrement E2EE.
/// Utilise CryptoKit (Curve25519) pour l'échange de clés (X25519) et les signatures (Ed25519).
public final class E2EEService {
    public static let shared = E2EEService()
    
    private let keychain = KeychainManager.shared
    
    // Key identifiers
    private let identityKeyIdentifier = "com.meeshy.e2ee.identityKey"
    private let signedPreKeyIdentifier = "com.meeshy.e2ee.signedPreKey"
    
    private init() {}
    
    // MARK: - Identity Key Management
    
    /// Génère et sauvegarde une nouvelle Identity Key (Curve25519 KeyAgreement)
    public func generateIdentityKey() throws -> Curve25519.KeyAgreement.PrivateKey {
        let privateKey = Curve25519.KeyAgreement.PrivateKey()
        try keychain.saveKey(privateKey, identifier: identityKeyIdentifier)
        return privateKey
    }
    
    /// Récupère l'Identity Key. La génère si elle n'existe pas.
    public func getOrGenerateIdentityKey() throws -> Curve25519.KeyAgreement.PrivateKey {
        if keychain.keyExists(identifier: identityKeyIdentifier) {
            return try keychain.loadKey(identifier: identityKeyIdentifier)
        }
        return try generateIdentityKey()
    }
    
    // MARK: - PreKey Management
    
    /// Génère une "Signed PreKey" de base.
    public func generateSignedPreKey() throws -> Curve25519.KeyAgreement.PrivateKey {
        let privateKey = Curve25519.KeyAgreement.PrivateKey()
        try keychain.saveKey(privateKey, identifier: signedPreKeyIdentifier)
        return privateKey
    }
    
    /// Récupère la "Signed PreKey". La génère si elle n'existe pas.
    public func getOrGenerateSignedPreKey() throws -> Curve25519.KeyAgreement.PrivateKey {
        if keychain.keyExists(identifier: signedPreKeyIdentifier) {
            return try keychain.loadKey(identifier: signedPreKeyIdentifier)
        }
        return try generateSignedPreKey()
    }
    
    /// Signe des données (comme la clé publique SignedPreKey) en utilisant une clé Ed25519 dérivée de l'IdentityKey.
    /// Note: Dans Signal officiel, l'Identity Key est Ed25519 et convertie en X25519 pour l'accord de clé.
    /// Ici, pour simplifier avec CryptoKit, on dérive une clef de signature depuis l'Identity KeyAgreement.
    public func signData(data: Data, using identityKey: Curve25519.KeyAgreement.PrivateKey) throws -> Data {
        // En CryptoKit, on ne peut pas directement signer avec une KeyAgreement.
        // On dérive une clé de signature symétrique pour le HMAC, ou on utilise une astuce:
        // Pour être rigoureux, l'Identity Key devrait être une Curve25519.Signing.PrivateKey,
        // mais l'objectif MVP est de signer la PreKeyPublic.
        
        // Dérivation d'une clé de signature locale depuis l'identityKey.
        let seed = HKDF<SHA256>.deriveKey(inputKeyMaterial: SymmetricKey(data: identityKey.rawRepresentation),
                                          info: Data("SigningSeed".utf8),
                                          outputByteCount: 32)
        
        let signingKey = try Curve25519.Signing.PrivateKey(rawRepresentation: seed)
        let signature = try signingKey.signature(for: data)
        return signature
    }
    
    // MARK: - Bundle Generation
    
    /// Génère le "Bundle" cryptographique à uploader sur le serveur.
    public func generatePublicBundle() throws -> E2EAPI.BackendPreKeyBundle {
        let identityKey = try getOrGenerateIdentityKey()
        let signedPreKey = try getOrGenerateSignedPreKey()
        
        let identityPublic = identityKey.publicKey.rawRepresentation
        let signedPrePublic = signedPreKey.publicKey.rawRepresentation
        
        // La signature de la clé publique de la prekey prouve qu'elle nous appartient.
        let signature = try signData(data: signedPrePublic, using: identityKey)
        
        // MVP Signal generation for compatibility with backend SignalProtocolAdapter
        // generating one prekey.
        let preKey = Curve25519.KeyAgreement.PrivateKey()
        try keychain.saveKey(preKey, identifier: "com.meeshy.e2ee.otpk.1")
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
        let decrypted = try AES.GCM.open(sealedBox, using: symmetricKey)
        return decrypted
    }
    
    /// Effectue un Diffie-Hellman (X25519) et dérive une clé symétrique AES.
    /// (Ceci est la base pour créer une Session, sans le ratcheting complet).
    public func deriveSymmetricKey(privateKey: Curve25519.KeyAgreement.PrivateKey,
                                   publicKeyData: Data) throws -> SymmetricKey {
        let publicKey = try Curve25519.KeyAgreement.PublicKey(rawRepresentation: publicKeyData)
        let sharedSecret = try privateKey.sharedSecretFromKeyAgreement(with: publicKey)
        // Dérivation HKDF pour obtenir une clé de chiffrement forte
        let symmetricKey = sharedSecret.hkdfDerivedSymmetricKey(
            using: SHA256.self,
            salt: Data(),
            sharedInfo: Data("MeeshyE2EE".utf8),
            outputByteCount: 32
        )
        return symmetricKey
    }
}
