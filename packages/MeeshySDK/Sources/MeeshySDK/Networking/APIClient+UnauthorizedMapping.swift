import Foundation

// Extrait d'`APIClient.swift`, au plafond de taille (#10482) : la lecture pure
// d'un 401, que le pipeline consomme.

extension APIClient {

    // MARK: - 401 Mapping (pure)

    /// How a 401 response on `endpoint` should be surfaced. Extracted as a
    /// pure decision so the credential-vs-session distinction is unit
    /// testable without driving a real `URLSession` — see
    /// `APIClientAuthMappingTests`.
    enum UnauthorizedMapping: Equatable {
        /// Wrong password / 2FA code / stale magic link — NOT a session
        /// problem, so callers must NOT tear down or refresh anything.
        case invalidCredentials(message: String)
        /// A real session-expiry: refresh-token rejected, or a regular
        /// endpoint whose retried-refresh attempt also 401'd.
        case sessionExpired
    }

    /// P1 — a 401 on `/auth/login` or `/auth/login/2fa` means "these
    /// credentials are wrong", never "your session expired" (there is no
    /// session yet on these endpoints).
    /// `/auth/refresh` is deliberately EXCLUDED: a 401 there means the
    /// refresh token itself is dead, which is genuinely `.sessionExpired`.
    /// `/auth/register` and `/auth/magic-link/*` are also deliberately
    /// EXCLUDED — the gateway never returns 401 on either (both surface
    /// every error as 400 via `sendBadRequest`; verified against
    /// `services/gateway/src/routes/auth/register.ts` and
    /// `services/gateway/src/routes/magic-link.ts`, zero `sendUnauthorized`
    /// call sites in either file). Including them here would be scope creep
    /// beyond the audited root cause (wrong password / 2FA code).
    nonisolated static func mapUnauthorized(endpoint: String, serverMessage: String?) -> UnauthorizedMapping {
        mapUnauthorized(authKind: MeeshyEndpointPolicy.authKind(forLegacyPath: endpoint),
                        serverMessage: serverMessage)
    }

    /// La même règle, lue sur la politique DÉCLARÉE plutôt que déduite du
    /// chemin. C'est cette forme que le pipeline consomme : une adresse typée
    /// n'a pas à repasser par une comparaison de préfixe pour dire ce qu'elle
    /// sait déjà d'elle-même.
    nonisolated static func mapUnauthorized(
        authKind: MeeshyEndpointAuthKind, serverMessage: String?
    ) -> UnauthorizedMapping {
        guard authKind == .credentials else { return .sessionExpired }
        return .invalidCredentials(message: serverMessage ?? "Identifiants invalides")
    }
}
