import XCTest
@testable import MeeshySDK

/// `SettingsActionQueue` is a singleton actor with no injectable init (matches
/// `OfflineQueue`'s test convention) — every test drives the real
/// `.shared` instance through `setFlushHandler` + `clearAll()` reset hooks.
final class SettingsActionQueueTests: XCTestCase {

    private var queue: SettingsActionQueue { SettingsActionQueue.shared }

    override func setUp() async throws {
        await queue.clearAll()
    }

    override func tearDown() async throws {
        await queue.clearAll()
        await queue.setFlushHandler { _ in true }
    }

    private func makeAction(endpoint: String = "/users/me") -> SettingsAction {
        SettingsAction(endpoint: endpoint, httpMethod: "PATCH", payload: Data("{}".utf8))
    }

    // MARK: - Happy path

    func test_flushIfPossible_handlerSucceeds_removesItem() async {
        await queue.enqueue(makeAction())
        await queue.setFlushHandler { _ in true }

        await queue.flushIfPossible()

        XCTAssertEqual(queue.count, 0)
    }

    // MARK: - Transient failure (below maxAttempts)

    func test_flushIfPossible_handlerFails_keepsItemQueued_belowMaxAttempts() async {
        await queue.enqueue(makeAction())
        await queue.setFlushHandler { _ in false }

        await queue.flushIfPossible()

        XCTAssertEqual(queue.count, 1, "A single failure must keep the item queued for retry")
    }

    func test_flushIfPossible_repeatedFailures_stayQueued_untilMaxAttempts() async {
        await queue.enqueue(makeAction())
        await queue.setFlushHandler { _ in false }

        for _ in 0..<4 {
            await queue.flushIfPossible()
        }

        XCTAssertEqual(queue.count, 1, "4 failures must not yet exhaust the item (maxAttempts is 5)")
    }

    // MARK: - Permanent failure (maxAttempts + drop) — the P2 fix

    func test_flushIfPossible_afterMaxAttempts_dropsPermanentlyFailingItem() async {
        await queue.enqueue(makeAction())
        await queue.setFlushHandler { _ in false }

        for _ in 0..<5 {
            await queue.flushIfPossible()
        }

        XCTAssertEqual(queue.count, 0,
            "A permanently-failing item must be dropped after maxAttempts, not block the queue forever")
    }

    func test_flushIfPossible_dropsExhaustedHead_thenDrainsRestInSamePass() async {
        let stale = makeAction(endpoint: "/dead-endpoint")
        let fresh = makeAction(endpoint: "/users/me")
        await queue.enqueue(stale)
        await queue.enqueue(fresh)
        await queue.setFlushHandler { $0.endpoint == "/dead-endpoint" ? false : true }

        // First 4 attempts: `stale` (the FIFO head) fails but isn't exhausted
        // yet — the old `break`-on-first-failure behavior blocks `fresh` from
        // ever being tried, even though its handler would succeed instantly.
        for _ in 0..<4 {
            await queue.flushIfPossible()
        }
        XCTAssertEqual(queue.count, 2, "FIFO still blocks fresh while stale hasn't hit maxAttempts")

        // The 5th attempt exhausts `stale` — it must be dropped AND `fresh`
        // must be processed in this SAME pass, not wait for a 6th flush call.
        await queue.flushIfPossible()

        XCTAssertEqual(queue.count, 0,
            "Dropping the exhausted head must let the rest of the queue drain immediately")
    }

    // MARK: - enqueue() replacement resets the failure budget

    func test_enqueue_replacingSameEndpoint_resetsFailureBudget() async {
        await queue.enqueue(makeAction(endpoint: "/users/me"))
        await queue.setFlushHandler { _ in false }

        for _ in 0..<4 {
            await queue.flushIfPossible()
        }
        XCTAssertEqual(queue.count, 1, "Still queued — one attempt short of exhaustion")

        // A fresh edit for the SAME endpoint replaces the pending row with a
        // brand-new id (existing last-write-wins behavior).
        await queue.enqueue(makeAction(endpoint: "/users/me"))
        XCTAssertEqual(queue.count, 1)

        // One more failure must NOT exhaust the replacement — it has its own
        // fresh budget, not the 4 failures already accrued by the old row.
        await queue.flushIfPossible()

        XCTAssertEqual(queue.count, 1,
            "The replacement item must not inherit the old item's failure count")
    }
}
