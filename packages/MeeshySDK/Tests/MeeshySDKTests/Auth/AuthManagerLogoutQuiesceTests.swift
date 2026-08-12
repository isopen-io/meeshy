import XCTest
import Combine
@testable import MeeshySDK

/// P1 hotfix — pin le contrat async de `AuthManager.logout()` après le
/// passage de sync vers async + quiesce-then-purge.
///
/// Le contrat complet (purge des 8+ singletons SDK et services app) est
/// validé par les tests unitaires de chaque service individuel :
/// `BlockServiceTests.testResetClearsBlockedUserIds`,
/// `UserPreferencesManagerTests.test_resetSession_clearsInMemoryAndWipesDisk`,
/// `PushNotificationManagerTests.test_resetSession_clearsPendingPayloadAndTokens_butKeepsAuthorization`,
/// `SessionSnapshotStoreTests.test_wipe_removesOnlyMeeshySessionKeys_whenAppGroupAvailable`.
///
/// Ce test couvre uniquement le contrat de signature + idempotence côté
/// AuthManager — le câblage vers les services est validé par revue manuelle
/// et tests unitaires des services. Test d'intégration multi-user complet
/// viendra avec la Phase 7 de la migration UserSession.
@MainActor
final class AuthManagerLogoutQuiesceTests: XCTestCase {

    /// Prouve que `logout()` est async (compile avec await) et idempotent
    /// quand aucune session n'est active. Sans cette idempotence, un
    /// double-tap du bouton "Se déconnecter" pourrait crasher.
    func test_logout_isAsync_andIdempotentWithoutActiveSession() async {
        let manager = AuthManager.shared
        // Précondition : pas de session active (état initial du SDK)
        // Si un test précédent a polué, on accepte — c'est juste un smoke test
        await manager.logout()

        XCTAssertFalse(manager.isAuthenticated, "isAuthenticated must be false after logout")
        XCTAssertNil(manager.currentUser, "currentUser must be nil after logout")
    }

    /// Prouve que `logout()` peut être appelée 2x consécutivement sans crash.
    /// Important car le quiesce-then-purge implique plusieurs operations
    /// (sockets.disconnect, services.reset, keychain.delete) qui pourraient
    /// ne pas être idempotentes en l'état.
    func test_logout_isIdempotent_whenCalledTwice() async {
        let manager = AuthManager.shared

        await manager.logout()
        await manager.logout()  // second call must not crash

        XCTAssertFalse(manager.isAuthenticated)
    }
}

/// startup-03 — le logout VOLONTAIRE n'émet jamais `sessionInvalidated`
/// (le signal est réservé au chemin serveur `requireReauthentication`).
extension AuthManagerLogoutQuiesceTests {

    @MainActor
    func test_logout_doesNotEmitSessionInvalidated() async {
        var emitCount = 0
        let cancellable = AuthManager.shared.sessionInvalidated.sink { _ in emitCount += 1 }

        await AuthManager.shared.logout()

        XCTAssertEqual(emitCount, 0, "un logout volontaire ne doit pas se faire passer pour une invalidation serveur")
        cancellable.cancel()
    }
}
