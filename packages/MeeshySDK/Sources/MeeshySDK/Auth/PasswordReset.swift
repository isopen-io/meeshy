import Foundation

// MARK: - Le contrat de la réinitialisation (#10866, #10867)

/// Le verdict de `POST /auth/reset-password/verify-token`, sans consommer le
/// jeton. `requires2FA` suit `twoFactorEnabledAt`, le même prédicat que l'envoi.
public struct ResetTokenVerification: Decodable, Equatable, Sendable {
    public let valid: Bool
    public let requires2FA: Bool

    public init(valid: Bool, requires2FA: Bool) {
        self.valid = valid
        self.requires2FA = requires2FA
    }

    private enum CodingKeys: String, CodingKey { case valid, requires2FA }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        valid = try container.decode(Bool.self, forKey: .valid)
        requires2FA = try container.decodeIfPresent(Bool.self, forKey: .requires2FA) ?? false
    }
}

struct ResetTokenVerificationRequest: Encodable {
    let token: String
}

public protocol PasswordResetProviding: Sendable {
    func verifyResetToken(_ token: String) async throws -> ResetTokenVerification
    func submitPasswordReset(token: String, newPassword: String, twoFactorCode: String?) async throws
}

// MARK: - Ce que la passerelle a répondu

/// Miroir de `resolveResetPasswordOutcome` (`apps/web/src/lib/view/auth-feedback.ts`).
/// Le `code` d'abord ; le texte historique, que la passerelle sert inchangé, en
/// repli pour une passerelle plus ancienne que l'app.
public enum PasswordResetOutcome: Equatable, Sendable {
    case saved
    case invalidToken
    case attemptsExhausted
    case weakPassword
    case reusedPassword
    case secondFactorRequired
    case secondFactorInvalid
    case accountLocked
    case rateLimited
    case offline
    case failed(reference: String)

    private struct Refusal: Sendable {
        let code: String
        let text: String
        let isPrefix: Bool
        let outcome: PasswordResetOutcome

        func matches(_ lowered: String) -> Bool {
            isPrefix ? lowered.hasPrefix(text) : lowered.contains(text)
        }
    }

    private static let refusals: [Refusal] = [
        Refusal(code: "RESET_TOKEN_INVALID", text: "invalid or expired reset token", isPrefix: false, outcome: .invalidToken),
        Refusal(code: "TWO_FACTOR_ATTEMPTS_EXHAUSTED", text: "too many invalid 2fa codes", isPrefix: false, outcome: .attemptsExhausted),
        Refusal(code: "RESET_PASSWORD_WEAK", text: "password requirements", isPrefix: true, outcome: .weakPassword),
        Refusal(code: "RESET_PASSWORD_REUSED", text: "password was used recently", isPrefix: false, outcome: .reusedPassword),
        Refusal(code: "TWO_FACTOR_REQUIRED", text: "2fa code required", isPrefix: false, outcome: .secondFactorRequired),
        Refusal(code: "TWO_FACTOR_INVALID", text: "invalid 2fa code", isPrefix: false, outcome: .secondFactorInvalid),
        Refusal(code: "ACCOUNT_LOCKED", text: "account is locked", isPrefix: false, outcome: .accountLocked),
    ]

    private static func refusal(code: String?, text: String) -> PasswordResetOutcome? {
        if let byCode = refusals.first(where: { $0.code == code }) { return byCode.outcome }
        let lowered = text.lowercased()
        return refusals.first(where: { $0.matches(lowered) })?.outcome
    }

    public init(error: Error) {
        guard let meeshyError = error as? MeeshyError else {
            self = .failed(reference: "0")
            return
        }
        switch meeshyError {
        case .network:
            self = .offline
        case .rejected(let rejection) where rejection.statusCode == 429:
            self = .rateLimited
        case .rejected(let rejection) where rejection.statusCode == 400:
            self = Self.refusal(code: rejection.code, text: rejection.message)
                ?? .failed(reference: rejection.code ?? "400")
        case .rejected(let rejection):
            self = .failed(reference: rejection.code ?? String(rejection.statusCode))
        case .server(429, _):
            self = .rateLimited
        case .server(400, let message):
            self = Self.refusal(code: nil, text: message) ?? .failed(reference: "400")
        case .server(let status, _):
            self = .failed(reference: String(status))
        default:
            self = .failed(reference: "0")
        }
    }
}

// MARK: - Le parcours, sans état caché

/// L'écran « Nouveau mot de passe » réduit à des valeurs : quelle page, faut-il
/// le code 2FA, quelle raison afficher. Chaque transition rend une copie.
public struct PasswordResetFlow: Equatable, Sendable {
    public enum Phase: Equatable, Sendable {
        case form
        case saved
        case linkInvalid
        case attemptsExhausted
    }

    public enum Notice: Equatable, Sendable {
        case secondFactorRequired
        case secondFactorInvalid
        case weakPassword
        case reusedPassword
        case accountLocked
        case rateLimited
        case offline
        case failed(reference: String)
    }

    public static let codeLength = 6

    public let phase: Phase
    public let requiresSecondFactor: Bool
    public let notice: Notice?

    public init(phase: Phase = .form, requiresSecondFactor: Bool = false, notice: Notice? = nil) {
        self.phase = phase
        self.requiresSecondFactor = requiresSecondFactor
        self.notice = notice
    }

    public func verified(_ verification: ResetTokenVerification) -> PasswordResetFlow {
        guard verification.valid else {
            return PasswordResetFlow(phase: .linkInvalid, requiresSecondFactor: requiresSecondFactor)
        }
        return PasswordResetFlow(phase: phase, requiresSecondFactor: requiresSecondFactor || verification.requires2FA, notice: notice)
    }

    public func resolved(_ outcome: PasswordResetOutcome) -> PasswordResetFlow {
        switch outcome {
        case .saved: return PasswordResetFlow(phase: .saved, requiresSecondFactor: requiresSecondFactor)
        case .invalidToken: return PasswordResetFlow(phase: .linkInvalid, requiresSecondFactor: requiresSecondFactor)
        case .attemptsExhausted: return PasswordResetFlow(phase: .attemptsExhausted, requiresSecondFactor: requiresSecondFactor)
        case .secondFactorRequired: return PasswordResetFlow(requiresSecondFactor: true, notice: .secondFactorRequired)
        case .secondFactorInvalid: return refused(.secondFactorInvalid)
        case .weakPassword: return refused(.weakPassword)
        case .reusedPassword: return refused(.reusedPassword)
        case .accountLocked: return refused(.accountLocked)
        case .rateLimited: return refused(.rateLimited)
        case .offline: return refused(.offline)
        case .failed(let reference): return refused(.failed(reference: reference))
        }
    }

    public func clearingNotice() -> PasswordResetFlow {
        PasswordResetFlow(phase: phase, requiresSecondFactor: requiresSecondFactor)
    }

    public func canSubmit(newPassword: String, confirmPassword: String, code: String) -> Bool {
        guard !newPassword.isEmpty, newPassword == confirmPassword else { return false }
        return !requiresSecondFactor || Self.sanitizedCode(code).count == Self.codeLength
    }

    /// Le code à transmettre — `nil` tant que le compte ne l'exige pas.
    public func submittedCode(_ code: String) -> String? {
        requiresSecondFactor ? Self.sanitizedCode(code) : nil
    }

    public static func sanitizedCode(_ raw: String) -> String {
        String(raw.filter(\.isASCIIDigit).prefix(codeLength))
    }

    private func refused(_ notice: Notice) -> PasswordResetFlow {
        PasswordResetFlow(phase: .form, requiresSecondFactor: requiresSecondFactor, notice: notice)
    }
}

private extension Character {
    var isASCIIDigit: Bool { isASCII && isNumber }
}
