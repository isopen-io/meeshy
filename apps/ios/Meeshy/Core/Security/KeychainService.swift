//
//  KeychainService.swift
//  Meeshy
//
//  Unified secure keychain storage for tokens and sensitive data
//  Replaces both KeychainManager and KeychainService (consolidated)
//  Minimum iOS 16+
//  Swift 6 compliant with Sendable conformance
//

import Foundation
import Security

final class KeychainService: Sendable {
    // MARK: - Singleton

    static let shared = KeychainService()

    // MARK: - Properties

    private let service = Bundle.main.bundleIdentifier ?? "me.meeshy.app"

    private enum Keys {
        static let accessToken = "accessToken"
        static let refreshToken = "refreshToken"
        static let tempAccessToken = "tempAccessToken"
        static let tempRefreshToken = "tempRefreshToken"
        static let biometricEnabled = "biometricEnabled"
        static let tokenExpiration = "tokenExpiration"
        static let userData = "userData"
    }

    // MARK: - Initialization

    private init() {}

    // MARK: - Generic Key-Value Storage (replaces KeychainManager)

    /// Save a string value to keychain for any key
    @discardableResult
    func save(_ value: String, forKey key: String) -> Bool {
        guard let data = value.data(using: .utf8) else {
            return false
        }

        // Delete existing item if present
        delete(forKey: key)

        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key,
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlock
        ]

        let status = SecItemAdd(query as CFDictionary, nil)
        return status == errSecSuccess
    }

    /// Load a string value from keychain for any key
    func load(forKey key: String) -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne
        ]

        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)

        guard status == errSecSuccess,
              let data = result as? Data,
              let value = String(data: data, encoding: .utf8) else {
            return nil
        }

        return value
    }

    /// Delete a value from keychain for any key
    @discardableResult
    func delete(forKey key: String) -> Bool {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key
        ]

        let status = SecItemDelete(query as CFDictionary)
        return status == errSecSuccess || status == errSecItemNotFound
    }

    /// Check if a key exists in keychain
    func exists(forKey key: String) -> Bool {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key,
            kSecReturnData as String: false
        ]

        let status = SecItemCopyMatching(query as CFDictionary, nil)
        return status == errSecSuccess
    }

    /// Delete all values from keychain for this service
    @discardableResult
    func deleteAll() -> Bool {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service
        ]

        let status = SecItemDelete(query as CFDictionary)
        return status == errSecSuccess || status == errSecItemNotFound
    }

    // MARK: - Access Token

    func saveAccessToken(_ token: String) {
        save(token, forKey: Keys.accessToken)
    }

    func getAccessToken() async -> String? {
        load(forKey: Keys.accessToken)
    }

    /// Synchronous version for non-async contexts
    func getAccessTokenSync() -> String? {
        load(forKey: Keys.accessToken)
    }

    func deleteAccessToken() {
        delete(forKey: Keys.accessToken)
    }

    // MARK: - Refresh Token

    func saveRefreshToken(_ token: String) {
        save(token, forKey: Keys.refreshToken)
    }

    func getRefreshToken() -> String? {
        load(forKey: Keys.refreshToken)
    }

    func deleteRefreshToken() {
        delete(forKey: Keys.refreshToken)
    }

    // MARK: - Token Expiration

    func saveTokenExpiration(_ date: Date) {
        save("\(date.timeIntervalSince1970)", forKey: Keys.tokenExpiration)
    }

    func getTokenExpiration() -> Date? {
        guard let string = load(forKey: Keys.tokenExpiration),
              let timestamp = Double(string) else {
            return nil
        }
        return Date(timeIntervalSince1970: timestamp)
    }

    func deleteTokenExpiration() {
        delete(forKey: Keys.tokenExpiration)
    }

    // MARK: - User Data

    func saveUserData(_ userData: String) {
        save(userData, forKey: Keys.userData)
    }

    func getUserData() -> String? {
        load(forKey: Keys.userData)
    }

    func deleteUserData() {
        delete(forKey: Keys.userData)
    }

    // MARK: - Temporary Tokens (for 2FA)

    func saveTemporaryTokens(accessToken: String, refreshToken: String) {
        save(accessToken, forKey: Keys.tempAccessToken)
        save(refreshToken, forKey: Keys.tempRefreshToken)
    }

    func getTemporaryTokens() -> (accessToken: String, refreshToken: String)? {
        guard let accessToken = load(forKey: Keys.tempAccessToken),
              let refreshToken = load(forKey: Keys.tempRefreshToken) else {
            return nil
        }
        return (accessToken, refreshToken)
    }

    func clearTemporaryTokens() {
        delete(forKey: Keys.tempAccessToken)
        delete(forKey: Keys.tempRefreshToken)
    }

    // MARK: - All Tokens

    func deleteAllTokens() {
        deleteAccessToken()
        deleteRefreshToken()
        deleteTokenExpiration()
        deleteUserData()
        clearTemporaryTokens()
    }

    // MARK: - Biometric Protected Storage

    /// Save data with biometric protection
    func saveBiometricProtected(key: String, value: String) throws {
        guard let data = value.data(using: .utf8) else {
            throw KeychainError.encodingFailed
        }

        // Create access control with biometric requirement
        var error: Unmanaged<CFError>?
        guard let access = SecAccessControlCreateWithFlags(
            nil,
            kSecAttrAccessibleWhenPasscodeSetThisDeviceOnly,
            .biometryCurrentSet,
            &error
        ) else {
            throw KeychainError.accessControlCreationFailed
        }

        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key,
            kSecValueData as String: data,
            kSecAttrAccessControl as String: access
        ]

        // Delete existing item
        SecItemDelete(query as CFDictionary)

        // Add new item
        let status = SecItemAdd(query as CFDictionary, nil)

        if status != errSecSuccess {
            throw KeychainError.saveFailed(status)
        }
    }

    /// Get biometric protected data
    func getBiometricProtected(key: String) async throws -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
            kSecUseOperationPrompt as String: "Authenticate to access your data"
        ]

        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)

        guard status == errSecSuccess else {
            if status == errSecItemNotFound {
                return nil
            }
            throw KeychainError.retrievalFailed(status)
        }

        guard let data = result as? Data,
              let value = String(data: data, encoding: .utf8) else {
            throw KeychainError.decodingFailed
        }

        return value
    }
}

// MARK: - Keychain Error

enum KeychainError: LocalizedError {
    case encodingFailed
    case decodingFailed
    case accessControlCreationFailed
    case saveFailed(OSStatus)
    case retrievalFailed(OSStatus)

    var errorDescription: String? {
        switch self {
        case .encodingFailed:
            return "Failed to encode data"
        case .decodingFailed:
            return "Failed to decode data"
        case .accessControlCreationFailed:
            return "Failed to create access control"
        case .saveFailed(let status):
            return "Failed to save to keychain: \(status)"
        case .retrievalFailed(let status):
            return "Failed to retrieve from keychain: \(status)"
        }
    }
}
