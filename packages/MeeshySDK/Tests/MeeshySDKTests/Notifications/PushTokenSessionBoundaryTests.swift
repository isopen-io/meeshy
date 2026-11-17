import XCTest
@testable import MeeshySDK

/// ios-systeme-3 (revue des notifications du 2026-11-17, #18911) — un
/// enregistrement du jeton APNs du compte SORTANT, encore en vol, ne prive pas le
/// compte ENTRANT de son propre enregistrement.
///
/// Sur réseau lent le POST du jeton prend 9 à 14 s. A se déconnecte, B se connecte :
/// le POST de B était sauté (« already in flight », puis cooldown de 300 s), celui
/// de A aboutissait, et la passerelle rattachait le jeton à A — B ne recevait plus
/// rien, et l'iPhone affichait les bannières de A.
///
/// La passerelle garde le DERNIER POST reçu. Un POST de B parti AVANT la réponse
/// de A peut donc avoir été traité avant celui de A : une réponse périmée est
/// suivie d'un nouveau POST, envoyé APRÈS elle, sous la session courante.
@MainActor
final class PushTokenSessionBoundaryTests: XCTestCase {

    private static let apnsToken = Data([0xDE, 0xAD, 0xBE, 0xEF, 0x01, 0x02, 0x03, 0x04])
    private static let apnsTokenHex = "deadbeef01020304"

    private func makeSUT(
        registrar: HeldFirstRegistrar,
        authenticated: SessionFlag,
        keychain: SessionBoundaryKeychain = SessionBoundaryKeychain()
    ) -> (sut: PushNotificationManager, defaults: UserDefaults, suiteName: String, keychain: SessionBoundaryKeychain) {
        let suiteName = "test.push.boundary.\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suiteName) ?? .standard
        let sut = PushNotificationManager(
            userDefaults: defaults,
            keychainStore: keychain,
            registrar: registrar,
            isAuthenticated: { authenticated.value }
        )
        return (sut, defaults, suiteName, keychain)
    }

    private func waitUntil(_ condition: () -> Bool) async {
        var turns = 0
        while !condition(), turns < 500 {
            turns += 1
            try? await Task.sleep(for: .milliseconds(10))
        }
    }

    func test_registerDeviceToken_afterTheLeavingAccountsPostIsStillInFlight_postsAgainAfterItsResponse() async {
        let registrar = HeldFirstRegistrar()
        let authenticated = SessionFlag(true)
        let (sut, defaults, suite, _) = makeSUT(registrar: registrar, authenticated: authenticated)
        defer { defaults.removePersistentDomain(forName: suite) }

        sut.registerDeviceToken(Self.apnsToken)
        await waitUntil { registrar.startedCount == 1 }
        sut.resetSession()
        sut.registerDeviceToken(Self.apnsToken)
        await waitUntil { registrar.startedCount >= 2 }
        registrar.releaseFirst()
        await waitUntil { registrar.events.contains("end:1") && registrar.events.drop { $0 != "end:1" }.contains { $0.hasPrefix("start:") } }

        let afterAccountAResponse = registrar.events.drop { $0 != "end:1" }
        XCTAssertTrue(afterAccountAResponse.contains { $0.hasPrefix("start:") },
                      "un POST part APRÈS la réponse de A : sinon la passerelle peut garder le jeton chez A. Événements : \(registrar.events)")
        XCTAssertEqual(registrar.startedBodies.last?.token, Self.apnsTokenHex)
    }

    func test_registerDeviceToken_enteringAccountPost_isNotSkippedAsAlreadyInFlight() async {
        let registrar = HeldFirstRegistrar()
        let authenticated = SessionFlag(true)
        let (sut, defaults, suite, _) = makeSUT(registrar: registrar, authenticated: authenticated)
        defer { defaults.removePersistentDomain(forName: suite) }

        sut.registerDeviceToken(Self.apnsToken)
        await waitUntil { registrar.startedCount == 1 }
        sut.resetSession()
        sut.registerDeviceToken(Self.apnsToken)
        await waitUntil { registrar.startedCount >= 2 }
        registrar.releaseFirst()

        XCTAssertGreaterThanOrEqual(registrar.startedCount, 2,
                                    "la réservation « en vol » appartient à la session qui l'a posée")
    }

    func test_staleResponse_withNoSessionLeft_marksNothingAsRegistered_andPostsNothing() async {
        let registrar = HeldFirstRegistrar()
        let authenticated = SessionFlag(true)
        let (sut, defaults, suite, keychain) = makeSUT(registrar: registrar, authenticated: authenticated)
        defer { defaults.removePersistentDomain(forName: suite) }

        sut.registerDeviceToken(Self.apnsToken)
        await waitUntil { registrar.startedCount == 1 }
        sut.resetSession()
        authenticated.value = false
        registrar.releaseFirst()
        await waitUntil { registrar.events.contains("end:1") }
        try? await Task.sleep(for: .milliseconds(80))

        XCTAssertNil(keychain.load(forKey: PushNotificationManager.lastRegisteredTokenKey, account: nil),
                     "la réponse de A ne grave pas un cooldown que B hériterait")
        XCTAssertNil(defaults.object(forKey: PushNotificationManager.lastRegisteredAtKey))
        XCTAssertEqual(registrar.startedCount, 1, "sans session ouverte, rien à rejouer")
    }
}

// MARK: - Doubles

final class SessionFlag: @unchecked Sendable {
    var value: Bool
    init(_ value: Bool) { self.value = value }
}

/// Retient le PREMIER POST jusqu'à `releaseFirst()`, rend les suivants aussitôt.
final class HeldFirstRegistrar: PushTokenRegistrationProviding, @unchecked Sendable {
    private let lock = NSLock()
    private var _events: [String] = []
    private var _bodies: [RegisterDeviceTokenRequest] = []
    private var held: CheckedContinuation<Void, Never>?
    private var releasedEarly = false

    var events: [String] { lock.withLock { _events } }
    var startedBodies: [RegisterDeviceTokenRequest] { lock.withLock { _bodies } }
    var startedCount: Int { lock.withLock { _bodies.count } }

    func register(_ request: RegisterDeviceTokenRequest) async throws {
        let index = lock.withLock { () -> Int in
            _bodies.append(request)
            _events.append("start:\(_bodies.count)")
            return _bodies.count
        }
        if index == 1 {
            await withCheckedContinuation { continuation in
                let resumeNow = lock.withLock { () -> Bool in
                    if releasedEarly { return true }
                    held = continuation
                    return false
                }
                if resumeNow { continuation.resume() }
            }
        }
        lock.withLock { _events.append("end:\(index)") }
    }

    func releaseFirst() {
        let continuation = lock.withLock { () -> CheckedContinuation<Void, Never>? in
            releasedEarly = true
            defer { held = nil }
            return held
        }
        continuation?.resume()
    }
}

final class SessionBoundaryKeychain: KeychainStoring, @unchecked Sendable {
    private let lock = NSLock()
    private var store: [String: String] = [:]

    func save(_ value: String, forKey key: String, account: String?) throws { lock.withLock { store[key] = value } }
    func load(forKey key: String, account: String?) -> String? { lock.withLock { store[key] } }
    func delete(forKey key: String, account: String?) { lock.withLock { _ = store.removeValue(forKey: key) } }
    func saveAsync(_ value: String, forKey key: String, account: String?) async throws { try save(value, forKey: key, account: account) }
    func loadAsync(forKey key: String, account: String?) async -> String? { load(forKey: key, account: account) }
}
