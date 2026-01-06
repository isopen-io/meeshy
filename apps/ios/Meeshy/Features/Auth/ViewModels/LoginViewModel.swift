//
//  LoginViewModel.swift
//  Meeshy
//
//  Enhanced view model for login flow with biometric support
//  Minimum iOS 16+
//

import SwiftUI
import Combine
import LocalAuthentication

@MainActor
final class LoginViewModel: ObservableObject {
    // MARK: - Published Properties

    @Published var identifier: String = ""
    @Published var password: String = ""
    @Published var isLoading: Bool = false
    @Published var isBiometricLoading: Bool = false
    @Published var errorMessage: String?
    @Published var identifierError: String?
    @Published var passwordError: String?
    @Published var showTwoFactorView: Bool = false
    @Published var biometricType: BiometricKind = .none
    @Published var loginSuccessful: Bool = false
    @Published var rememberMe: Bool = false

    /// Selected country for phone number login (used for country code prefix)
    @Published var selectedCountry: Country? = Country.defaultCountry

    // MARK: - Private Properties

    private let authManager = AuthenticationManager.shared
    private var cancellables = Set<AnyCancellable>()
    private let biometricContext = LAContext()

    // MARK: - Initialization

    init() {
        setupValidation()
        checkBiometricAvailability()
        loadRememberedCredentials()
    }

    // MARK: - Computed Properties

    var canLogin: Bool {
        !identifier.isEmpty &&
        !password.isEmpty &&
        identifierError == nil &&
        passwordError == nil &&
        !isLoading
    }

    /// Check if identifier appears to be a phone number (only digits)
    var isPhoneNumberIdentifier: Bool {
        let trimmed = identifier.trimmingCharacters(in: .whitespaces)
        // Check if all characters are digits (or starts with +)
        let digitsOnly = trimmed.filter { $0.isNumber }
        return !trimmed.isEmpty && (digitsOnly.count == trimmed.count || trimmed.hasPrefix("+"))
    }

    /// Get the formatted identifier for login (adds country code for phone numbers)
    var formattedIdentifier: String {
        let trimmed = identifier.trimmingCharacters(in: .whitespaces)

        // If it's a phone number without country code, add it
        if isPhoneNumberIdentifier && !trimmed.hasPrefix("+") {
            if let country = selectedCountry {
                return country.formatPhoneNumber(trimmed)
            }
        }

        return trimmed
    }

    /// Pre-fill identifier from redirect info
    func prefillFromRedirect(_ redirectInfo: RegistrationRedirectInfo) {
        identifier = redirectInfo.identifier
        // Set appropriate focus or show message
        errorMessage = nil
    }

    // MARK: - Public Methods

    /// Attempt login with identifier and password
    func login() async {
        guard validate() else { return }

        isLoading = true
        errorMessage = nil
        loginSuccessful = false

        do {
            // Use formattedIdentifier (auto-adds country code for phone numbers)
            _ = try await authManager.login(
                username: formattedIdentifier,
                password: password
            )

            // Save credentials if remember me is enabled
            if rememberMe {
                saveCredentials()
            }

            // Success haptic
            let generator = UINotificationFeedbackGenerator()
            generator.notificationOccurred(.success)

            loginSuccessful = true
            isLoading = false

            // Login successful - navigation handled by AuthenticationManager
            // No need for delay here, the system will handle navigation

        } catch let meeshyError as MeeshyError {
            isLoading = false
            // Handle MeeshyError cases
            if case .auth(.twoFactorRequired) = meeshyError {
                showTwoFactorView = true
            } else {
                handleError(meeshyError)
            }
        } catch {
            isLoading = false
            handleError(error)
        }
    }

    /// Attempt login with biometrics
    func loginWithBiometrics() async {
        isBiometricLoading = true
        errorMessage = nil

        // Check if we have stored credentials
        guard let storedCredentials = loadStoredCredentials() else {
            errorMessage = "No stored credentials. Please sign in with username and password first."
            isBiometricLoading = false
            return
        }

        // Authenticate with biometrics
        let context = LAContext()
        var error: NSError?

        // Check if biometric authentication is available
        guard context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &error) else {
            errorMessage = "Biometric authentication is not available"
            isBiometricLoading = false
            return
        }

        do {
            // Perform biometric authentication
            let reason = "Sign in to your Meeshy account"
            let success = try await context.evaluatePolicy(
                .deviceOwnerAuthenticationWithBiometrics,
                localizedReason: reason
            )

            if success {
                // Use stored credentials to login
                identifier = storedCredentials.identifier
                password = storedCredentials.password

                // Attempt login
                await login()
            }
        } catch let laError as LAError {
            handleBiometricError(laError)
        } catch {
            errorMessage = "Biometric authentication failed"
        }

        isBiometricLoading = false
    }

    /// Clear error messages
    func clearError() {
        errorMessage = nil
        identifierError = nil
        passwordError = nil
    }

    // MARK: - Private Methods

    private func setupValidation() {
        // Real-time identifier validation
        $identifier
            .debounce(for: 0.5, scheduler: DispatchQueue.main)
            .sink { [weak self] identifier in
                guard let self = self, !identifier.isEmpty else {
                    self?.identifierError = nil
                    return
                }
                // Basic validation: just ensure it's not empty and has valid format
                if identifier.count < 2 {
                    self.identifierError = "Please enter a valid username, email, or phone"
                } else {
                    self.identifierError = nil
                }
            }
            .store(in: &cancellables)

        // Real-time password validation - SECURITY: Minimum 8 characters required
        $password
            .debounce(for: 0.3, scheduler: DispatchQueue.main)
            .sink { [weak self] password in
                guard let self = self else { return }
                if !password.isEmpty && password.count < 8 {
                    self.passwordError = "Password must be at least 8 characters"
                } else {
                    self.passwordError = nil
                }
            }
            .store(in: &cancellables)
    }

    private func validate() -> Bool {
        var isValid = true

        // Clear previous errors
        identifierError = nil
        passwordError = nil
        errorMessage = nil

        // Identifier validation
        let trimmedIdentifier = identifier.trimmingCharacters(in: .whitespaces)
        if trimmedIdentifier.isEmpty {
            identifierError = "Username, email or phone is required"
            isValid = false
        } else if trimmedIdentifier.count < 2 {
            identifierError = "Please enter a valid identifier"
            isValid = false
        }

        // Password validation - SECURITY: Minimum 8 characters required
        if password.isEmpty {
            passwordError = "Password is required"
            isValid = false
        } else if password.count < 8 {
            passwordError = "Password must be at least 8 characters"
            isValid = false
        }

        // Shake animation on error
        if !isValid {
            let generator = UINotificationFeedbackGenerator()
            generator.notificationOccurred(.error)
        }

        return isValid
    }

    private func checkBiometricAvailability() {
        var error: NSError?

        // Check if biometric authentication is available
        if biometricContext.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &error) {
            switch biometricContext.biometryType {
            case .faceID:
                biometricType = .faceID
            case .touchID:
                biometricType = .touchID
            case .none:
                biometricType = .none
            @unknown default:
                // iOS 17+ Optic ID support
                if #available(iOS 17.0, *) {
                    // Check for Optic ID (Vision Pro)
                    biometricType = .opticID
                } else {
                    biometricType = .none
                }
            }
        } else {
            biometricType = .none
        }

        // Only show biometric option if we have stored credentials
        if biometricType != .none && loadStoredCredentials() == nil {
            biometricType = .none
        }
    }

    private func handleError(_ error: Error) {
        // Map error to user-friendly message
        if let meeshyError = error as? MeeshyError {
            switch meeshyError {
            case .auth(.invalidCredentials):
                errorMessage = "Invalid username or password. Please try again."
                passwordError = "Incorrect password"
            case .auth(.twoFactorRequired):
                showTwoFactorView = true
                return
            case .auth(.tokenExpired), .auth(.tokenInvalid):
                errorMessage = "Your session has expired. Please sign in again."
            case .auth(.unauthorized):
                errorMessage = "You are not authorized to access this account."
            case .network(.noConnection):
                errorMessage = "No internet connection. Please check your network."
            case .network(.timeout):
                errorMessage = "Request timed out. Please try again."
            case .validation(.custom(let message)):
                errorMessage = message
            default:
                errorMessage = "An error occurred. Please try again."
            }
        } else if let urlError = error as? URLError {
            switch urlError.code {
            case .notConnectedToInternet, .networkConnectionLost:
                errorMessage = "No internet connection. Please check your network."
            case .timedOut:
                errorMessage = "Request timed out. Please try again."
            default:
                errorMessage = "Network error. Please try again."
            }
        } else {
            // Check for common error patterns
            let errorString = error.localizedDescription.lowercased()
            if errorString.contains("locked") || errorString.contains("disabled") {
                errorMessage = "Account is locked. Please contact support or try again later."
            } else if errorString.contains("not found") {
                errorMessage = "Account not found. Please check your credentials."
                identifierError = "User not found"
            } else {
                errorMessage = "Sign in failed. Please try again."
            }
        }

        // Error notification haptic
        let generator = UINotificationFeedbackGenerator()
        generator.notificationOccurred(.error)
    }

    private func handleBiometricError(_ error: LAError) {
        switch error.code {
        case .authenticationFailed:
            errorMessage = "Biometric authentication failed. Please try again."
        case .userCancel:
            // User cancelled, no error message needed
            break
        case .userFallback:
            // User chose to enter password instead
            errorMessage = "Please enter your password to sign in."
        case .biometryNotAvailable:
            errorMessage = "Biometric authentication is not available on this device."
            biometricType = .none
        case .biometryNotEnrolled:
            errorMessage = "No biometric data is enrolled. Please set up \(biometricType.displayName) in Settings."
            biometricType = .none
        case .biometryLockout:
            errorMessage = "Biometric authentication is locked. Please try again later."
        default:
            errorMessage = "Biometric authentication error. Please try again."
        }

        if errorMessage != nil {
            let generator = UINotificationFeedbackGenerator()
            generator.notificationOccurred(.error)
        }
    }

    // MARK: - Secure Credential Storage (Token-based, no password storage)

    private struct BiometricCredentials: Codable {
        let identifier: String
        let biometricToken: String  // Server-issued token for biometric login
        let tokenExpiry: Date?
    }

    /// Save only the identifier for biometric login (password is NEVER stored)
    /// The actual authentication uses a biometric-specific token from the server
    private func saveCredentials() {
        // Only save if remember me is enabled and login was successful
        guard rememberMe && loginSuccessful else { return }

        // SECURITY: We only store the identifier, NOT the password
        // For biometric login, we'll use the existing access token
        // which is already securely stored in keychain by AuthenticationManager
        if let accessToken = AuthenticationManager.shared.accessToken {
            let credentials = BiometricCredentials(
                identifier: identifier,
                biometricToken: accessToken,  // Use current token as biometric token
                tokenExpiry: Date().addingTimeInterval(30 * 24 * 60 * 60) // 30 days
            )

            if let data = try? JSONEncoder().encode(credentials) {
                // Store in keychain with biometric protection
                KeychainService.shared.save(
                    String(data: data, encoding: .utf8) ?? "",
                    forKey: "meeshy.login.biometric"
                )

                // Enable biometric authentication for next login
                checkBiometricAvailability()
            }
        }
    }

    /// Load biometric credentials (identifier + token, NOT password)
    private func loadBiometricCredentials() -> BiometricCredentials? {
        guard let credentialsString = KeychainService.shared.load(forKey: "meeshy.login.biometric"),
              let data = credentialsString.data(using: .utf8),
              let credentials = try? JSONDecoder().decode(BiometricCredentials.self, from: data) else {
            return nil
        }

        // Check if token has expired
        if let expiry = credentials.tokenExpiry, expiry < Date() {
            // Token expired, clear credentials
            clearStoredCredentials()
            return nil
        }

        return credentials
    }

    /// Legacy: Load old format credentials (for migration)
    private struct LegacyStoredCredentials: Codable {
        let identifier: String
        let password: String
    }

    private func loadStoredCredentials() -> LegacyStoredCredentials? {
        // First try new biometric format
        if let biometric = loadBiometricCredentials() {
            // Return as legacy format for compatibility (token as "password")
            return LegacyStoredCredentials(identifier: biometric.identifier, password: biometric.biometricToken)
        }

        // Fallback to legacy format (and migrate if found)
        if let credentialsString = KeychainService.shared.load(forKey: "meeshy.login.credentials"),
           let data = credentialsString.data(using: .utf8),
           let credentials = try? JSONDecoder().decode(LegacyStoredCredentials.self, from: data) {
            // SECURITY: Delete legacy credentials that stored password
            KeychainService.shared.delete(forKey: "meeshy.login.credentials")
            return nil  // Don't return legacy credentials with password
        }

        return nil
    }

    private func loadRememberedCredentials() {
        // Check if we have stored credentials
        if let credentials = loadStoredCredentials() {
            // Don't auto-fill password for security, but indicate that biometric is available
            // User can use biometric to login
            rememberMe = true
        }
    }

    func clearStoredCredentials() {
        KeychainService.shared.delete(forKey: "meeshy.login.credentials")
        KeychainService.shared.delete(forKey: "meeshy.login.biometric")
        biometricType = .none
        rememberMe = false
    }
}