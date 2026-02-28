import Foundation
import CryptoKit
import Security

/// Gère le stockage sécurisé des clés cryptographiques dans le Keychain iOS.
public final class KeychainManager {
    public static let shared = KeychainManager()
    
    private init() {}
    
    public enum KeychainError: Error {
        case itemNotFound
        case unexpectedData
        case unhandledError(status: OSStatus)
    }
    
    /// Sauvegarde une clé privée (Curve25519) dans le Keychain.
    public func saveKey(_ key: Curve25519.KeyAgreement.PrivateKey, identifier: String) throws {
        let keyData = key.rawRepresentation
        
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: identifier,
            kSecValueData as String: keyData,
            kSecAttrAccessible as String: kSecAttrAccessibleWhenUnlockedThisDeviceOnly
        ]
        
        // Supprime l'entrée si elle existe déjà
        SecItemDelete(query as CFDictionary)
        
        let status = SecItemAdd(query as CFDictionary, nil)
        guard status == errSecSuccess else {
            throw KeychainError.unhandledError(status: status)
        }
    }
    
    /// Récupère une clé privée (Curve25519) depuis le Keychain.
    public func loadKey(identifier: String) throws -> Curve25519.KeyAgreement.PrivateKey {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: identifier,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne
        ]
        
        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)
        
        guard status != errSecItemNotFound else {
            throw KeychainError.itemNotFound
        }
        
        guard status == errSecSuccess else {
            throw KeychainError.unhandledError(status: status)
        }
        
        guard let keyData = item as? Data else {
            throw KeychainError.unexpectedData
        }
        
        return try Curve25519.KeyAgreement.PrivateKey(rawRepresentation: keyData)
    }
    
    /// Supprime une clé du Keychain.
    public func deleteKey(identifier: String) throws {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: identifier
        ]
        
        let status = SecItemDelete(query as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else {
            throw KeychainError.unhandledError(status: status)
        }
    }
    
    /// Vérifie si une clé existe.
    public func keyExists(identifier: String) -> Bool {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: identifier,
            kSecReturnData as String: false,
            kSecMatchLimit as String: kSecMatchLimitOne
        ]
        
        let status = SecItemCopyMatching(query as CFDictionary, nil)
        return status == errSecSuccess
    }
}
