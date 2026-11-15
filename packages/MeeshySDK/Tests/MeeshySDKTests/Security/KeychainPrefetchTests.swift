import XCTest
@testable import MeeshySDK

/// #11587 — les lectures du trousseau du premier écran partent sur une file à
/// part dès le lancement du processus ; le fil principal ne fait plus que les
/// RAMASSER. Ces témoins tiennent ce qui rend ce ramassage sûr : une valeur
/// servie une seule fois, jamais périmée par une écriture, et un trousseau
/// indisponible (appareil pas encore déverrouillé) jamais pris pour un vide.
final class KeychainPrefetchTests: XCTestCase {

    private let queue = DispatchQueue(label: "KeychainPrefetchTests")

    private func plan(_ keys: [String], followUp: @escaping @Sendable ([String: KeychainRead]) -> [String] = { _ in [] }) -> KeychainPrefetchPlan {
        KeychainPrefetchPlan(keys: keys, followUp: followUp)
    }

    private func started(_ answers: [String: KeychainRead],
                         keys: [String],
                         reader: ReaderLog = ReaderLog(),
                         followUp: @escaping @Sendable ([String: KeychainRead]) -> [String] = { _ in [] },
                         waitLimit: DispatchTimeInterval = .seconds(2)) -> KeychainPrefetch {
        let prefetch = KeychainPrefetch(waitLimit: waitLimit)
        prefetch.start(plan(keys, followUp: followUp), on: queue, lifetime: .seconds(60)) { key in
            reader.record(key)
            return answers[key] ?? .absent
        }
        return prefetch
    }

    func test_take_servesThePrefetchedValue() {
        let sut = started(["k": .value("secret")], keys: ["k"])

        XCTAssertEqual(sut.take("k"), .value("secret"))
    }

    func test_take_servesEachValueOnce_thenLetsTheKeychainAnswer() {
        let sut = started(["k": .value("secret")], keys: ["k"])

        _ = sut.take("k")

        XCTAssertNil(sut.take("k"), "une seconde lecture va au trousseau, jamais à un instantané")
    }

    func test_take_ofAnAbsentEntry_saysAbsent() {
        let sut = started([:], keys: ["k"])

        XCTAssertEqual(sut.take("k"), .absent)
    }

    func test_take_ofAnUnavailableKeychain_isNeverServedAsAbsent() {
        let sut = started(["k": .unavailable], keys: ["k"])

        XCTAssertNil(sut.take("k"), "appareil verrouillé : la lecture directe décide, jamais un « absent » inventé")
    }

    func test_take_ofAKeyOutsideThePlan_letsTheKeychainAnswer() {
        let sut = started(["k": .value("secret")], keys: ["k"])

        XCTAssertNil(sut.take("other"))
    }

    func test_take_withoutAnyPrefetch_returnsImmediately() {
        let sut = KeychainPrefetch()

        XCTAssertNil(sut.take("k"))
    }

    func test_invalidate_dropsThePrefetchedValue() {
        let sut = started(["k": .value("old")], keys: ["k"])

        sut.invalidate("k")

        XCTAssertNil(sut.take("k"), "une écriture du processus rend l'instantané périmé")
    }

    func test_invalidateAll_dropsEveryPrefetchedValue() {
        let sut = started(["a": .value("1"), "b": .value("2")], keys: ["a", "b"])

        sut.invalidateAll()

        XCTAssertNil(sut.take("a"))
        XCTAssertNil(sut.take("b"))
    }

    func test_followUp_readsTheKeysThatDependOnTheFirstPass() {
        let reader = ReaderLog()
        let sut = started(
            ["active": .value("u1"), "token_u1": .value("jwt")],
            keys: ["active"],
            reader: reader,
            followUp: { found in
                guard case .value(let id)? = found["active"] else { return [] }
                return ["token_\(id)"]
            }
        )

        XCTAssertEqual(sut.take("token_u1"), .value("jwt"))
        XCTAssertEqual(reader.keys, ["active", "token_u1"])
    }

    func test_take_whileThePrefetchIsInFlight_waitsForItInsteadOfAnsweringNil() {
        let gate = DispatchSemaphore(value: 0)
        let sut = KeychainPrefetch(waitLimit: .seconds(5))
        sut.start(plan(["k"]), on: queue, lifetime: .seconds(60)) { _ in
            gate.wait()
            return .value("late")
        }
        DispatchQueue.global().asyncAfter(deadline: .now() + .milliseconds(100)) { gate.signal() }

        XCTAssertEqual(sut.take("k"), .value("late"))
    }

    func test_aWriteThatTimedOutWaiting_isNeverOverwrittenByTheLateSnapshot() {
        let gate = DispatchSemaphore(value: 0)
        let landed = expectation(description: "prefetch landed")
        let sut = KeychainPrefetch(waitLimit: .milliseconds(20))
        sut.start(plan(["k"]), on: queue, lifetime: .seconds(60)) { _ in
            gate.wait()
            return .value("stale")
        }

        sut.invalidate("k")
        gate.signal()
        queue.async { landed.fulfill() }
        wait(for: [landed], timeout: 2)

        XCTAssertNil(sut.take("k"), "la valeur lue avant l'écriture ne revient jamais")
    }

    func test_lifetime_discardsWhatNobodyTook() {
        let clock = TestClock()
        let sut = KeychainPrefetch(now: clock.now)
        sut.start(plan(["a", "b"]), on: queue, lifetime: .seconds(30)) { _ in .value("secret") }
        XCTAssertEqual(sut.take("a"), .value("secret"))

        clock.advance(by: 31)

        XCTAssertNil(sut.take("b"), "un secret ne reste pas en mémoire au-delà du démarrage")
        clock.rewind(by: 31)
        XCTAssertNil(sut.take("b"), "une réponse expirée est purgée, pas seulement masquée")
    }

    func test_lifetime_stillServesBeforeItEnds() {
        let clock = TestClock()
        let sut = KeychainPrefetch(now: clock.now)
        sut.start(plan(["k"]), on: queue, lifetime: .seconds(30)) { _ in .value("secret") }

        clock.advance(by: 29)

        XCTAssertEqual(sut.take("k"), .value("secret"))
    }

    func test_start_twice_readsTheKeychainOnce() {
        let reader = ReaderLog()
        let sut = started(["k": .value("v")], keys: ["k"], reader: reader)

        sut.start(plan(["k"]), on: queue, lifetime: .seconds(60)) { key in
            reader.record(key)
            return .value("v")
        }
        _ = sut.take("k")

        XCTAssertEqual(reader.keys, ["k"])
    }
}

/// #11587 — ce que le premier écran lit au trousseau : de quoi ouvrir la base
/// (sa clé, le compte actif), la liste des comptes, et la session du compte actif.
final class ColdStartKeychainPlanTests: XCTestCase {

    func test_firstPass_readsTheDatabaseKey_theActiveAccount_andTheAccountList() {
        XCTAssertEqual(
            Set(ColdStartKeychainPlan.plan.keys),
            [DatabaseEncryption.keychainKey, PersistedActiveUser.key, AuthStorageKeys.savedAccounts]
        )
    }

    func test_followUp_ofAnActiveAccount_readsItsSession() {
        let keys = ColdStartKeychainPlan.plan.followUp([PersistedActiveUser.key: .value("u1")])

        XCTAssertEqual(Set(keys), [
            AuthStorageKeys.token(for: "u1"),
            AuthStorageKeys.sessionToken(for: "u1"),
            AuthStorageKeys.user(for: "u1"),
            AuthStorageKeys.pendingProfile(for: "u1"),
        ])
    }

    func test_followUp_withoutActiveAccount_readsTheLegacyGlobalKeysTheMigrationLooksFor() {
        let keys = ColdStartKeychainPlan.plan.followUp([PersistedActiveUser.key: .absent])

        XCTAssertEqual(Set(keys), [AuthStorageKeys.legacyToken, AuthStorageKeys.legacyUser])
    }

    func test_followUp_ofALockedKeychain_readsNothingMore() {
        XCTAssertEqual(ColdStartKeychainPlan.plan.followUp([PersistedActiveUser.key: .unavailable]), [])
    }
}

final class ReaderLog: Sendable {
    private let recorded = Locked<[String]>([])

    func record(_ key: String) {
        recorded.mutate { $0.append(key) }
    }

    var keys: [String] { recorded.read { $0 } }
}

final class TestClock: Sendable {
    private let current = Locked(Date(timeIntervalSinceReferenceDate: 0))

    var now: @Sendable () -> Date { { [current] in current.read { $0 } } }

    func advance(by seconds: TimeInterval) {
        current.mutate { $0 = $0.addingTimeInterval(seconds) }
    }

    func rewind(by seconds: TimeInterval) {
        advance(by: -seconds)
    }
}
