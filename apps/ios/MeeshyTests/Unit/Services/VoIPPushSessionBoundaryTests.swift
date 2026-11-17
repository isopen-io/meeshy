import XCTest
@testable import Meeshy
@testable import MeeshySDK

/// ios-systeme-3 (#18911) — côté VoIP : l'enregistrement du jeton du compte
/// SORTANT, encore en vol quand `unregisterAndClearToken()` s'exécute, ne grave ni
/// cooldown ni jeton « enregistré » que le compte ENTRANT hériterait, et n'empêche
/// pas son propre POST. Quand une session reste ouverte, un POST suit la réponse
/// périmée : la passerelle garde le dernier reçu.
@MainActor
final class VoIPPushSessionBoundaryTests: XCTestCase {

    private final class HeldFirstVoIPRegistrar: VoIPTokenRegistering, @unchecked Sendable {
        private let lock = NSLock()
        private var _count = 0
        private var _events: [String] = []
        private var held: CheckedContinuation<Void, Never>?
        private var releasedEarly = false

        var registerCallCount: Int { lock.withLock { _count } }
        var events: [String] { lock.withLock { _events } }

        func register(_ body: RegisterDeviceTokenRequest) async throws {
            let index = lock.withLock { () -> Int in
                _count += 1
                _events.append("start:\(_count)")
                return _count
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

    private final class AuthFlag: @unchecked Sendable {
        var value = true
    }

    private func makeSUT(
        registrar: HeldFirstVoIPRegistrar,
        authenticated: AuthFlag = AuthFlag(),
        registrationsInFlight: PushRegistrationsInFlight = PushRegistrationsInFlight()
    ) -> (sut: VoIPPushManager, store: MockVoIPTokenStore) {
        let store = MockVoIPTokenStore()
        let sut = VoIPPushManager(
            tokenStore: store,
            registrar: registrar,
            authTokenAvailable: { authenticated.value },
            deviceIdentity: {
                PushDeviceIdentity(deviceId: "install-test", deviceName: "iPhone", appVersion: "1.0 (1)", bundleId: "me.meeshy.app")
            },
            registrationsInFlight: registrationsInFlight
        )
        return (sut, store)
    }

    private func waitUntil(_ condition: () -> Bool) async {
        var turns = 0
        while !condition(), turns < 500 {
            turns += 1
            try? await Task.sleep(for: .milliseconds(10))
        }
    }

    func test_registerTokenWithBackend_afterLogoutWhilePostInFlight_staleResponseLeavesNoCooldownBehind() async {
        let registrar = HeldFirstVoIPRegistrar()
        let (sut, store) = makeSUT(registrar: registrar)

        let accountAPost = Task { await sut.debug_registerTokenWithBackend("voip-T") }
        await waitUntil { registrar.registerCallCount == 1 }
        await sut.unregisterAndClearToken()
        registrar.releaseFirst()
        await accountAPost.value

        XCTAssertNil(sut.debug_lastRegisteredRecord, "la réponse de A ne grave pas de cooldown pour B")
        XCTAssertNil(store.snapshot(), "ni de jeton « enregistré » au trousseau")

        await sut.debug_registerTokenWithBackend("voip-T")

        XCTAssertEqual(registrar.registerCallCount, 2, "B enregistre le même jeton : son POST n'est pas sauté")
    }

    func test_registerTokenWithBackend_staleResponseWithASessionLeft_postsAgainAfterIt() async {
        let registrar = HeldFirstVoIPRegistrar()
        let (sut, _) = makeSUT(registrar: registrar)

        let accountAPost = Task { await sut.debug_registerTokenWithBackend("voip-T") }
        await waitUntil { registrar.registerCallCount == 1 }
        await sut.unregisterAndClearToken()
        sut.debug_setVoIPToken("voip-T")
        registrar.releaseFirst()
        await accountAPost.value

        let afterAccountAResponse = registrar.events.drop { $0 != "end:1" }
        XCTAssertTrue(afterAccountAResponse.contains { $0.hasPrefix("start:") },
                      "un POST part APRÈS la réponse de A, sous la session courante. Événements : \(registrar.events)")
    }

    func test_registerTokenWithBackend_staleResponseAfterTheNextAccountPosted_postsAgainDespiteTheCooldown() async {
        let registrar = HeldFirstVoIPRegistrar()
        let (sut, _) = makeSUT(registrar: registrar)

        let accountAPost = Task { await sut.debug_registerTokenWithBackend("voip-T") }
        await waitUntil { registrar.registerCallCount == 1 }
        await sut.unregisterAndClearToken()
        sut.debug_setVoIPToken("voip-T")
        await sut.debug_registerTokenWithBackend("voip-T")
        registrar.releaseFirst()
        await accountAPost.value

        let afterAccountAResponse = registrar.events.drop { $0 != "end:1" }
        XCTAssertTrue(afterAccountAResponse.contains { $0.hasPrefix("start:") },
                      "le POST de B a armé le cooldown, mais la passerelle a pu traiter celui de A après : le rejeu passe outre. Événements : \(registrar.events)")
    }

    // MARK: - Audit du lot : rendre son jeton à une session rouverte, suivre le vol

    /// Le retrait différé d'une session précédente du même compte a pu effacer la
    /// ligne VoIP que la passerelle tenait : le jeton est reposté malgré le cooldown.
    func test_restoreRegistration_withinTheCooldown_postsTheKnownTokenAgain() async {
        let registrar = HeldFirstVoIPRegistrar()
        registrar.releaseFirst()
        let (sut, _) = makeSUT(registrar: registrar)
        sut.debug_setVoIPToken("voip-T")
        await sut.debug_registerTokenWithBackend("voip-T")

        await sut.restoreRegistration()

        XCTAssertEqual(registrar.registerCallCount, 2, "sinon B ne reçoit plus d'appels jusqu'au prochain démarrage à froid")
    }

    func test_restoreRegistration_withoutAKnownToken_postsNothing() async {
        let registrar = HeldFirstVoIPRegistrar()
        let (sut, _) = makeSUT(registrar: registrar)

        await sut.restoreRegistration()

        XCTAssertEqual(registrar.registerCallCount, 0, "PushKit livrera le jeton, et son POST partira alors")
    }

    func test_registerTokenWithBackend_isTrackedAsInFlightUntilItsResponse() async {
        let registrar = HeldFirstVoIPRegistrar()
        let flights = PushRegistrationsInFlight()
        let (sut, _) = makeSUT(registrar: registrar, registrationsInFlight: flights)

        let post = Task { await sut.debug_registerTokenWithBackend("voip-T") }
        await waitUntil { registrar.registerCallCount == 1 }
        XCTAssertFalse(flights.isEmpty, "la sortie de session doit savoir qu'un POST VoIP est en vol")

        registrar.releaseFirst()
        await post.value
        XCTAssertTrue(flights.isEmpty)
    }

    func test_shared_offersItsRestorationToTheSessionExit() {
        _ = VoIPPushManager.shared

        XCTAssertFalse(PushRegistrationRestorers.shared.isEmpty,
                       "le retrait différé d'une session précédente doit pouvoir rendre le jeton VoIP à la session ouverte")
    }
}
