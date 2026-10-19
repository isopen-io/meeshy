import XCTest
@testable import MeeshySDK

final class CancellableWaitersTests: XCTestCase {

    func test_cancelledSuspendedTask_returnsCancelledValueQuicklyAndLeavesNoWaiter() async {
        let waiters = CancellableWaiters<Bool>()
        let ticket = waiters.enroll()
        let task = Task { await waiters.suspendCancellable(ticket, cancelledValue: false) }
        _ = await cancellableSleep(for: .milliseconds(20))
        let started = ContinuousClock.now
        task.cancel()
        let value = await task.value
        XCTAssertFalse(value)
        XCTAssertLessThan(ContinuousClock.now - started, .milliseconds(100))
        XCTAssertEqual(waiters.liveCount, 0)
    }

    func test_resolveAll_wakesEveryWaiter() async {
        let waiters = CancellableWaiters<Bool>()
        let tickets = (0..<3).map { _ in waiters.enroll() }
        let tasks = tickets.map { ticket in
            Task { await waiters.suspendCancellable(ticket, cancelledValue: false) }
        }
        _ = await cancellableSleep(for: .milliseconds(20))
        waiters.resolveAll(with: true)
        var results: [Bool] = []
        for task in tasks { results.append(await task.value) }
        XCTAssertEqual(results, [true, true, true])
        XCTAssertTrue(waiters.isEmpty)
    }

    func test_alreadyCancelledTask_returnsCancelledValueWithoutSuspending() async {
        let waiters = CancellableWaiters<Bool>()
        let task = Task { () -> Bool in
            while !Task.isCancelled { await Task.yield() }
            let ticket = waiters.enroll()
            return await waiters.suspendCancellable(ticket, cancelledValue: false)
        }
        task.cancel()
        let value = await task.value
        XCTAssertFalse(value)
        XCTAssertEqual(waiters.liveCount, 0)
    }

    func test_resolveLatest_handsOnlyToTheNewestLiveWaiter() async {
        let waiters = CancellableWaiters<Bool>()
        let older = waiters.enroll()
        let newer = waiters.enroll()
        let olderTask = Task { await waiters.suspendCancellable(older, cancelledValue: false) }
        let newerTask = Task { await waiters.suspendCancellable(newer, cancelledValue: false) }
        _ = await cancellableSleep(for: .milliseconds(20))
        XCTAssertTrue(waiters.resolveLatest(with: true))
        let newerTaskOutcome = await newerTask.value
        XCTAssertTrue(newerTaskOutcome)
        XCTAssertEqual(waiters.liveCount, 1)
        olderTask.cancel()
        let olderTaskOutcome = await olderTask.value
        XCTAssertFalse(olderTaskOutcome)
    }
}
