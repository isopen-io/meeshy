import XCTest
@testable import Meeshy

/// A4 — pins time-windowed dedup semantics for VoIP push callIds.
///
/// The legacy ring kept the last 12 callIds without timestamps. A jittery
/// network burst of 13+ retries within a few seconds evicted real entries
/// and produced phantom CallKit cards. Switching to a TTL-bounded ring
/// closes that hole while still allowing reuse of callIds across genuinely
/// separate calls.
@MainActor
final class VoIPDedupRingTests: XCTestCase {

    // MARK: - Empty

    func test_emptyRing_doesNotContainAnyCallId() {
        var ring = VoIPDedupRing()
        XCTAssertFalse(ring.contains("c1", now: Date()))
    }

    // MARK: - Insert + contains

    func test_insertedCallId_isFoundWithinTTL() {
        var ring = VoIPDedupRing(capacity: 10, ttl: 30)
        let t0 = Date(timeIntervalSince1970: 1_000_000)
        ring.insert("c1", now: t0)
        XCTAssertTrue(ring.contains("c1", now: t0.addingTimeInterval(5)))
        XCTAssertTrue(ring.contains("c1", now: t0.addingTimeInterval(29.9)))
    }

    func test_expiredCallId_isNotFoundAfterTTL() {
        var ring = VoIPDedupRing(capacity: 10, ttl: 30)
        let t0 = Date(timeIntervalSince1970: 1_000_000)
        ring.insert("c1", now: t0)
        XCTAssertFalse(ring.contains("c1", now: t0.addingTimeInterval(30.1)))
        XCTAssertFalse(ring.contains("c1", now: t0.addingTimeInterval(60)))
    }

    // MARK: - Burst tolerance (the original bug)

    func test_burstOf20CallIds_doesNotEvictWithinTTL() {
        var ring = VoIPDedupRing(capacity: 24, ttl: 30)
        let t0 = Date(timeIntervalSince1970: 1_000_000)
        for i in 0..<20 {
            ring.insert("c\(i)", now: t0.addingTimeInterval(Double(i) * 0.1))
        }
        // All 20 should still be present (capacity 24, all within 2s)
        for i in 0..<20 {
            XCTAssertTrue(
                ring.contains("c\(i)", now: t0.addingTimeInterval(2)),
                "c\(i) should still be deduped within TTL window"
            )
        }
    }

    func test_capacityOverflow_evictsOldestEntry() {
        var ring = VoIPDedupRing(capacity: 3, ttl: 30)
        let t0 = Date(timeIntervalSince1970: 1_000_000)
        ring.insert("c1", now: t0)
        ring.insert("c2", now: t0.addingTimeInterval(0.1))
        ring.insert("c3", now: t0.addingTimeInterval(0.2))
        ring.insert("c4", now: t0.addingTimeInterval(0.3))
        // c1 should have been evicted to make room for c4
        XCTAssertFalse(ring.contains("c1", now: t0.addingTimeInterval(0.4)))
        XCTAssertTrue(ring.contains("c2", now: t0.addingTimeInterval(0.4)))
        XCTAssertTrue(ring.contains("c3", now: t0.addingTimeInterval(0.4)))
        XCTAssertTrue(ring.contains("c4", now: t0.addingTimeInterval(0.4)))
    }

    // MARK: - Re-insert refreshes timestamp

    func test_reinsertingSameCallId_refreshesTimestamp() {
        var ring = VoIPDedupRing(capacity: 10, ttl: 30)
        let t0 = Date(timeIntervalSince1970: 1_000_000)
        ring.insert("c1", now: t0)
        ring.insert("c1", now: t0.addingTimeInterval(25))
        // At t0 + 50s, the second insert is 25s old (within TTL of 30s)
        // → still deduped.
        XCTAssertTrue(ring.contains("c1", now: t0.addingTimeInterval(50)))
        XCTAssertFalse(ring.contains("c1", now: t0.addingTimeInterval(60)))
    }

    func test_reinsertingSameCallId_keepsSingleEntry() {
        var ring = VoIPDedupRing(capacity: 10, ttl: 30)
        let t0 = Date(timeIntervalSince1970: 1_000_000)
        ring.insert("c1", now: t0)
        ring.insert("c1", now: t0.addingTimeInterval(1))
        ring.insert("c1", now: t0.addingTimeInterval(2))
        XCTAssertEqual(ring.count, 1)
    }

    // MARK: - Expired entries are purged

    func test_purge_removesExpiredEntries_onContains() {
        var ring = VoIPDedupRing(capacity: 10, ttl: 30)
        let t0 = Date(timeIntervalSince1970: 1_000_000)
        ring.insert("c1", now: t0)
        ring.insert("c2", now: t0.addingTimeInterval(1))
        XCTAssertEqual(ring.count, 2)
        // contains() purges as a side effect
        _ = ring.contains("anything", now: t0.addingTimeInterval(60))
        XCTAssertEqual(ring.count, 0)
    }

    // MARK: - Real call after TTL

    func test_genuinelyNewCallWithSameId_afterTTL_isNotDeduped() {
        // Edge case: a callId is reused across two separate sessions
        // hours apart. The second should NOT be silently dropped.
        var ring = VoIPDedupRing(capacity: 10, ttl: 30)
        let t0 = Date(timeIntervalSince1970: 1_000_000)
        ring.insert("c1", now: t0)
        XCTAssertFalse(ring.contains("c1", now: t0.addingTimeInterval(3600)))
    }

    // MARK: - Insert also purges

    func test_insert_alsoRemovesExpiredEntries() {
        // insert() calls purgeExpired() before appending, so old entries are
        // evicted on any write — not only on contains(). This matters under
        // capacity pressure: without purge-on-insert the capacity check fires
        // and drops the oldest (possibly still live) entry.
        var ring = VoIPDedupRing(capacity: 10, ttl: 30)
        let t0 = Date(timeIntervalSince1970: 1_000_000)
        ring.insert("c1", now: t0)
        ring.insert("c2", now: t0.addingTimeInterval(1))
        XCTAssertEqual(ring.count, 2)
        // Inserting at t0+60 (beyond 30s TTL) should purge c1 and c2 first.
        ring.insert("c3", now: t0.addingTimeInterval(60))
        XCTAssertEqual(ring.count, 1, "Expired entries must be purged by insert(), leaving only c3")
        XCTAssertTrue(ring.contains("c3", now: t0.addingTimeInterval(60)))
    }

    // MARK: - Eviction on CallKit report failure

    func test_remove_evictsCallId_soASubsequentPushIsNotDeduped() {
        var ring = VoIPDedupRing(capacity: 10, ttl: 30)
        let t0 = Date(timeIntervalSince1970: 1_000_000)
        ring.insert("c1", now: t0)
        XCTAssertTrue(ring.contains("c1", now: t0.addingTimeInterval(1)))

        ring.remove("c1")

        XCTAssertFalse(
            ring.contains("c1", now: t0.addingTimeInterval(2)),
            "After CallKit refuses reportNewIncomingCall, evicting the callId must let a genuine APNs retry re-ring instead of being phantom-acked as a duplicate"
        )
    }

    func test_remove_unknownCallId_isNoOp() {
        var ring = VoIPDedupRing(capacity: 10, ttl: 30)
        let t0 = Date(timeIntervalSince1970: 1_000_000)
        ring.insert("c1", now: t0)
        ring.remove("does-not-exist")
        XCTAssertTrue(ring.contains("c1", now: t0.addingTimeInterval(1)))
        XCTAssertEqual(ring.count, 1)
    }

    func test_remove_onlyRemovesMatchingCallId_leavesOthersIntact() {
        var ring = VoIPDedupRing(capacity: 10, ttl: 30)
        let t0 = Date(timeIntervalSince1970: 1_000_000)
        ring.insert("c1", now: t0)
        ring.insert("c2", now: t0.addingTimeInterval(1))
        ring.remove("c1")
        XCTAssertFalse(ring.contains("c1", now: t0.addingTimeInterval(2)))
        XCTAssertTrue(ring.contains("c2", now: t0.addingTimeInterval(2)))
    }
}
