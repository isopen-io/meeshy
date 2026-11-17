import XCTest
@testable import MeeshySDK

/// ios-systeme-6 (revue des notifications du 2026-11-17, #18911) — une bannière
/// touchée SANS session ouverte ne suit pas le compte suivant.
///
/// Après la déconnexion de A, une de ses bannières reste visible (ou arrive
/// encore). On la touche : l'app s'ouvre sur l'écran de connexion et le payload
/// attend, publié, que `isAuthenticated` devienne vrai. B se connecte : l'app
/// poussait alors la conversation de A sous B, qui tombait sur une erreur d'accès
/// ou sur un contenu inattendu.
///
/// APNs ne porte pas le destinataire : on MARQUE la charge au moment du toucher,
/// par le compte que l'appareil désigne alors (`addressedTo`), et la porte de
/// consommation ne navigue que sous ce même compte.
@MainActor
final class PushTapConsumptionTests: XCTestCase {

    private func payload(addressedTo: String?) -> NotificationPayload {
        NotificationPayload(
            userInfo: ["type": "message", "conversationId": "conv-of-A"],
            addressedTo: addressedTo
        )
    }

    func test_decide_forATapPublishedWithoutASession_discardsItUnderTheNextAccount() {
        let tappedSignedOut = payload(addressedTo: nil)

        XCTAssertEqual(PushTapConsumption.decide(payload: tappedSignedOut, currentUserId: "user-B"), .discard,
                       "la conversation de A ne s'ouvre pas sous B")
    }

    func test_decide_forATapMarkedForAnotherAccount_discardsIt() {
        XCTAssertEqual(PushTapConsumption.decide(payload: payload(addressedTo: "user-A"), currentUserId: "user-B"), .discard)
    }

    func test_decide_forATapMarkedForTheCurrentAccount_navigates() {
        XCTAssertEqual(PushTapConsumption.decide(payload: payload(addressedTo: "user-B"), currentUserId: "user-B"), .navigate)
    }

    func test_decide_withNoCurrentAccount_discardsEvenAMarkedTap() {
        XCTAssertEqual(PushTapConsumption.decide(payload: payload(addressedTo: "user-B"), currentUserId: nil), .discard)
    }

    func test_handleNotification_marksThePayloadWithTheAddressee() {
        let suiteName = "test.push.tap.\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suiteName) ?? .standard
        defer { defaults.removePersistentDomain(forName: suiteName) }
        let sut = PushNotificationManager(userDefaults: defaults, keychainStore: TapKeychain())

        sut.handleNotification(userInfo: ["type": "message", "conversationId": "c1"], addressedTo: "user-B")
        XCTAssertEqual(sut.pendingNotificationPayload?.addressedTo, "user-B")

        sut.handleNotification(userInfo: ["type": "message", "conversationId": "c1"])
        XCTAssertNil(sut.pendingNotificationPayload?.addressedTo, "sans compte au toucher, la charge n'est adressée à personne")
    }
}

private final class TapKeychain: KeychainStoring, @unchecked Sendable {
    private let lock = NSLock()
    private var store: [String: String] = [:]

    func save(_ value: String, forKey key: String, account: String?) throws { lock.withLock { store[key] = value } }
    func load(forKey key: String, account: String?) -> String? { lock.withLock { store[key] } }
    func delete(forKey key: String, account: String?) { lock.withLock { _ = store.removeValue(forKey: key) } }
    func saveAsync(_ value: String, forKey key: String, account: String?) async throws { try save(value, forKey: key, account: account) }
    func loadAsync(forKey key: String, account: String?) async -> String? { load(forKey: key, account: account) }
}
