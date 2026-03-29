import Foundation

// MARK: - Models

public struct TwoFactorStatus: Codable, Sendable {
    public let enabled: Bool
    public let enabledAt: String?
    public let hasBackupCodes: Bool?
    public let backupCodesCount: Int?

    public init(enabled: Bool, enabledAt: String? = nil, hasBackupCodes: Bool? = nil, backupCodesCount: Int? = nil) {
        self.enabled = enabled
        self.enabledAt = enabledAt
        self.hasBackupCodes = hasBackupCodes
        self.backupCodesCount = backupCodesCount
    }
}

public struct TwoFactorSetup: Codable, Sendable {
    public let secret: String
    public let qrCodeDataUrl: String
    public let otpauthUrl: String

    public init(secret: String, qrCodeDataUrl: String, otpauthUrl: String) {
        self.secret = secret
        self.qrCodeDataUrl = qrCodeDataUrl
        self.otpauthUrl = otpauthUrl
    }
}

public struct TwoFactorBackupCodes: Codable, Sendable {
    public let backupCodes: [String]

    public init(backupCodes: [String]) {
        self.backupCodes = backupCodes
    }
}

private struct TwoFactorCodeRequest: Encodable {
    let code: String
}

// MARK: - Protocol

public protocol TwoFactorServiceProviding: Sendable {
    func getStatus() async throws -> TwoFactorStatus
    func setup() async throws -> TwoFactorSetup
    func enable(code: String) async throws -> TwoFactorBackupCodes
    func disable(code: String, password: String) async throws
    func verify(code: String) async throws
    func getBackupCodes(code: String) async throws -> TwoFactorBackupCodes
}

// MARK: - Implementation

public final class TwoFactorService: TwoFactorServiceProviding, @unchecked Sendable {
    public static let shared = TwoFactorService()
    private let api: APIClientProviding

    init(api: APIClientProviding = APIClient.shared) {
        self.api = api
    }

    public func getStatus() async throws -> TwoFactorStatus {
        let response: APIResponse<TwoFactorStatus> = try await api.request(
            endpoint: "/auth/2fa/status"
        )
        return response.data
    }

    public func setup() async throws -> TwoFactorSetup {
        let response: APIResponse<TwoFactorSetup> = try await api.post(
            endpoint: "/auth/2fa/setup",
            body: [String: String]()
        )
        return response.data
    }

    public func enable(code: String) async throws -> TwoFactorBackupCodes {
        let response: APIResponse<TwoFactorBackupCodes> = try await api.post(
            endpoint: "/auth/2fa/enable",
            body: TwoFactorCodeRequest(code: code)
        )
        return response.data
    }

    public func disable(code: String, password: String) async throws {
        let _: APIResponse<[String: Bool]> = try await api.post(
            endpoint: "/auth/2fa/disable",
            body: ["code": code, "password": password]
        )
    }

    public func verify(code: String) async throws {
        let _: APIResponse<[String: Bool]> = try await api.post(
            endpoint: "/auth/2fa/verify",
            body: TwoFactorCodeRequest(code: code)
        )
    }

    public func getBackupCodes(code: String) async throws -> TwoFactorBackupCodes {
        let response: APIResponse<TwoFactorBackupCodes> = try await api.post(
            endpoint: "/auth/2fa/backup-codes",
            body: TwoFactorCodeRequest(code: code)
        )
        return response.data
    }
}
