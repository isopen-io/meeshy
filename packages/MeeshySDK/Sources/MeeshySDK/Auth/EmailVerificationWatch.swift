import Foundation

/// Ce que l'appareil qui attend son code sait de la preuve de son adresse
/// (#8083).
///
/// Décision porteur « si et seulement si » : le téléphone ne se connecte que
/// par le code saisi sur lui ou le lien ouvert sur lui. Cet état ne donne donc
/// JAMAIS de session — il permet seulement à l'écran du code de dire
/// « Adresse confirmée — saisissez le code reçu » quand le lien a été ouvert
/// sur un autre appareil.
public enum EmailVerificationWatchStatus: Equatable, Sendable {
    /// Rien de prouvé depuis que le code a été demandé.
    case pending
    /// L'adresse a été prouvée (code ou lien, n'importe où).
    case proven
    /// Le jeton est inconnu (401) ou expiré (410) : il n'y a plus rien à attendre.
    case ended

    /// L'état SERVI ; toute valeur inconnue se lit « rien de prouvé ».
    static func served(_ status: String?) -> EmailVerificationWatchStatus {
        status == "proven" ? .proven : .pending
    }

    /// Les refus qui FINISSENT l'attente. Toute autre erreur est passagère.
    static func ending(_ error: Error) -> EmailVerificationWatchStatus? {
        switch error {
        case MeeshyError.auth(.invalidCredentialsWithMessage):
            return .ended
        case MeeshyError.server(statusCode: 401, message: _), MeeshyError.server(statusCode: 410, message: _):
            return .ended
        default:
            return nil
        }
    }
}

/// Lire l'état d'une attente — injecté dans l'écran du code.
public protocol EmailVerificationWatching: Sendable {
    func emailVerificationStatus(pendingSessionToken: String) async throws -> EmailVerificationWatchStatus
}

struct EmailVerificationStatusRequest: Encodable {
    let pendingSessionToken: String
}

struct EmailVerificationStatusData: Decodable {
    let status: String?
}

extension AuthService: EmailVerificationWatching {
    /// `POST /auth/verification/status`. Lève sur une panne passagère ; rend
    /// `.ended` quand le jeton n'a plus rien à dire.
    public func emailVerificationStatus(pendingSessionToken: String) async throws -> EmailVerificationWatchStatus {
        do {
            let response: APIResponse<EmailVerificationStatusData> = try await api.post(
                AuthEndpoint.verificationStatus,
                body: EmailVerificationStatusRequest(pendingSessionToken: pendingSessionToken)
            )
            return .served(response.data.status)
        } catch {
            if let ended = EmailVerificationWatchStatus.ending(error) { return ended }
            throw error
        }
    }
}

/// Ce que la porte « e-mail seul » rend (#8083) : la durée du code, et le jeton
/// d'attente de CET appareil. Les deux vivent dans `data`.
public struct EmailCodeDispatch: Decodable, Sendable, Equatable {
    public let expiresInSeconds: Int?
    public let pendingSessionToken: String?

    public init(expiresInSeconds: Int?, pendingSessionToken: String?) {
        self.expiresInSeconds = expiresInSeconds
        self.pendingSessionToken = pendingSessionToken
    }
}

extension AuthService {
    /// `POST /auth/magic-link/request` — code + lien partent vers `email`.
    public func requestEmailCode(email: String) async throws -> EmailCodeDispatch {
        let response: APIResponse<EmailCodeDispatch> = try await api.post(
            AuthEndpoint.magicLinkRequest,
            body: MagicLinkRequest(email: email, deviceFingerprint: nil)
        )
        return response.data
    }
}
