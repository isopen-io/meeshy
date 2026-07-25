import Foundation

// MARK: - Network Error

public enum NetworkError: LocalizedError {
    case noConnection
    case timeout
    case serverUnreachable

    public var errorDescription: String? {
        switch self {
        case .noConnection: return "Pas de connexion internet"
        case .timeout: return "La requete a expire"
        case .serverUnreachable: return "Serveur inaccessible"
        }
    }
}

// MARK: - Auth Error

public enum AuthError: LocalizedError {
    case invalidCredentials
    /// P1 — a 401 on a credential-submission endpoint (login, 2FA) carries
    /// the gateway's own reason ("Mot de passe incorrect", "Code invalide",
    /// ...). Surfacing it (instead of the generic hardcoded string, or worse,
    /// `.sessionExpired`) is the whole point of the fix — see
    /// `APIClient.mapUnauthorized`.
    case invalidCredentialsWithMessage(String)
    case sessionExpired
    case accountLocked
    case registrationFailed(String)

    public var errorDescription: String? {
        switch self {
        case .invalidCredentials: return "Identifiants invalides"
        case .invalidCredentialsWithMessage(let message): return message
        case .sessionExpired: return "Session expiree, veuillez vous reconnecter"
        case .accountLocked: return "Compte verrouille"
        case .registrationFailed(let reason): return "Echec de l'inscription : \(reason)"
        }
    }
}

// MARK: - Message Error

public enum MessageError: LocalizedError {
    case sendFailed
    case deleteFailed
    case editFailed
    case tooLong(maxLength: Int)

    public var errorDescription: String? {
        switch self {
        case .sendFailed: return "Echec de l'envoi du message"
        case .deleteFailed: return "Echec de la suppression du message"
        case .editFailed: return "Echec de la modification du message"
        case .tooLong(let maxLength): return "Le message depasse la limite de \(maxLength) caracteres"
        }
    }
}

// MARK: - Media Error

public enum MediaError: LocalizedError {
    case uploadFailed
    case fileTooLarge(maxMB: Int)
    case unsupportedFormat
    case compressionFailed

    public var errorDescription: String? {
        switch self {
        case .uploadFailed: return "Echec de l'envoi du fichier"
        case .fileTooLarge(let maxMB): return "Le fichier depasse la limite de \(maxMB) Mo"
        case .unsupportedFormat: return "Format de fichier non supporte"
        case .compressionFailed: return "Echec de la compression"
        }
    }
}

// MARK: - Meeshy Error

public enum MeeshyError: LocalizedError {
    case network(NetworkError)
    case auth(AuthError)
    case message(MessageError)
    case media(MediaError)
    /// Resource-level access denied (HTTP 403). Distinct from `.auth` —
    /// the credentials are still valid; the user simply does not (or no
    /// longer) has access to THIS resource (kicked from a conversation,
    /// blocked by another user, etc.). Callers must NEVER treat this as
    /// a session failure. The auth refresh / re-authentication paths
    /// only react to `.auth(...)` cases.
    ///
    /// `body` carries the raw HTTP response body so that callers who need
    /// structured 403 payloads (e.g. consent-required errors with
    /// `requiredConsents`) can decode them without a second round-trip.
    case forbidden(reason: String?, body: Data?)
    case server(statusCode: Int, message: String)
    case unknown(Error)

    public var errorDescription: String? {
        switch self {
        case .network(let error): return error.errorDescription
        case .auth(let error): return error.errorDescription
        case .message(let error): return error.errorDescription
        case .media(let error): return error.errorDescription
        case .forbidden(let reason, _): return reason ?? "Acces refuse a cette ressource"
        case .server(_, let message): return message
        case .unknown(let error): return error.localizedDescription
        }
    }

    public var iconName: String {
        switch self {
        case .network: return "wifi.slash"
        case .auth: return "lock.fill"
        case .message: return "bubble.left.and.exclamationmark.bubble.right"
        case .media: return "photo.badge.exclamationmark"
        case .forbidden: return "lock.slash.fill"
        case .server: return "server.rack"
        case .unknown: return "exclamationmark.triangle.fill"
        }
    }

    public static func from(_ error: Error) -> MeeshyError {
        if let meeshyError = error as? MeeshyError {
            return meeshyError
        }

        if let apiError = error as? APIError {
            return fromAPIError(apiError)
        }

        if let urlError = error as? URLError {
            return fromURLError(urlError)
        }

        if error is DecodingError {
            return .server(statusCode: 0, message: "Erreur de decodage des donnees")
        }

        return .unknown(error)
    }

    private static func fromURLError(_ error: URLError) -> MeeshyError {
        switch error.code {
        case .notConnectedToInternet, .networkConnectionLost:
            return .network(.noConnection)
        case .timedOut:
            return .network(.timeout)
        case .cannotConnectToHost, .cannotFindHost, .dnsLookupFailed:
            return .network(.serverUnreachable)
        default:
            return .network(.noConnection)
        }
    }

    private static func fromAPIError(_ error: APIError) -> MeeshyError {
        switch error {
        case .unauthorized:
            return .auth(.sessionExpired)
        case .serverError(let code, let msg):
            return fromStatusCode(code, message: msg)
        case .networkError(let underlying):
            if let urlError = underlying as? URLError {
                return fromURLError(urlError)
            }
            return .network(.noConnection)
        case .invalidURL:
            return .server(statusCode: 0, message: "URL invalide")
        case .noData:
            return .server(statusCode: 0, message: "Aucune donnee recue")
        case .decodingError:
            return .server(statusCode: 0, message: "Erreur de decodage des donnees")
        }
    }

    private static func fromStatusCode(_ code: Int, message: String?) -> MeeshyError {
        switch code {
        case 401:
            return .auth(.sessionExpired)
        case 403:
            // Resource-level forbidden — NOT an account-locked signal. The
            // session is still valid; only this specific resource is off
            // limits. Callers (ViewModels) decide what to do (purge stale
            // cache, dismiss a conversation, etc.).
            return .forbidden(reason: message, body: nil)
        case 429:
            return .server(statusCode: 429, message: "Trop de requetes")
        default:
            if code >= 500 {
                return .server(statusCode: code, message: message ?? "Erreur serveur")
            }
            return .server(statusCode: code, message: message ?? "Erreur inconnue")
        }
    }
}
