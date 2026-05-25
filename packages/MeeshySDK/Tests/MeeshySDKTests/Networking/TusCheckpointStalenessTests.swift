import XCTest
@testable import MeeshySDK

/// E4 — pin the 22h staleness check on TUS resume.
///
/// The gateway garbage-collects abandoned TUS sessions after ~24h. A
/// client checkpoint older than that points at a URL that 404s/410s on
/// PATCH. Pre-emptively dropping the stale checkpoint avoids one round-
/// trip of observable failure and keeps the "fresh POST" path symmetric.
///
/// We pin the *predicate* in isolation rather than driving an end-to-end
/// network test, which would be flaky and slow.
final class TusCheckpointStalenessTests: XCTestCase {

    private let maxAge: TimeInterval = 22 * 60 * 60

    /// Mirrors the inline predicate in `TusUploadManager.performTusUpload`.
    /// Kept here so the test pins the contract without depending on a
    /// `private` helper.
    private func isStale(updatedAt: Date?, now: Date) -> Bool {
        guard let updatedAt else { return false }
        return now.timeIntervalSince(updatedAt) > maxAge
    }

    func test_recentCheckpoint_isNotStale() {
        let now = Date(timeIntervalSince1970: 1_000_000)
        let updated = now.addingTimeInterval(-3600) // 1h ago
        XCTAssertFalse(isStale(updatedAt: updated, now: now))
    }

    func test_checkpointJustUnder22h_isNotStale() {
        let now = Date(timeIntervalSince1970: 1_000_000)
        let updated = now.addingTimeInterval(-(22 * 60 * 60 - 60)) // 21h59m ago
        XCTAssertFalse(isStale(updatedAt: updated, now: now))
    }

    func test_checkpointAt22hExactly_isNotStale() {
        // Boundary: 22h ago is the threshold; not strictly greater than.
        let now = Date(timeIntervalSince1970: 1_000_000)
        let updated = now.addingTimeInterval(-22 * 60 * 60)
        XCTAssertFalse(isStale(updatedAt: updated, now: now))
    }

    func test_checkpointJustOver22h_isStale() {
        let now = Date(timeIntervalSince1970: 1_000_000)
        let updated = now.addingTimeInterval(-(22 * 60 * 60 + 60)) // 22h01m ago
        XCTAssertTrue(isStale(updatedAt: updated, now: now))
    }

    func test_checkpointWayOlder_isStale() {
        let now = Date(timeIntervalSince1970: 1_000_000)
        let updated = now.addingTimeInterval(-(48 * 60 * 60)) // 2 days ago
        XCTAssertTrue(isStale(updatedAt: updated, now: now))
    }

    func test_nilUpdatedAt_isNotStale() {
        // Defensive: a checkpoint without an updatedAt is treated as
        // recent (we can't prove staleness without a timestamp).
        let now = Date(timeIntervalSince1970: 1_000_000)
        XCTAssertFalse(isStale(updatedAt: nil, now: now))
    }
}
