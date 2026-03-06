import Foundation
import MeeshySDK
import XCTest

@MainActor
final class MockAuthManager: AuthManaging {

    // MARK: - State

    var isAuthenticated: Bool = false
    var currentUser: MeeshyUser?
    var isLoading: Bool = false
    var errorMessage: String?
    var savedAccounts: [SavedAccount] = []
    var authToken: String?

    // MARK: - Call Tracking

    var loginCallCount = 0
    var loginCredentials: [(username: String, password: String)] = []
    var registerCallCount = 0
    var registerRequests: [RegisterRequest] = []
    var requestMagicLinkCallCount = 0
    var requestMagicLinkEmails: [String] = []
    var validateMagicLinkCallCount = 0
    var validateMagicLinkTokens: [String] = []
    var requestPasswordResetCallCount = 0
    var requestPasswordResetEmails: [String] = []
    var logoutCallCount = 0
    var checkExistingSessionCallCount = 0
    var handleUnauthorizedCallCount = 0

    // MARK: - Stubbed Results

    var magicLinkResult: Bool = true
    var passwordResetResult: Bool = true
    var loginError: String?
    var registerError: String?

    // MARK: - Protocol Methods

    func login(username: String, password: String) async {
        loginCallCount += 1
        loginCredentials.append((username, password))
        if let error = loginError {
            errorMessage = error
        }
    }

    func register(request: RegisterRequest) async {
        registerCallCount += 1
        registerRequests.append(request)
        if let error = registerError {
            errorMessage = error
        }
    }

    func requestMagicLink(email: String) async -> Bool {
        requestMagicLinkCallCount += 1
        requestMagicLinkEmails.append(email)
        return magicLinkResult
    }

    func validateMagicLink(token: String) async {
        validateMagicLinkCallCount += 1
        validateMagicLinkTokens.append(token)
    }

    func requestPasswordReset(email: String) async -> Bool {
        requestPasswordResetCallCount += 1
        requestPasswordResetEmails.append(email)
        return passwordResetResult
    }

    func logout() {
        logoutCallCount += 1
        isAuthenticated = false
        currentUser = nil
        authToken = nil
    }

    func checkExistingSession() async {
        checkExistingSessionCallCount += 1
    }

    func handleUnauthorized() {
        handleUnauthorizedCallCount += 1
        isAuthenticated = false
        currentUser = nil
        authToken = nil
    }

    // MARK: - Test Helpers

    func simulateLoggedIn(user: MeeshyUser, token: String = "mock-token") {
        isAuthenticated = true
        currentUser = user
        authToken = token
    }

    // MARK: - Reset

    func reset() {
        isAuthenticated = false
        currentUser = nil
        isLoading = false
        errorMessage = nil
        savedAccounts = []
        authToken = nil
        loginCallCount = 0
        loginCredentials.removeAll()
        registerCallCount = 0
        registerRequests.removeAll()
        requestMagicLinkCallCount = 0
        requestMagicLinkEmails.removeAll()
        validateMagicLinkCallCount = 0
        validateMagicLinkTokens.removeAll()
        requestPasswordResetCallCount = 0
        requestPasswordResetEmails.removeAll()
        logoutCallCount = 0
        checkExistingSessionCallCount = 0
        handleUnauthorizedCallCount = 0
        magicLinkResult = true
        passwordResetResult = true
        loginError = nil
        registerError = nil
    }
}
