import XCTest
@testable import MeeshySDK

/// #9804 — une story vue reste vue à travers un démarrage à froid : le
/// registre survit à une NOUVELLE instance lue sur le même stockage.
final class StoryViewedLedgerTests: XCTestCase {

    private func makeDefaults() -> (UserDefaults, String) {
        let suite = "StoryViewedLedgerTests-\(UUID().uuidString)"
        return (UserDefaults(suiteName: suite)!, suite)
    }

    func test_record_survivesANewInstanceOnTheSameStorage() {
        let (defaults, suite) = makeDefaults()
        defer { defaults.removePersistentDomain(forName: suite) }
        let viewedAt = Date()

        StoryViewedLedger(userDefaults: defaults).record(storyId: "s1", ownerId: "me", at: viewedAt)
        let relaunched = StoryViewedLedger(userDefaults: defaults)

        XCTAssertEqual(relaunched.viewedStories(ownerId: "me")["s1"]?.timeIntervalSince1970 ?? 0,
                       viewedAt.timeIntervalSince1970, accuracy: 0.001,
                       "La vue doit être relue par l'instance d'un démarrage à froid")
    }

    func test_viewsOfOneAccount_neverLeakToAnother() {
        let (defaults, suite) = makeDefaults()
        defer { defaults.removePersistentDomain(forName: suite) }
        let ledger = StoryViewedLedger(userDefaults: defaults)

        ledger.record(storyId: "s1", ownerId: "alice", at: Date())

        XCTAssertTrue(ledger.viewedStories(ownerId: "bob").isEmpty,
                      "La vue d'un compte n'éteint pas l'anneau d'un autre compte du même appareil")
    }

    func test_reviewingLater_keepsTheMostRecentView() {
        let first = Date(timeIntervalSince1970: 1_000)
        let later = Date(timeIntervalSince1970: 2_000)
        let entries = StoryViewedEntries()
            .recording(storyId: "s1", ownerId: "me", at: later)
            .recording(storyId: "s1", ownerId: "me", at: first)

        XCTAssertEqual(entries.viewedStories(ownerId: "me")["s1"], later,
                       "Une vue après édition doit rester la référence — jamais remplacée par une plus ancienne")
    }

    func test_viewsOlderThanRetention_areForgottenAtLoad() {
        let (defaults, suite) = makeDefaults()
        defer { defaults.removePersistentDomain(forName: suite) }
        let now = Date()
        let stale = now.addingTimeInterval(-StoryViewedLedger.retention - 60)
        let fresh = now.addingTimeInterval(-60)
        let ledger = StoryViewedLedger(userDefaults: defaults, now: { stale.addingTimeInterval(1) })
        ledger.record(storyId: "old", ownerId: "me", at: stale)
        ledger.record(storyId: "new", ownerId: "me", at: fresh)

        let relaunched = StoryViewedLedger(userDefaults: defaults, now: { now })

        XCTAssertEqual(Set(relaunched.viewedStories(ownerId: "me").keys), ["new"],
                       "Le registre est borné : une story morte depuis la rétention n'y reste pas")
    }
}
