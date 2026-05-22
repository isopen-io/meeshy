import Combine
import Foundation
import MeeshySDK
import XCTest

final class MockAuthManager: AuthManaging {

    // MARK: - State

    var isAuthenticated: Bool = false
    var currentUser: MeeshyUser? {
        didSet { currentUserSubject.send(currentUser) }
    }

    private let currentUserSubject = CurrentValueSubject<MeeshyUser?, Never>(nil)
    var currentUserPublisher: AnyPublisher<MeeshyUser?, Never> {
        currentUserSubject.eraseToAnyPublisher()
    }
    var isLoading: Bool = false
    var errorMessage: String?
    var savedAccounts: [SavedAccount] = []
    var authToken: String?
    var requires2FA: Bool = false
    var twoFactorToken: String?

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
    var removeSavedAccountCallCount = 0
    var lastRemovedSavedAccountUserId: String?
    var completeLoginWith2FACallCount = 0
    var completeLoginWith2FACodes: [String] = []
    var refreshSessionCallCount = 0
    var refreshSessionForceParams: [Bool] = []

    // MARK: - Stubbed Results

    var magicLinkResult: Bool = true
    var passwordResetResult: Bool = true
    var loginError: String?
    var registerError: String?
    var refreshSessionResult: String = "mock-fresh-token"
    var refreshSessionError: Error?

    // MARK: - Protocol Methods

    func completeLoginWith2FA(code: String) async {
        completeLoginWith2FACallCount += 1
        completeLoginWith2FACodes.append(code)
    }

    func refreshSession(force: Bool) async throws -> String {
        refreshSessionCallCount += 1
        refreshSessionForceParams.append(force)
        if let error = refreshSessionError {
            throw error
        }
        return refreshSessionResult
    }

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

    func removeSavedAccount(userId: String) {
        removeSavedAccountCallCount += 1
        lastRemovedSavedAccountUserId = userId
        savedAccounts.removeAll { $0.id == userId }
    }

    // MARK: - Profile Mutation tracking (Phase 4 follow-up)

    var appliedProfileChanges: [(displayName: String?, bio: String?, avatarUrl: String?)] = []
    var restoredSnapshots: [ProfileSnapshot] = []
    /// Optional override — when set, `applyLocalProfileChanges` returns this
    /// snapshot instead of computing one from `currentUser`. Useful for
    /// rollback symmetry tests.
    var applyLocalProfileChangesReturn: ProfileSnapshot?

    @discardableResult
    func applyLocalProfileChanges(
        displayName: String?,
        bio: String?,
        avatarUrl: String?
    ) -> ProfileSnapshot {
        appliedProfileChanges.append((displayName, bio, avatarUrl))
        let snapshot = applyLocalProfileChangesReturn ?? ProfileSnapshot(
            displayName: currentUser?.displayName,
            bio: currentUser?.bio,
            avatarUrl: currentUser?.avatar
        )
        if let user = currentUser {
            currentUser = user.withProfileChanges(
                displayName: displayName, bio: bio, avatar: avatarUrl
            )
        }
        return snapshot
    }

    func restoreLocalProfileSnapshot(_ snapshot: ProfileSnapshot) {
        restoredSnapshots.append(snapshot)
        if let user = currentUser {
            currentUser = user.withProfileChanges(
                displayName: snapshot.displayName,
                bio: snapshot.bio,
                avatar: snapshot.avatarUrl
            )
        }
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
        requires2FA = false
        twoFactorToken = nil
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
        removeSavedAccountCallCount = 0
        lastRemovedSavedAccountUserId = nil
        completeLoginWith2FACallCount = 0
        completeLoginWith2FACodes.removeAll()
        refreshSessionCallCount = 0
        refreshSessionForceParams.removeAll()
        refreshSessionResult = "mock-fresh-token"
        refreshSessionError = nil
        magicLinkResult = true
        passwordResetResult = true
        loginError = nil
        registerError = nil
        appliedProfileChanges.removeAll()
        restoredSnapshots.removeAll()
        applyLocalProfileChangesReturn = nil
    }
}
