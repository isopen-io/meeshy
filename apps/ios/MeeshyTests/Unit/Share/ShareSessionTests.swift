import XCTest

/// `ShareSession` vit dans la cible `MeeshyShareExtension` et est compilé
/// DIRECTEMENT dans ce bundle de tests via `project.yml` (même motif que
/// `NSEDecryptor`) : il est donc visible sans `@testable import Meeshy`.
///
/// Le cœur de la résolution est une fonction pure — l'accès au trousseau et à
/// `UserDefaults` est injecté — pour que la POLITIQUE de résolution soit
/// testable sans trousseau réel ni App Group.
final class ShareSessionTests: XCTestCase {

    private func reader(_ entries: [String: String]) -> (String) -> String? {
        { entries[$0] }
    }

    // MARK: - Identité

    func test_resolve_withUserIdAndToken_returnsSession() {
        let session = ShareSession.resolve(
            activeUserId: "u1",
            storedBaseURL: nil,
            readToken: reader(["meeshy_token_u1": "jwt-abc"])
        )

        XCTAssertEqual(session?.userId, "u1")
        XCTAssertEqual(session?.token, "jwt-abc")
    }

    /// L'account interrogé DOIT suivre la convention déjà en production dans
    /// `NSEDataSync.readAuthToken` : `meeshy_token_<userId>`. Un écart ici
    /// donnerait un `errSecItemNotFound` silencieux sur appareil.
    func test_resolve_queriesKeychainAccountFollowingNSEConvention() {
        var queried: [String] = []
        _ = ShareSession.resolve(
            activeUserId: "abc123",
            storedBaseURL: nil,
            readToken: { account in
                queried.append(account)
                return "jwt"
            }
        )

        XCTAssertEqual(queried, ["meeshy_token_abc123"])
    }

    func test_resolve_withoutActiveUserId_returnsNil() {
        XCTAssertNil(ShareSession.resolve(
            activeUserId: nil,
            storedBaseURL: nil,
            readToken: { _ in "jwt" }
        ))
    }

    func test_resolve_withBlankActiveUserId_returnsNil() {
        XCTAssertNil(ShareSession.resolve(
            activeUserId: "   ",
            storedBaseURL: nil,
            readToken: { _ in "jwt" }
        ))
    }

    func test_resolve_withoutToken_returnsNil() {
        XCTAssertNil(ShareSession.resolve(
            activeUserId: "u1",
            storedBaseURL: nil,
            readToken: { _ in nil }
        ))
    }

    func test_resolve_withBlankToken_returnsNil() {
        XCTAssertNil(ShareSession.resolve(
            activeUserId: "u1",
            storedBaseURL: nil,
            readToken: reader(["meeshy_token_u1": ""])
        ))
    }

    // MARK: - Base URL

    func test_resolve_withAllowedBaseURL_usesStoredValue() {
        for allowed in ["https://gate.meeshy.me", "https://gate.staging.meeshy.me", "http://localhost:3000"] {
            let session = ShareSession.resolve(
                activeUserId: "u1",
                storedBaseURL: allowed,
                readToken: reader(["meeshy_token_u1": "jwt"])
            )
            XCTAssertEqual(session?.apiBaseURL, allowed, "\(allowed) est dans l'allowlist")
        }
    }

    /// Une valeur hors allowlist ne doit JAMAIS être suivie : le contenu
    /// partagé partirait vers un hôte arbitraire avec un Bearer valide.
    func test_resolve_withDisallowedBaseURL_fallsBackToProduction() {
        let session = ShareSession.resolve(
            activeUserId: "u1",
            storedBaseURL: "https://attaquant.example",
            readToken: reader(["meeshy_token_u1": "jwt"])
        )

        XCTAssertEqual(session?.apiBaseURL, "https://gate.meeshy.me")
    }

    func test_resolve_withoutStoredBaseURL_fallsBackToProduction() {
        let session = ShareSession.resolve(
            activeUserId: "u1",
            storedBaseURL: nil,
            readToken: reader(["meeshy_token_u1": "jwt"])
        )

        XCTAssertEqual(session?.apiBaseURL, "https://gate.meeshy.me")
    }

    /// L'allowlist de l'extension doit rester le miroir exact de celle de la
    /// NSE : les deux lisent la MÊME clé App Group écrite par l'app.
    func test_allowedBaseURLs_mirrorTheNSEAllowlist() {
        XCTAssertEqual(
            ShareSession.allowedAPIBaseURLs,
            ["https://gate.meeshy.me", "https://gate.staging.meeshy.me", "http://localhost:3000"]
        )
    }
}
