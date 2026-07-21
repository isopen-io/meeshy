import XCTest
@testable import MeeshySDK

/// P1 — pins the 401 mapping decision that used to funnel every credential
/// failure (wrong password, wrong 2FA code) through `.sessionExpired` +
/// `handleUnauthorized()`, discarding the gateway's own message and showing a
/// confusing "Session expirée" instead of "Identifiants invalides" / "Code
/// incorrect". `/auth/refresh` is deliberately excluded — a 401 there is a
/// genuine session expiry.
///
/// `/auth/register` and `/auth/magic-link/*` are deliberately NOT credential
/// endpoints here: the gateway never returns 401 on either (both surface
/// every error as 400 via `sendBadRequest` — verified against
/// `services/gateway/src/routes/auth/register.ts` and
/// `services/gateway/src/routes/magic-link.ts`). Treating them as credential
/// endpoints was scope creep beyond the audited root cause (P1 — auth-session,
/// 2026-07-20: "magic-link répond 400 donc non affecté par le bug
/// sessionExpired").
final class APIClientAuthMappingTests: XCTestCase {

    func test_mapUnauthorized_loginEndpoint_returnsInvalidCredentialsWithServerMessage() {
        let result = APIClient.mapUnauthorized(endpoint: "/auth/login", serverMessage: "Mot de passe incorrect")
        XCTAssertEqual(result, .invalidCredentials(message: "Mot de passe incorrect"))
    }

    func test_mapUnauthorized_loginEndpoint_fallsBackToDefaultMessage_whenServerMessageNil() {
        let result = APIClient.mapUnauthorized(endpoint: "/auth/login", serverMessage: nil)
        XCTAssertEqual(result, .invalidCredentials(message: "Identifiants invalides"))
    }

    func test_mapUnauthorized_twoFactorEndpoint_returnsInvalidCredentialsWithServerMessage() {
        let result = APIClient.mapUnauthorized(endpoint: "/auth/login/2fa", serverMessage: "Code invalide")
        XCTAssertEqual(result, .invalidCredentials(message: "Code invalide"))
    }

    func test_mapUnauthorized_registerEndpoint_returnsSessionExpired() {
        // The gateway never emits 401 for /auth/register (only 400 via
        // sendBadRequest), so this is a hypothetical input — the pure
        // function must not special-case it as a credential endpoint.
        let result = APIClient.mapUnauthorized(endpoint: "/auth/register", serverMessage: "Compte verrouille")
        XCTAssertEqual(result, .sessionExpired)
    }

    func test_mapUnauthorized_magicLinkValidateEndpoint_returnsSessionExpired() {
        // Same rationale — magic-link routes only ever return 400.
        let result = APIClient.mapUnauthorized(endpoint: "/auth/magic-link/validate", serverMessage: "Lien expire")
        XCTAssertEqual(result, .sessionExpired)
    }

    func test_mapUnauthorized_refreshEndpoint_returnsSessionExpired_notInvalidCredentials() {
        let result = APIClient.mapUnauthorized(endpoint: "/auth/refresh", serverMessage: "anything")
        XCTAssertEqual(result, .sessionExpired)
    }

    func test_mapUnauthorized_regularEndpoint_returnsSessionExpired() {
        let result = APIClient.mapUnauthorized(endpoint: "/conversations", serverMessage: nil)
        XCTAssertEqual(result, .sessionExpired)
    }
}
