import XCTest
@testable import MeeshySDK

/// P1 — pins the 401 mapping decision that used to funnel every credential
/// failure (wrong password, wrong 2FA code, stale magic link) through
/// `.sessionExpired` + `handleUnauthorized()`, discarding the gateway's own
/// message and showing a confusing "Session expirée" instead of "Identifiants
/// invalides" / "Code incorrect". `/auth/refresh` is deliberately excluded —
/// a 401 there is a genuine session expiry.
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

    func test_mapUnauthorized_registerEndpoint_returnsInvalidCredentials() {
        let result = APIClient.mapUnauthorized(endpoint: "/auth/register", serverMessage: "Compte verrouille")
        XCTAssertEqual(result, .invalidCredentials(message: "Compte verrouille"))
    }

    func test_mapUnauthorized_magicLinkValidateEndpoint_returnsInvalidCredentials() {
        let result = APIClient.mapUnauthorized(endpoint: "/auth/magic-link/validate", serverMessage: "Lien expire")
        XCTAssertEqual(result, .invalidCredentials(message: "Lien expire"))
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
