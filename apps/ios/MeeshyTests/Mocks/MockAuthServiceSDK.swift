import Foundation
import MeeshySDK
import XCTest

@MainActor
final class MockAuthServiceSDK: AuthServiceProviding, @unchecked Sendable {
    nonisolated init() {}

    // MARK: - Stubbing

    var loginResult: Result<LoginResponseData, Error> = .failure(NSError(domain: "test", code: 0))
    var registerResult: Result<LoginResponseData, Error> = .failure(NSError(domain: "test", code: 0))
    var verifyEmailResult: Result<Void, Error> = .success(())
    var verifyEmailWithCodeResult: Result<Void, Error> = .success(())
    var resendVerificationEmailResult: Result<Void, Error> = .success(())
    var requestPasswordResetResult: Result<Void, Error> = .success(())
    var resetPasswordResult: Result<Void, Error> = .success(())
    var sendPhoneCodeResult: Result<Void, Error> = .success(())
    var verifyPhoneResult: Result<VerifyPhoneResponse, Error> = .failure(NSError(domain: "test", code: 0))
    var checkAvailabilityResult: Result<AvailabilityResponse, Error> = .failure(NSError(domain: "test", code: 0))
    var requestMagicLinkResult: Result<Int, Error> = .success(60)
    var validateMagicLinkResult: Result<LoginResponseData, Error> = .failure(NSError(domain: "test", code: 0))
    var refreshTokenResult: Result<LoginResponseData, Error> = .failure(NSError(domain: "test", code: 0))
    var meResult: Result<MeeshyUser, Error> = .failure(NSError(domain: "test", code: 0))

    // MARK: - Call Tracking

    var loginCallCount = 0
    var registerCallCount = 0
    var verifyEmailCallCount = 0
    var verifyEmailWithCodeCallCount = 0
    var lastVerifyEmailCode: String?
    var lastVerifyEmailEmail: String?
    var resendVerificationEmailCallCount = 0
    var lastResendEmail: String?
    var requestPasswordResetCallCount = 0
    var resetPasswordCallCount = 0
    var sendPhoneCodeCallCount = 0
    var verifyPhoneCallCount = 0
    var checkAvailabilityCallCount = 0
    var requestMagicLinkCallCount = 0
    var validateMagicLinkCallCount = 0
    var refreshTokenCallCount = 0
    var meCallCount = 0
    var logoutCallCount = 0

    // MARK: - Protocol Conformance

    nonisolated func login(username: String, password: String, rememberDevice: Bool) async throws -> LoginResponseData {
        await MainActor.run { loginCallCount += 1 }
        return try await MainActor.run { try loginResult.get() }
    }

    nonisolated func register(request: RegisterRequest) async throws -> LoginResponseData {
        await MainActor.run { registerCallCount += 1 }
        return try await MainActor.run { try registerResult.get() }
    }

    nonisolated func requestMagicLink(email: String, deviceFingerprint: String?) async throws -> Int {
        await MainActor.run { requestMagicLinkCallCount += 1 }
        return try await MainActor.run { try requestMagicLinkResult.get() }
    }

    nonisolated func validateMagicLink(token: String) async throws -> LoginResponseData {
        await MainActor.run { validateMagicLinkCallCount += 1 }
        return try await MainActor.run { try validateMagicLinkResult.get() }
    }

    nonisolated func requestPasswordReset(email: String) async throws {
        await MainActor.run { requestPasswordResetCallCount += 1 }
        try await MainActor.run { try requestPasswordResetResult.get() }
    }

    nonisolated func resetPassword(token: String, newPassword: String) async throws {
        await MainActor.run { resetPasswordCallCount += 1 }
        try await MainActor.run { try resetPasswordResult.get() }
    }

    nonisolated func sendPhoneCode(phoneNumber: String) async throws {
        await MainActor.run { sendPhoneCodeCallCount += 1 }
        try await MainActor.run { try sendPhoneCodeResult.get() }
    }

    nonisolated func verifyPhone(phoneNumber: String, code: String) async throws -> VerifyPhoneResponse {
        await MainActor.run { verifyPhoneCallCount += 1 }
        return try await MainActor.run { try verifyPhoneResult.get() }
    }

    nonisolated func verifyEmail(code: String) async throws {
        await MainActor.run { verifyEmailCallCount += 1 }
        try await MainActor.run { try verifyEmailResult.get() }
    }

    nonisolated func verifyEmailWithCode(code: String, email: String) async throws {
        await MainActor.run {
            verifyEmailWithCodeCallCount += 1
            lastVerifyEmailCode = code
            lastVerifyEmailEmail = email
        }
        try await MainActor.run { try verifyEmailWithCodeResult.get() }
    }

    nonisolated func resendVerificationEmail(email: String) async throws {
        await MainActor.run {
            resendVerificationEmailCallCount += 1
            lastResendEmail = email
        }
        try await MainActor.run { try resendVerificationEmailResult.get() }
    }

    nonisolated func checkAvailability(username: String?, email: String?, phone: String?) async throws -> AvailabilityResponse {
        await MainActor.run { checkAvailabilityCallCount += 1 }
        return try await MainActor.run { try checkAvailabilityResult.get() }
    }

    nonisolated func refreshToken(_ currentToken: String) async throws -> LoginResponseData {
        await MainActor.run { refreshTokenCallCount += 1 }
        return try await MainActor.run { try refreshTokenResult.get() }
    }

    nonisolated func me() async throws -> MeeshyUser {
        await MainActor.run { meCallCount += 1 }
        return try await MainActor.run { try meResult.get() }
    }

    nonisolated func logout() async {
        await MainActor.run { logoutCallCount += 1 }
    }

    // MARK: - Reset

    func reset() {
        loginCallCount = 0
        registerCallCount = 0
        verifyEmailCallCount = 0
        verifyEmailWithCodeCallCount = 0
        lastVerifyEmailCode = nil
        lastVerifyEmailEmail = nil
        resendVerificationEmailCallCount = 0
        lastResendEmail = nil
        requestPasswordResetCallCount = 0
        resetPasswordCallCount = 0
        sendPhoneCodeCallCount = 0
        verifyPhoneCallCount = 0
        checkAvailabilityCallCount = 0
        requestMagicLinkCallCount = 0
        validateMagicLinkCallCount = 0
        refreshTokenCallCount = 0
        meCallCount = 0
        logoutCallCount = 0
    }
}
