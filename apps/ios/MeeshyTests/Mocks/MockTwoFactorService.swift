import Foundation
import MeeshySDK

@MainActor
final class MockTwoFactorService: TwoFactorServiceProviding {
    nonisolated init() {}

    // MARK: - Stubbing

    var getStatusResult: Result<TwoFactorStatus, Error> = .success(
        TwoFactorStatus(enabled: false)
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

    func getStatus() async throws -> TwoFactorStatus {
        getStatusCallCount += 1
        return try getStatusResult.get()
    }

    func setup() async throws -> TwoFactorSetup {
        setupCallCount += 1
        return try setupResult.get()
    }

    func enable(code: String) async throws -> TwoFactorBackupCodes {
        enableCallCount += 1
        lastEnableCode = code
        return try enableResult.get()
    }

    func disable(code: String, password: String) async throws {
        disableCallCount += 1
        lastDisableCode = code
        lastDisablePassword = password
        try disableResult.get()
    }

    func verify(code: String) async throws {
        verifyCallCount += 1
        lastVerifyCode = code
        try verifyResult.get()
    }

    func getBackupCodes(code: String) async throws -> TwoFactorBackupCodes {
        getBackupCodesCallCount += 1
        lastGetBackupCodesCode = code
        return try getBackupCodesResult.get()
    }
}
