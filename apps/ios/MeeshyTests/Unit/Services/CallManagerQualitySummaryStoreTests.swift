import XCTest
@testable import Meeshy

@MainActor
final class CallManagerQualitySummaryStoreTests: XCTestCase {

    private func makeDefaults() -> UserDefaults {
        let name = "CallQualitySummaryStoreTests-\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: name) ?? .standard
        defaults.removePersistentDomain(forName: name)
        return defaults
    }

    func test_read_withoutPersistedValue_returnsNil() {
        let store = CallQualitySummaryStore(defaults: makeDefaults())

        XCTAssertNil(store.read())
    }

    func test_persistThenRead_roundTripsUnderLegacyKey() throws {
        let defaults = makeDefaults()
        let store = CallQualitySummaryStore(defaults: defaults)

        store.persist(stats: nil, callId: "c1", duration: 12, remote: "alice", reason: .local)

        XCTAssertEqual(CallQualitySummaryStore.defaultsKey, "me.meeshy.lastCallQualitySummary")
        let data = try XCTUnwrap(defaults.data(forKey: "me.meeshy.lastCallQualitySummary"))
        let object = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
        XCTAssertEqual(object["callId"] as? String, "c1")
        XCTAssertEqual(object["remoteUser"] as? String, "alice")
        XCTAssertEqual(object["durationSeconds"] as? Double, 12)
        XCTAssertEqual(object["endReason"] as? String, String(describing: CallEndReason.local))
        let summary = try XCTUnwrap(store.read())
        XCTAssertEqual(summary.callId, "c1")
        XCTAssertEqual(summary.remoteUser, "alice")
    }

    func test_read_withCorruptData_returnsNil() {
        let defaults = makeDefaults()
        defaults.set(Data("not json".utf8), forKey: CallQualitySummaryStore.defaultsKey)

        XCTAssertNil(CallQualitySummaryStore(defaults: defaults).read())
    }
}
