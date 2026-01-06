//
//  MockAuthService.swift
//  MeeshyTests
//
//  Mock Authentication Service for unit testing
//

import Foundation
import LocalAuthentication
@testable import Meeshy

final class MockAuthService {
    // MARK: - Configuration

    var shouldFailLogin = false
    var shouldRequire2FA = false
    var shouldFailBiometric = false
    var loginError: Error = AuthError.invalidCredentials
    var biometricError: Error = AuthError.biometricFailed("Test error")

    // MARK: - State

    var currentUser: User?
    var isAuthenticated = false
    var biometricTypeToReturn: BiometricType = .none

    // MARK: - Call Tracking

    var loginCallCount = 0
    var logoutCallCount = 0
    var verify2FACallCount = 0
    var registerCallCount = 0
    var biometricAuthCallCount = 0
    var lastLoginEmail: String?
    var lastLoginPassword: String?
    var last2FACode: String?

    // MARK: - Authentication Methods

    func login(email: String, password: String) async throws -> User {
        loginCallCount += 1
        lastLoginEmail = email
        lastLoginPassword = password

        if shouldFailLogin {
            throw loginError
        }

        if shouldRequire2FA {
            throw AuthError.requires2FA
        }

        let user = MockDataGenerator.createUser()
        currentUser = user
        isAuthenticated = true

        return user
    }

    func verify2FA(code: String) async throws -> User {
        verify2FACallCount += 1
        last2FACode = code

        if shouldFailLogin {
            throw loginError
        }

        let user = MockDataGenerator.createUser()
        currentUser = user
        isAuthenticated = true

        return user
    }

    func register(username: String, email: String, password: String, displayName: String?) async throws -> User {
        registerCallCount += 1

        if shouldFailLogin {
            throw loginError
        }

        let user = MockDataGenerator.createUser(email: email, username: username)
        currentUser = user
        isAuthenticated = true

        return user
    }

    func logout() async throws {
        logoutCallCount += 1
        currentUser = nil
        isAuthenticated = false
    }

    // MARK: - Biometric Methods

    func biometricAuthenticationAvailable() -> Bool {
        return biometricTypeToReturn != .none
    }

    func biometricType() -> BiometricType {
        return biometricTypeToReturn
    }

    func authenticateWithBiometrics() async throws -> Bool {
        biometricAuthCallCount += 1

        if shouldFailBiometric {
            throw biometricError
        }

        return true
    }

    func enableBiometricAuth() async throws {
        currentUser?.biometricEnabled = true
    }

    func disableBiometricAuth() async throws {
        currentUser?.biometricEnabled = false
    }

    // MARK: - 2FA Methods

    func enable2FA() async throws -> String {
        return "mock-qr-code-data"
    }

    // MARK: - Helper Methods

    func reset() {
        shouldFailLogin = false
        shouldRequire2FA = false
        shouldFailBiometric = false
        currentUser = nil
        isAuthenticated = false
        biometricTypeToReturn = .none
        loginCallCount = 0
        logoutCallCount = 0
        verify2FACallCount = 0
        registerCallCount = 0
        biometricAuthCallCount = 0
        lastLoginEmail = nil
        lastLoginPassword = nil
        last2FACode = nil
    }
}
