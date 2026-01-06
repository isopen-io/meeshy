//
//  MockKeychainService.swift
//  MeeshyTests
//
//  Mock Keychain Service for unit testing
//

import Foundation
@testable import Meeshy

final class MockKeychainService {
    // MARK: - Storage

    private var storage: [String: String] = [:]
    private var accessToken: String?
    private var refreshToken: String?
    private var temporaryAccessToken: String?
    private var temporaryRefreshToken: String?

    // MARK: - Configuration

    var shouldFail = false

    // MARK: - Call Tracking

    var saveAccessTokenCallCount = 0
    var saveRefreshTokenCallCount = 0
    var getAccessTokenCallCount = 0
    var getRefreshTokenCallCount = 0
    var deleteAllTokensCallCount = 0

    // MARK: - Token Methods

    func saveAccessToken(_ token: String) {
        saveAccessTokenCallCount += 1

        if !shouldFail {
            accessToken = token
        }
    }

    func saveRefreshToken(_ token: String) {
        saveRefreshTokenCallCount += 1

        if !shouldFail {
            refreshToken = token
        }
    }

    func getAccessToken() -> String? {
        getAccessTokenCallCount += 1
        return shouldFail ? nil : accessToken
    }

    func getRefreshToken() -> String? {
        getRefreshTokenCallCount += 1
        return shouldFail ? nil : refreshToken
    }

    func deleteAccessToken() {
        accessToken = nil
    }

    func deleteRefreshToken() {
        refreshToken = nil
    }

    func deleteAllTokens() {
        deleteAllTokensCallCount += 1
        accessToken = nil
        refreshToken = nil
        temporaryAccessToken = nil
        temporaryRefreshToken = nil
    }

    // MARK: - Temporary Tokens (2FA)

    func saveTemporaryTokens(accessToken: String, refreshToken: String) {
        if !shouldFail {
            temporaryAccessToken = accessToken
            temporaryRefreshToken = refreshToken
        }
    }

    func getTemporaryTokens() -> (accessToken: String, refreshToken: String)? {
        if shouldFail {
            return nil
        }

        guard let access = temporaryAccessToken,
              let refresh = temporaryRefreshToken else {
            return nil
        }

        return (access, refresh)
    }

    func clearTemporaryTokens() {
        temporaryAccessToken = nil
        temporaryRefreshToken = nil
    }

    // MARK: - Generic Storage

    func save(_ value: String, forKey key: String) {
        if !shouldFail {
            storage[key] = value
        }
    }

    func get(forKey key: String) -> String? {
        return shouldFail ? nil : storage[key]
    }

    func delete(forKey key: String) {
        storage.removeValue(forKey: key)
    }

    // MARK: - Biometric Protected Storage

    func saveBiometricProtected(key: String, value: Data) throws {
        if shouldFail {
            throw NSError(domain: "KeychainError", code: -1, userInfo: nil)
        }
        storage[key] = value.base64EncodedString()
    }

    func getBiometricProtected(key: String) throws -> Data? {
        if shouldFail {
            throw NSError(domain: "KeychainError", code: -1, userInfo: nil)
        }
        guard let stringValue = storage[key] else {
            return nil
        }
        return Data(base64Encoded: stringValue)
    }

    // MARK: - Reset

    func reset() {
        storage.removeAll()
        accessToken = nil
        refreshToken = nil
        temporaryAccessToken = nil
        temporaryRefreshToken = nil
        shouldFail = false
        saveAccessTokenCallCount = 0
        saveRefreshTokenCallCount = 0
        getAccessTokenCallCount = 0
        getRefreshTokenCallCount = 0
        deleteAllTokensCallCount = 0
    }
}
