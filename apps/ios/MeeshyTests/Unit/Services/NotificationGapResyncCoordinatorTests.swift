import XCTest
import Combine
@testable import Meeshy
@testable import MeeshySDK

/// Compteur thread-safe pour la closure `@Sendable` de resync.
private actor ResyncCounter {
    private(set) var count = 0
    func increment() { count += 1 }
}

/// SyncEngine A5.3 — le coordinateur app-side abonne `SyncSeqTracker.gapDetected`
/// et déclenche une resync (idempotente) des notifications sur trou détecté.
@MainActor
final class NotificationGapResyncCoordinatorTests: XCTestCase {

    /// Attend (borné) que le compteur atteigne `target`, robuste au débounce +
    /// aux hops de queue (vs un `Task.sleep` fixe fragile).
    private func waitForCount(_ counter: ResyncCounter, toReach target: Int, timeout: TimeInterval = 2.0) async -> Int {
        let deadline = Date().addingTimeInterval(timeout)
        while Date() < deadline {
            if await counter.count >= target { break }
            try? await Task.sleep(nanoseconds: 20_000_000)
        }
        return await counter.count
    }

    func test_gapEmission_triggersResync_once() async {
        let tracker = SyncSeqTracker()
        let counter = ResyncCounter()
        let sut = NotificationGapResyncCoordinator(
            gapPublisher: tracker.gapDetected.publisher,
            debounce: 0.05,
            resync: { await counter.increment() }
        )
        sut.start()

        // Premier event (pas de gap) puis un trou → une seule resync.
        _ = await tracker.observe(5)
        _ = await tracker.observe(9)

        let count = await waitForCount(counter, toReach: 1)
        XCTAssertEqual(count, 1, "un gap détecté doit déclencher exactement une resync")
    }

    func test_contiguousSeq_doesNotResync() async {
        let tracker = SyncSeqTracker()
        let counter = ResyncCounter()
        let sut = NotificationGapResyncCoordinator(
            gapPublisher: tracker.gapDetected.publisher,
            debounce: 0.05,
            resync: { await counter.increment() }
        )
        sut.start()

        _ = await tracker.observe(5)
        _ = await tracker.observe(6)
        _ = await tracker.observe(7)

        try? await Task.sleep(nanoseconds: 250_000_000)
        let count = await counter.count
        XCTAssertEqual(count, 0, "des seq contigus ne déclenchent aucune resync")
    }

    func test_burstOfGaps_coalescesToOneResync() async {
        let tracker = SyncSeqTracker()
        let counter = ResyncCounter()
        let sut = NotificationGapResyncCoordinator(
            gapPublisher: tracker.gapDetected.publisher,
            debounce: 0.15,
            resync: { await counter.increment() }
        )
        sut.start()

        _ = await tracker.observe(5)
        _ = await tracker.observe(9)   // gap
        _ = await tracker.observe(20)  // gap
        _ = await tracker.observe(40)  // gap

        let count = await waitForCount(counter, toReach: 1)
        // Laisse une fenêtre APRÈS la 1re resync pour prouver qu'aucune 2e ne suit.
        try? await Task.sleep(nanoseconds: 300_000_000)
        let final = await counter.count
        XCTAssertEqual(count, 1)
        XCTAssertEqual(final, 1, "une rafale de gaps doit être coalescée en une seule resync")
    }
}
