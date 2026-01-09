//
//  AuthenticationManager.swift
//  Meeshy
//
//  Complete authentication flow with token management
//

import Foundation
import Security
import os.log

#if canImport(UIKit)
import UIKit
#endif

final class AuthenticationManager: ObservableObject, @unchecked Sendable {

    // MARK: - Singleton

    static let shared = AuthenticationManager()

    // MARK: - Published Properties

    @MainActor @Published private(set) var isAuthenticated: Bool = false
    @MainActor @Published private(set) var currentUser: User?
    @MainActor @Published private(set) var isAnonymous: Bool = false
    @MainActor @Published private(set) var sessionToken: String?

    // MARK: - Properties

    private let keychain = KeychainService.shared
    private var refreshTokenTimer: Timer?
    private let lock = NSLock()

    /// Tracks if initialize() has been called
    @MainActor private(set) var isInitialized: Bool = false

    private var _accessToken: String?
    var accessToken: String? {
        get { lock.withLock { _accessToken } }
        set { lock.withLock { _accessToken = newValue } }
    }

    private var _refreshToken: String?
    private var refreshToken: String? {
        get { lock.withLock { _refreshToken } }
        set { lock.withLock { _refreshToken = newValue } }
    }

    private var _tokenExpirationDate: Date?
    private var tokenExpirationDate: Date? {
        get { lock.withLock { _tokenExpirationDate } }
        set { lock.withLock { _tokenExpirationDate = newValue } }
    }

    // Logger
    private let logger = authLogger

    // MARK: - Constants

    private struct Constants {
        static let accessTokenKey = "me.meeshy.accessToken"
        static let refreshTokenKey = "me.meeshy.refreshToken"
        static let tokenExpirationKey = "me.meeshy.tokenExpiration"
        static let userDataKey = "me.meeshy.userData"
        static let refreshBufferTime: TimeInterval = 300 // Refresh 5 minutes before expiration
    }

    // MARK: - Initialization

    private init() {
        // Intentionally empty - call initialize() to load credentials
        // This ensures the singleton can be created without blocking
    }

    /// Initialize authentication state by loading stored credentials
    /// Call this during app startup (e.g., in SplashScreen)
    /// This method is safe to call multiple times - it only runs once
    @MainActor
    func initialize() async {
        guard !isInitialized else {
            logger.info("🔐 [Auth] Already initialized, skipping")
            return
        }

        logger.info("🔐 [Auth] Starting async initialization...")

        // Load credentials on background thread to avoid blocking UI
        await withCheckedContinuation { continuation in
            DispatchQueue.global(qos: .userInitiated).async { [weak self] in
                self?.loadStoredCredentialsSync()
                continuation.resume()
            }
        }

        isInitialized = true
        logger.info("🔐 [Auth] Initialization complete")
    }

    /// Quick check if user has stored credentials (without full initialization)
    /// Use this for immediate UI decisions before full init
    func hasStoredCredentials() -> Bool {
        return keychain.getAccessTokenSync() != nil
    }

    // MARK: - Public Methods

    /// Login with username and password
    func login(username: String, password: String) async throws -> User {
        #if canImport(UIKit)
        let deviceId = await MainActor.run { UIDevice.current.identifierForVendor?.uuidString }
        let deviceName = await MainActor.run { UIDevice.current.name }
        #else
        let deviceId: String? = nil
        let deviceName: String? = nil
        #endif

        let request = LoginRequest(
            username: username,
            password: password,
            deviceId: deviceId,
            deviceName: deviceName
        )

        logger.info("🔐 Attempting login for user: \(username)")

        let response: APIResponse<AuthResponse> = try await APIClient.shared
            .request(AuthEndpoints.login(request))

        logger.info("📥 Login response received")
        // SECURITY: Never log response data - may contain tokens
        
        guard let authData = response.data else {
            logger.error("❌ No auth data in response")
            throw MeeshyError.auth(.tokenInvalid)
        }

        logger.info("✅ Auth data parsed successfully")
        handleAuthResponse(authData)
        return authData.user
    }

    /// Register new account
    func register(
        username: String,
        email: String,
        password: String,
        firstName: String? = nil,
        lastName: String? = nil,
        phoneNumber: String? = nil,
        phoneCountryCode: String? = nil,
        displayName: String? = nil,
        primaryLanguage: String = "fr",
        secondaryLanguage: String = "fr"
    ) async throws -> User {
        #if os(iOS)
        let deviceId = await MainActor.run { UIDevice.current.identifierForVendor?.uuidString }
        let deviceName = await MainActor.run { UIDevice.current.name }
        #else
        let deviceId: String? = nil
        let deviceName: String? = nil
        #endif

        // Use provided names or extract from displayName
        let resolvedFirstName = firstName ?? displayName?.components(separatedBy: " ").first ?? username
        let resolvedLastName = lastName ?? displayName?.components(separatedBy: " ").dropFirst().joined(separator: " ") ?? ""

        let request = RegisterRequest(
            username: username,
            password: password,
            firstName: resolvedFirstName,
            lastName: resolvedLastName,
            email: email,
            phoneNumber: phoneNumber,
            phoneCountryCode: phoneCountryCode,
            systemLanguage: primaryLanguage,
            regionalLanguage: secondaryLanguage,
            displayName: displayName,
            deviceId: deviceId,
            deviceName: deviceName
        )

        let response: APIResponse<AuthResponse> = try await APIClient.shared
            .request(AuthEndpoints.register(request))

        guard let authData = response.data else {
            throw MeeshyError.auth(.tokenInvalid)
        }

        handleAuthResponse(authData)
        return authData.user
    }

    /// Refresh access token
    func refreshAccessToken() async throws {
        guard let refreshToken = self.refreshToken else {
            logger.error("❌ No refresh token available")
            throw MeeshyError.auth(.tokenInvalid)
        }

        logger.info("🔄 Attempting to refresh access token...")

        let request = RefreshTokenRequest(refreshToken: refreshToken)

        do {
            let response: APIResponse<AuthResponse> = try await APIClient.shared
                .request(AuthEndpoints.refreshToken(request))

            guard let authData = response.data else {
                logger.error("❌ Refresh response has no data")
                throw MeeshyError.auth(.tokenInvalid)
            }

            logger.info("✅ Token refresh successful")
            handleAuthResponse(authData)
        } catch let error as MeeshyError {
            logger.error("❌ Token refresh failed with MeeshyError: \(error.localizedDescription)")
            // Clear credentials on auth errors to force re-login
            if case .auth = error {
                clearCredentials()
            }
            throw error
        } catch {
            logger.error("❌ Token refresh failed: \(error.localizedDescription)")
            throw error
        }
    }

    /// Logout current user
    func logout() async throws {
        #if canImport(UIKit)
        let deviceId = await MainActor.run { UIDevice.current.identifierForVendor?.uuidString }
        #else
        let deviceId: String? = nil
        #endif
        let request = LogoutRequest(deviceId: deviceId)

        do {
            let _: APIResponse<EmptyResponse> = try await APIClient.shared
                .request(AuthEndpoints.logout(request))
            clearCredentials()
        } catch {
            // Clear credentials even if logout fails
            clearCredentials()
            throw error
        }
    }

    /// Setup Two-Factor Authentication
    func setup2FA() async throws -> TwoFactorSetupResponse {
        let response: APIResponse<TwoFactorSetupResponse> = try await APIClient.shared
            .request(AuthEndpoints.setup2FA)

        guard let data = response.data else {
            throw MeeshyError.auth(.tokenInvalid)
        }

        return data
    }

    /// Verify Two-Factor Authentication code
    func verify2FA(code: String) async throws -> User {
        let userId = await MainActor.run { self.currentUser?.id }
        guard let userId = userId else {
            throw MeeshyError.auth(.unauthorized)
        }

        let request = TwoFactorVerifyRequest(code: code, userId: userId)

        let response: APIResponse<AuthResponse> = try await APIClient.shared
            .request(AuthEndpoints.verify2FA(request))

        guard let authData = response.data else {
            throw MeeshyError.auth(.tokenInvalid)
        }

        handleAuthResponse(authData)
        return authData.user
    }

    /// Login anonymously via share link
    func loginAnonymous(linkId: String, firstName: String, lastName: String, language: String = "fr") async throws {
        #if canImport(UIKit)
        let deviceId = await MainActor.run { UIDevice.current.identifierForVendor?.uuidString ?? UUID().uuidString }
        #else
        let deviceId = UUID().uuidString
        #endif

        let request = JoinAnonymousRequest(
            firstName: firstName,
            lastName: lastName,
            username: nil,
            email: nil,
            language: language,
            deviceFingerprint: deviceId
        )

        let response: APIResponse<AnonymousJoinResponse> = try await APIClient.shared
            .request(AuthEndpoints.joinAnonymous(linkId: linkId, request: request))

        guard let data = response.data else {
            throw MeeshyError.network(.invalidResponse)
        }

        // Create a User from AnonymousParticipant
        let anonymousUser = User(
            id: data.participant.id,
            username: data.participant.username,
            firstName: data.participant.firstName,
            lastName: data.participant.lastName,
            bio: "",
            email: data.participant.email ?? "",
            phoneNumber: nil,
            displayName: nil,
            avatar: nil,
            isOnline: true,
            lastActiveAt: Date(),
            systemLanguage: data.participant.language,
            regionalLanguage: data.participant.language,
            customDestinationLanguage: nil,
            autoTranslateEnabled: true,
            translateToSystemLanguage: true,
            translateToRegionalLanguage: false,
            useCustomDestination: false,
            role: .user,
            isActive: true,
            deactivatedAt: nil,
            emailVerifiedAt: nil,
            phoneVerifiedAt: nil,
            twoFactorEnabledAt: nil,
            twoFactorSecret: nil,
            failedLoginAttempts: 0,
            lockedUntil: nil,
            lockedReason: nil,
            lastPasswordChange: Date(),
            passwordResetAttempts: 0,
            lastPasswordResetAttempt: nil,
            lastLoginIp: nil,
            lastLoginLocation: nil,
            lastLoginDevice: nil,
            deletedAt: nil,
            deletedBy: nil,
            profileCompletionRate: nil,
            isAnonymous: true,
            isMeeshyer: false,
            permissions: nil,
            createdAt: data.participant.joinedAt,
            updatedAt: data.participant.joinedAt
        )

        // Store session token
        self.accessToken = data.sessionToken

        // Update state on MainActor
        await MainActor.run {
            self.currentUser = anonymousUser
            self.sessionToken = data.sessionToken
            self.isAuthenticated = true
            self.isAnonymous = true
        }

        logger.info("✅ Anonymous login successful for: \(firstName) \(lastName)")

        // Connect to WebSocket asynchronously
        Task {
            await WebSocketService.shared.connect()
        }
    }

    /// Update the current user
    @MainActor
    func updateCurrentUser(_ user: User) {
        self.currentUser = user

        // Persist updated user data
        if let userData = try? JSONEncoder().encode(user) {
            keychain.saveUserData(String(data: userData, encoding: .utf8) ?? "")
        }

        logger.info("✅ Current user updated: \(user.username)")
    }

    /// Handle 401 Unauthorized responses
    func handleUnauthorized() {
        // Try to refresh token
        Task {
            do {
                try await refreshAccessToken()
            } catch {
                // Refresh failed, clear credentials and redirect to login
                clearCredentials()
                await MainActor.run {
                    NotificationCenter.default.post(name: .authenticationRequired, object: nil)
                }
            }
        }
    }

    /// Check if token needs refresh
    func shouldRefreshToken() -> Bool {
        guard let expirationDate = tokenExpirationDate else {
            return false
        }

        let now = Date()
        let bufferDate = expirationDate.addingTimeInterval(-Constants.refreshBufferTime)

        return now >= bufferDate
    }

    // MARK: - Private Methods

    private func handleAuthResponse(_ response: AuthResponse) {
        // Store tokens in memory
        self.accessToken = response.token
        self.refreshToken = response.refreshToken ?? response.token // Use token as refresh token if not provided

        // Log token storage (without exposing token)
        logger.info("🔐 Storing access token successfully")
        logger.info("📅 Token expires in: \(response.expiresIn ?? 3600) seconds")

        // Calculate expiration date (default to 1 hour if not provided)
        let expiresIn = response.expiresIn ?? 3600
        self.tokenExpirationDate = Date().addingTimeInterval(TimeInterval(expiresIn))

        // Store in unified KeychainService
        keychain.saveAccessToken(response.token)
        if let refreshToken = response.refreshToken {
            keychain.saveRefreshToken(refreshToken)
        } else {
            keychain.saveRefreshToken(response.token)
        }

        if let expirationDate = tokenExpirationDate {
            keychain.saveTokenExpiration(expirationDate)
        }

        // Store user data
        if let userData = try? JSONEncoder().encode(response.user) {
            keychain.saveUserData(String(data: userData, encoding: .utf8) ?? "")
        }

        logger.info("✅ Tokens and user data stored successfully")

        // Update state on MainActor
        Task { @MainActor in
            self.currentUser = response.user
            self.isAuthenticated = true

            logger.info("✅ Authentication state updated - user: \(response.user.username)")

            // Post notification
            NotificationCenter.default.post(name: .authenticationSucceeded, object: response.user)

            // Connect to WebSocket after successful authentication (non-blocking)
            logger.info("🔌 Connecting to WebSocket after authentication...")
            Task.detached {
                await WebSocketService.shared.connect()
            }
        }

        // Schedule token refresh
        scheduleTokenRefresh()
    }

    /// Synchronous credential loading - runs on background thread
    /// Called from initialize() via DispatchQueue.global
    private func loadStoredCredentialsSync() {
        logger.info("🔐 [Auth] loadStoredCredentialsSync() called")

        // Load tokens from unified KeychainService
        guard let accessToken = keychain.getAccessTokenSync(),
              let refreshToken = keychain.getRefreshToken(),
              let expirationDate = keychain.getTokenExpiration() else {
            logger.info("🔐 [Auth] No stored credentials found")
            return
        }

        logger.info("🔐 [Auth] Found stored credentials")

        self.accessToken = accessToken
        self.refreshToken = refreshToken
        self.tokenExpirationDate = expirationDate

        // Load user data
        var loadedUser: User?
        if let userDataString = keychain.getUserData(),
           let userData = userDataString.data(using: .utf8),
           let user = try? JSONDecoder().decode(User.self, from: userData) {
            loadedUser = user
        }

        // Check if token is still valid
        let isValid = Date() < expirationDate

        // Update UI state on MainActor
        Task { @MainActor [weak self] in
            guard let self = self else { return }

            if let user = loadedUser {
                self.currentUser = user
            }

            if isValid {
                self.logger.info("🔐 [Auth] Token is valid until \(expirationDate)")
                self.isAuthenticated = true

                // Connect to WebSocket with stored credentials (non-blocking)
                self.logger.info("🔌 [Auth] Initiating WebSocket connection...")
                Task.detached {
                    await WebSocketService.shared.connect()
                }
            } else {
                self.logger.info("🔐 [Auth] Token expired at \(expirationDate)")
                // Token expired, try to refresh
                await self.handleExpiredToken()
            }
        }

        // Schedule token refresh if valid
        if isValid {
            scheduleTokenRefresh()
        }
    }

    /// Handle expired token - try to refresh or clear credentials
    @MainActor
    private func handleExpiredToken() async {
        do {
            logger.info("🔄 Token expired, attempting refresh...")
            try await refreshAccessToken()
            logger.info("✅ Token refreshed successfully")
        } catch {
            logger.error("❌ Token refresh failed: \(error.localizedDescription)")
            logger.info("🔐 Clearing credentials and redirecting to login...")
            clearCredentials()
            NotificationCenter.default.post(name: .authenticationRequired, object: nil)
        }
    }

    private func scheduleTokenRefresh() {
        guard let expirationDate = tokenExpirationDate else {
            return
        }

        // Schedule refresh 5 minutes before expiration
        let refreshDate = expirationDate.addingTimeInterval(-Constants.refreshBufferTime)
        let timeInterval = refreshDate.timeIntervalSinceNow

        if timeInterval > 0 {
            DispatchQueue.main.async { [weak self] in
                // Cancel existing timer
                self?.refreshTokenTimer?.invalidate()
                
                self?.refreshTokenTimer = Timer.scheduledTimer(withTimeInterval: timeInterval, repeats: false) { [weak self] _ in
                    guard let self = self else { return }
                    Task {
                        try? await self.refreshAccessToken()
                    }
                }
            }
        }
    }

    private func clearCredentials() {
        // Clear in-memory state
        self.accessToken = nil
        self.refreshToken = nil
        self.tokenExpirationDate = nil

        Task { @MainActor in
            self.currentUser = nil
            self.isAuthenticated = false
            self.isAnonymous = false
            self.sessionToken = nil
            NotificationCenter.default.post(name: .authenticationFailed, object: nil)
        }

        // Clear all tokens from unified KeychainService
        keychain.deleteAllTokens()

        // Cancel timer
        DispatchQueue.main.async { [weak self] in
            self?.refreshTokenTimer?.invalidate()
            self?.refreshTokenTimer = nil
        }
    }
}

// MARK: - Notification Names

extension Notification.Name {
    static let authenticationSucceeded = Notification.Name("authenticationSucceeded")
    static let authenticationFailed = Notification.Name("authenticationFailed")
    static let authenticationRequired = Notification.Name("authenticationRequired")
}
