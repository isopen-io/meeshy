import Foundation
import MeeshySDK

@MainActor
final class MockTwoFactorService: TwoFactorServiceProviding {
    nonisolated init() {}

    // MARK: - Stubbing

    var getStatusResult: Result<TwoFactorStatus, Error> = .success(
        TwoFactorStatus(enabled: false, enabledAt: nil, hasBackupCodes: nil, backupCodesCount: nil)
    )
    var setupResult: Result<TwoFactorSetup, Error> = .success(
        TwoFactorSetup(secret: "JBSWY3DPEHPK3PXP", qrCodeDataUrl: "data:image/png;base64,ABC", otpauthUrl: "otpauth://totp/Meeshy:user?secret=JBSWY3DPEHPK3PXP")
    )
    var enableResult: Result<TwoFactorBackupCodes, Error> = .success(
        TwoFactorBackupCodes(backupCodes: ["CODE1", "CODE2", "CODE3", "CODE4"])
    )
    var disableResult: Result<Void, Error> = .success(())
    var verifyResult: Result<Void, Error> = .success(())
    var getBackupCodesResult: Result<TwoFactorBackupCodes, Error> = .success(
        TwoFactorBackupCodes(backupCodes: ["BACK1", "BACK2", "BACK3", "BACK4"])
    )

    // MARK: - Call Tracking

    var getStatusCallCount = 0
    var setupCallCount = 0
    var enableCallCount = 0
    var lastEnableCode: String?
    var disableCallCount = 0
    var lastDisableCode: String?
    var lastDisablePassword: String?
    var verifyCallCount = 0
    var lastVerifyCode: String?
    var getBackupCodesCallCount = 0
    var lastGetBackupCodesCode: String?

    // MARK: - Protocol Conformance

    nonisolated func getStatus() async throws -> TwoFactorStatus {
        await MainActor.run { getStatusCallCount += 1 }
        return try await MainActor.run { try getStatusResult.get() }
    }

    nonisolated func setup() async throws -> TwoFactorSetup {
        await MainActor.run { setupCallCount += 1 }
        return try await MainActor.run { try setupResult.get() }
    }

    nonisolated func enable(code: String) async throws -> TwoFactorBackupCodes {
        await MainActor.run {
            enableCallCount += 1
            lastEnableCode = code
        }
        return try await MainActor.run { try enableResult.get() }
    }

    nonisolated func disable(code: String, password: String) async throws {
        await MainActor.run {
            disableCallCount += 1
            lastDisableCode = code
            lastDisablePassword = password
        }
        try await MainActor.run { try disableResult.get() }
    }

    nonisolated func verify(code: String) async throws {
        await MainActor.run {
            verifyCallCount += 1
            lastVerifyCode = code
        }
        try await MainActor.run { try verifyResult.get() }
    }

    nonisolated func getBackupCodes(code: String) async throws -> TwoFactorBackupCodes {
        await MainActor.run {
            getBackupCodesCallCount += 1
            lastGetBackupCodesCode = code
        }
        return try await MainActor.run { try getBackupCodesResult.get() }
    }
}
