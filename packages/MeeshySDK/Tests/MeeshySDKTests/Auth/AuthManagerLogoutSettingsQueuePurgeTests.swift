import XCTest
@testable import MeeshySDK

/// P0 (revue local-first 2026-08-01, fiche outbox-02) — le logout doit purger
/// `SettingsActionQueue` : la file persiste endpoint + corps verbatim sur
/// disque, non scopée par userId, et son flush rejoue sous le token de la
/// session COURANTE (y compris ~2 s après l'abonnement de l'observer réseau).
/// Sans purge, le `PATCH /users/me` composé hors-ligne par le compte A est
/// appliqué au profil du compte B au premier front réseau — écriture
/// cross-compte destructive et invisible. Même contrat de perte assumée que
/// `StoryPublishQueue` (décision E9).
@MainActor
final class AuthManagerLogoutSettingsQueuePurgeTests: XCTestCase {

    override func setUp() async throws {
        await SettingsActionQueue.shared.clearAll()
    }

    override func tearDown() async throws {
        await SettingsActionQueue.shared.clearAll()
    }

    func test_logout_purgesSettingsActionQueue() async throws {
        await SettingsActionQueue.shared.enqueue(
            SettingsAction(
                UsersEndpoint.me,
                httpMethod: "PATCH",
                payload: Data(#"{"displayName":"Compte A"}"#.utf8)
            )
        )
        let seeded = await SettingsActionQueue.shared.count
        XCTAssertEqual(seeded, 1, "precondition: one pending settings mutation")

        await AuthManager.shared.logout()

        let remaining = await SettingsActionQueue.shared.count
        XCTAssertEqual(
            remaining, 0,
            "logout must drop pending settings mutations — they would replay under the next account's token"
        )
    }
}
