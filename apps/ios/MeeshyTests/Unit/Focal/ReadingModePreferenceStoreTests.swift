import XCTest
@testable import Meeshy

/// F-080 (WS-1) — `ReadingModePreferenceStore` : round-trip par
/// `(scope, conversationId)`, défaut `.auto` (via `mode(for:) == nil`),
/// « revenir en mode auto » efface la clé, deux scopes distincts sur la
/// MÊME conversation ne se voient pas (fuite privacy multi-comptes du
/// 2026-05-26). JAMAIS `.standard` — suite `UserDefaults` isolée par test,
/// même convention que `LentilleFlagGateTests`/`ProviderSubstitutionTests`.
final class ReadingModePreferenceStoreTests: XCTestCase {

    private func withIsolatedDefaults(_ body: (UserDefaults) -> Void) {
        let suiteName = "ReadingModePreferenceStoreTests-\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suiteName)!
        body(defaults)
        defaults.removePersistentDomain(forName: suiteName)
    }

    // MARK: - Défaut auto

    func test_mode_neverSet_returnsNil() {
        withIsolatedDefaults { defaults in
            let store = ReadingModePreferenceStore(defaults: defaults)
            XCTAssertNil(store.mode(for: "c1", scope: .registered(userId: "u1")))
        }
    }

    // MARK: - Round-trip collant par conversation

    func test_setMode_thenMode_roundTrips() {
        withIsolatedDefaults { defaults in
            let store = ReadingModePreferenceStore(defaults: defaults)
            let scope = ReadingModePreferenceScope.registered(userId: "u1")

            store.setMode(.script, for: "c1", scope: scope)

            XCTAssertEqual(store.mode(for: "c1", scope: scope), .script)
        }
    }

    func test_setMode_onConversationA_doesNotChangeConversationB() {
        withIsolatedDefaults { defaults in
            let store = ReadingModePreferenceStore(defaults: defaults)
            let scope = ReadingModePreferenceScope.registered(userId: "u1")

            store.setMode(.script, for: "conversation-a", scope: scope)

            XCTAssertNil(store.mode(for: "conversation-b", scope: scope))
        }
    }

    func test_setMode_thenReinstantiatedStore_stillReadsScript() {
        withIsolatedDefaults { defaults in
            let scope = ReadingModePreferenceScope.registered(userId: "u1")
            ReadingModePreferenceStore(defaults: defaults).setMode(.script, for: "c1", scope: scope)

            let reloaded = ReadingModePreferenceStore(defaults: defaults)

            XCTAssertEqual(reloaded.mode(for: "c1", scope: scope), .script)
        }
    }

    // MARK: - Revenir en mode auto

    func test_setModeNil_clearsPreviouslySetMode() {
        withIsolatedDefaults { defaults in
            let store = ReadingModePreferenceStore(defaults: defaults)
            let scope = ReadingModePreferenceScope.registered(userId: "u1")
            store.setMode(.script, for: "c1", scope: scope)

            store.setMode(nil, for: "c1", scope: scope)

            XCTAssertNil(store.mode(for: "c1", scope: scope))
        }
    }

    // MARK: - Séparation stricte des scopes (fuite privacy 2026-05-26)

    func test_registeredAndAnonymousScope_sameConversation_doNotSeeEachOther() {
        withIsolatedDefaults { defaults in
            let store = ReadingModePreferenceStore(defaults: defaults)
            let registered = ReadingModePreferenceScope.registered(userId: "u1")
            let anonymous = ReadingModePreferenceScope.anonymous(participantId: "p1")

            store.setMode(.script, for: "c1", scope: registered)

            XCTAssertEqual(store.mode(for: "c1", scope: registered), .script)
            XCTAssertNil(store.mode(for: "c1", scope: anonymous))
        }
    }

    func test_twoDistinctAnonymousParticipants_sameConversation_doNotSeeEachOther() {
        withIsolatedDefaults { defaults in
            let store = ReadingModePreferenceStore(defaults: defaults)
            let participantA = ReadingModePreferenceScope.anonymous(participantId: "p1")
            let participantB = ReadingModePreferenceScope.anonymous(participantId: "p2")

            store.setMode(.focal, for: "c1", scope: participantA)

            XCTAssertEqual(store.mode(for: "c1", scope: participantA), .focal)
            XCTAssertNil(store.mode(for: "c1", scope: participantB))
        }
    }

    func test_anonymousScope_storageKey_neverContainsRawParticipantId() {
        let raw = "participant-super-secret-id"
        let key = ReadingModePreferenceScope.anonymous(participantId: raw).storageKey

        XCTAssertFalse(key.contains(raw), "l'identifiant invité brut ne doit jamais apparaître dans la clé de stockage")
    }

    // MARK: - lastOpenedAt / noteOpened (branche d'absence de l'orchestrateur)

    func test_lastOpenedAt_neverNoted_returnsNil() {
        withIsolatedDefaults { defaults in
            let store = ReadingModePreferenceStore(defaults: defaults)
            XCTAssertNil(store.lastOpenedAt(for: "c1", scope: .registered(userId: "u1")))
        }
    }

    func test_noteOpened_thenLastOpenedAt_roundTrips() {
        withIsolatedDefaults { defaults in
            let store = ReadingModePreferenceStore(defaults: defaults)
            let scope = ReadingModePreferenceScope.registered(userId: "u1")
            let date = Date(timeIntervalSince1970: 1_800_000_000)

            store.noteOpened("c1", scope: scope, at: date)

            XCTAssertEqual(
                store.lastOpenedAt(for: "c1", scope: scope)?.timeIntervalSince1970 ?? -1,
                date.timeIntervalSince1970,
                accuracy: 0.001
            )
        }
    }
}
