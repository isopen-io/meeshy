import XCTest
@testable import MeeshySDK

/// **Une suite qui authentifie `AuthManager.shared` DOIT le déconnecter.**
///
/// `AuthManager.shared` est un singleton de PROCESSUS : toute suite qui
/// l'authentifie (`applySession(...)`, ou `isAuthenticated = true` en direct)
/// sans le restaurer au `tearDown` laisse le singleton authentifié pour le
/// reste du run, y compris pour des suites SANS RAPPORT exécutées ensuite
/// dans le même process xctest.
///
/// C'est précisément ce qui rendait `OfflineQueuePendingUIItemsPublisherTests`
/// flaky (#3591, 3/5 sur code identique) : `isUserAuthenticated` ouvre la
/// garde de `UserPreferencesManager.syncCategoryToBackend`, dont le débounce
/// de 1s enfile alors un `updateSettings` dans la VRAIE `OfflineQueue.shared`
/// — polluant le snapshot d'une suite `OfflineQueue*` voisine qui tourne dans
/// la même seconde. `AuthManagerVoicePublicRevalidationTests` a déjà corrigé
/// son propre cas (gate 2026-08-25, relance 2, voir son `tearDown`) ; cette
/// garde généralise le correctif à toute suite PRÉSENTE ou FUTURE plutôt que
/// de compter sur une relecture au cas par cas.
///
/// Restauration acceptée, l'une ou l'autre :
/// 1. Un appel à `logout()` / `logout(forgettingAccount:)` dans le `tearDown`
///    — `logout()` remet `currentUser`, `isAuthenticated` ET
///    `APIClient.shared.authToken` à leur état déconnecté.
/// 2. La restauration EXPLICITE des trois : `isAuthenticated`, `currentUser`
///    et `authToken` (capturés au `setUp`), dans le `tearDown`.
///
/// Garde de SOURCE (pas de comportement) : le symptôme n'est observable qu'en
/// laissant deux suites xctest s'enchaîner dans la même seconde — un
/// témoin de comportement ne peut pas forcer cet ordonnancement de façon
/// fiable, alors que le motif fautif (authentifier sans restaurer) se lit
/// dans le texte du fichier.
final class AuthManagerTestIsolationSourceGuardTests: XCTestCase {

    private func testsRootURL() -> URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent() // Auth/
            .deletingLastPathComponent() // MeeshySDKTests/
            .deletingLastPathComponent() // Tests/
    }

    /// Isole le corps de `tearDown` (accolades équilibrées) — la restauration
    /// doit y vivre, pas seulement quelque part dans le fichier.
    private func tearDownBody(in source: String) -> String? {
        guard let signatureRange = source.range(
            of: #"func tearDown\([^)]*\)[^{]*\{"#,
            options: .regularExpression
        ) else { return nil }

        var depth = 0
        var opened = false
        var out = ""
        for ch in source[signatureRange.lowerBound...] {
            out.append(ch)
            if ch == "{" { depth += 1; opened = true }
            if ch == "}" {
                depth -= 1
                if opened && depth == 0 { return out }
            }
        }
        return nil
    }

    private func authenticatesRealSingleton(_ source: String) -> Bool {
        // `.applySession(token:` also catches the common `let auth = AuthManager.shared`
        // aliasing these suites use; `\bisAuthenticated\s*=\s*true\b` catches a direct
        // flip without matching `isAuthenticatedOverride = true` (no word boundary
        // between `isAuthenticated` and `Override`, so it never fires on the SEAM
        // `UserPreferencesManagerTests`/`UserPreferencesManager.isAuthenticatedOverride`
        // deliberately use to avoid touching the real singleton).
        let pattern = #"AuthManager\.shared\.applySession\(|\.applySession\(token:|\bisAuthenticated\s*=\s*true\b"#
        return source.range(of: pattern, options: .regularExpression) != nil
    }

    private func restoresSingleton(tearDown body: String) -> Bool {
        let logsOut = body.range(of: #"\.logout\("#, options: .regularExpression) != nil
        guard !logsOut else { return true }

        let restoresIsAuthenticated = body.range(
            of: #"isAuthenticated\s*=\s*(?!true\b)\w"#, options: .regularExpression
        ) != nil
        let restoresCurrentUser = body.range(
            of: #"currentUser\s*=\s*\w"#, options: .regularExpression
        ) != nil
        let restoresAuthToken = body.contains("authToken = ")

        return restoresIsAuthenticated && restoresCurrentUser && restoresAuthToken
    }

    func test_everySuiteThatAuthenticatesTheSharedSingletonRestoresItOnTearDown() throws {
        let root = testsRootURL()
        let fileManager = FileManager.default
        guard let enumerator = fileManager.enumerator(at: root, includingPropertiesForKeys: nil) else {
            XCTFail("Could not enumerate Tests directory at \(root.path)")
            return
        }
        let thisFileName = URL(fileURLWithPath: #filePath).lastPathComponent

        var violations: [String] = []
        for case let fileURL as URL in enumerator where fileURL.pathExtension == "swift" {
            guard fileURL.lastPathComponent != thisFileName else { continue }
            let source = try String(contentsOf: fileURL, encoding: .utf8)
            guard authenticatesRealSingleton(source) else { continue }

            guard let body = tearDownBody(in: source), restoresSingleton(tearDown: body) else {
                violations.append(fileURL.lastPathComponent)
                continue
            }
        }

        XCTAssertTrue(
            violations.isEmpty,
            "Ces suites authentifient `AuthManager.shared` sans le restaurer (logout, ou " +
            "isAuthenticated/currentUser/authToken) dans leur tearDown — le singleton reste " +
            "authentifié pour le reste du process xctest, ce qui a rendu " +
            "OfflineQueuePendingUIItemsPublisherTests flaky (#3591) : \(violations.sorted())"
        )
    }
}
