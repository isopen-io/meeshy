import XCTest
@testable import MeeshySDK

private func makeLimit(_ limit: Int) -> DailyGestureLimit {
    DailyGestureLimit(gesture: .comment, resetAt: nil, limit: limit)
}

final class LockedSweepLedgersConcurrencyTests: XCTestCase {

    func test_record_concurrentPastCapacity_keepsAtMostCapacity_andTakeIsOneShot() async {
        let ledger = DailyGestureLimitLedger()
        await withTaskGroup(of: Void.self) { group in
            for index in 0..<500 {
                group.addTask { ledger.record(makeLimit(index), clientMutationId: "m\(index)") }
            }
        }

        let taken = (0..<500).compactMap { ledger.take(clientMutationId: "m\($0)") }
        XCTAssertLessThanOrEqual(taken.count, 64)
        XCTAssertGreaterThan(taken.count, 0)
        XCTAssertTrue((0..<500).allSatisfy { ledger.take(clientMutationId: "m\($0)") == nil })
    }

    func test_note_concurrentSurfaces_listingFindsEveryPage() async {
        let ledger = ListingContextLedger()
        let surfaces = ReachSurface.allCases
        await withTaskGroup(of: Void.self) { group in
            for (offset, surface) in surfaces.enumerated() {
                group.addTask {
                    ledger.note(surface: surface, feedRequestId: "page-\(offset)", items: [ListedItem(id: "post-\(offset)")])
                }
            }
        }

        for (offset, surface) in surfaces.enumerated() {
            let listing = ledger.listing(on: surface, postId: "post-\(offset)", position: nil)
            XCTAssertEqual(listing?.feedRequestId, "page-\(offset)")
        }
    }

    func test_reset_afterConcurrentNotes_forgetsEverything() async {
        let ledger = ListingContextLedger()
        await withTaskGroup(of: Void.self) { group in
            for index in 0..<200 {
                group.addTask {
                    ledger.note(surface: .feed, feedRequestId: "p\(index)", items: [ListedItem(id: "post-\(index)")])
                }
            }
        }
        ledger.reset()

        XCTAssertNil(ledger.listing(on: .feed, postId: "post-0", position: nil))
    }

    func test_cancel_afterConcurrentRegister_cancelsEveryRegisteredTask() async {
        let dispatches = OutboxInflightDispatches()
        let tasks = (0..<100).map { _ in Task<Void, Error> { try await Task.sleep(nanoseconds: 60_000_000_000) } }
        await withTaskGroup(of: Void.self) { group in
            for (index, task) in tasks.enumerated() {
                group.addTask { dispatches.register(task, for: "row-\(index)") }
            }
        }

        (0..<100).forEach { dispatches.cancel("row-\($0)") }

        XCTAssertTrue(tasks.allSatisfy(\.isCancelled))
    }

    func test_unregister_foreignTask_leavesTheRegisteredOneCancellable() {
        let dispatches = OutboxInflightDispatches()
        let registered = Task<Void, Error> { try await Task.sleep(nanoseconds: 60_000_000_000) }
        let foreign = Task<Void, Error> { try await Task.sleep(nanoseconds: 60_000_000_000) }
        defer { registered.cancel(); foreign.cancel() }
        dispatches.register(registered, for: "row")

        dispatches.unregister(foreign, for: "row")
        dispatches.cancel("row")

        XCTAssertTrue(registered.isCancelled)
    }
}
