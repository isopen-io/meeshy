import XCTest
import MeeshySDK
@testable import Meeshy

/// Phase finale du run de tests (`meeshy.sh test`) — valide la connexion réelle
/// au compte de test et LAISSE l'application dans un état connecté.
///
/// Contrat d'exécution :
/// - Cette suite est lancée par `meeshy.sh` dans une invocation `xcodebuild`
///   séparée, APRÈS toutes les autres suites (dont `AuthServiceTests`, qui
///   appelle `AuthManager.shared.logout()` et purge la session Keychain).
/// - Le bundle `MeeshyTests` est hébergé dans Meeshy.app (TEST_HOST) : la
///   session écrite ici via `applySession` (Keychain + UserDefaults) survit au
///   run — au prochain lancement de l'app, `checkExistingSession()` la restaure.
/// - Les identifiants arrivent par l'environnement du runner
///   (`TEST_RUNNER_DEMO_USER` / `TEST_RUNNER_DEMO_PASSWORD`, sourcés de
///   `apps/ios/fastlane/.env` par `meeshy.sh`). Sans identifiants, la suite
///   est sautée (XCTSkip) — le run reste vert mais l'app reste déconnectée.
///
/// RÈGLE ABSOLUE : ne JAMAIS ajouter de `logout()`, de tearDown destructeur ni
/// de second test qui altère la session dans cette suite — son unique raison
/// d'être est de terminer le run connecté au compte de test.
@MainActor
final class ZZEndStateConnectedSessionTests: XCTestCase {

    func test_login_withTestAccount_leavesAppConnected() async throws {
        let env = ProcessInfo.processInfo.environment
        guard let username = env["DEMO_USER"], !username.isEmpty,
              let password = env["DEMO_PASSWORD"], !password.isEmpty else {
            throw XCTSkip(
                "DEMO_USER/DEMO_PASSWORD absents de l'environnement du runner — "
                + "phase 'état connecté' sautée. Renseigner apps/ios/fastlane/.env "
                + "ou exporter TEST_RUNNER_DEMO_USER / TEST_RUNNER_DEMO_PASSWORD."
            )
        }

        let auth = AuthManager.shared
        await auth.login(username: username, password: password)

        XCTAssertNil(
            auth.errorMessage,
            "Login du compte de test '\(username)' refusé : \(auth.errorMessage ?? "-") "
            + "(environnement API : \(MeeshyConfig.shared.apiBaseURL))"
        )
        XCTAssertFalse(auth.requires2FA, "Le compte de test ne doit pas exiger de 2FA")
        XCTAssertTrue(auth.isAuthenticated, "L'app doit terminer le run authentifiée")
        XCTAssertEqual(auth.currentUser?.username, username)
        XCTAssertNotNil(auth.authToken, "Le token de session doit être persisté")
        XCTAssertFalse(auth.isCurrentTokenExpired, "Le token persisté doit être valide")
    }
}
