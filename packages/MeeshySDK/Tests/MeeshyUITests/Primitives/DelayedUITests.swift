import XCTest
import SwiftUI
import MeeshySDK
@testable import MeeshyUI

private enum TestSaveState: Equatable, Sendable {
    case idle, saving, saved, failed
}

private actor SleepLedger {
    private(set) var durations: [Duration] = []
    func record(_ duration: Duration) { durations.append(duration) }
}

private func makeSleep(ledger: SleepLedger, result: Bool) -> @Sendable (Duration) async -> Bool {
    { duration in
        await ledger.record(duration)
        return result
    }
}

@MainActor
private final class Counter {
    private(set) var value = 0
    func increment() { value += 1 }
    nonisolated deinit {}
}

@MainActor
final class DelayedUITests: XCTestCase {

    func test_performAfter_sleepsTheExactDelayThenPerformsOnce() async {
        let ledger = SleepLedger()
        var count = 0

        let outcome = await DelayedUI.perform(
            after: .milliseconds(300),
            sleep: makeSleep(ledger: ledger, result: true)
        ) { count += 1 }

        let durations = await ledger.durations
        XCTAssertEqual(durations, [.milliseconds(300)])
        XCTAssertEqual(count, 1)
        XCTAssertEqual(outcome, .performed)
    }

    func test_performAfter_interruptedSleep_neverPerforms() async {
        let ledger = SleepLedger()
        var count = 0

        let outcome = await DelayedUI.perform(
            after: .seconds(1),
            sleep: makeSleep(ledger: ledger, result: false)
        ) { count += 1 }

        XCTAssertEqual(count, 0)
        XCTAssertEqual(outcome, .cancelled)
    }

    func test_performAfter_realSleep_cancelledTask_returnsAtOnceWithoutPerforming() async {
        let counter = Counter()
        let task = Task { @MainActor in
            await DelayedUI.perform(after: .seconds(30)) { counter.increment() }
        }
        task.cancel()

        let outcome = await task.value

        XCTAssertEqual(outcome, .cancelled)
        XCTAssertEqual(counter.value, 0)
    }

    func test_settle_valueAtRest_neitherSleepsNorApplies() async {
        let ledger = SleepLedger()
        var applied = 0

        let outcome = await DelayedUI.settle(
            TestSaveState.idle, to: .idle, after: .seconds(2),
            sleep: makeSleep(ledger: ledger, result: true)
        ) { applied += 1 }

        let durations = await ledger.durations
        XCTAssertTrue(durations.isEmpty)
        XCTAssertEqual(applied, 0)
        XCTAssertEqual(outcome, .skipped)
    }

    func test_settle_predicateExcludesValue_skips() async {
        let ledger = SleepLedger()
        var applied = 0

        let outcome = await DelayedUI.settle(
            TestSaveState.saving, to: .idle, after: .seconds(2),
            when: { $0 == .saved || $0 == .failed },
            sleep: makeSleep(ledger: ledger, result: true)
        ) { applied += 1 }

        let durations = await ledger.durations
        XCTAssertTrue(durations.isEmpty)
        XCTAssertEqual(applied, 0)
        XCTAssertEqual(outcome, .skipped)
    }

    func test_settle_transientValue_appliesRestingAfterExactDelay() async {
        let ledger = SleepLedger()
        var applied = 0

        let outcome = await DelayedUI.settle(
            TestSaveState.saved, to: .idle, after: .seconds(2),
            when: { $0 == .saved || $0 == .failed },
            sleep: makeSleep(ledger: ledger, result: true)
        ) { applied += 1 }

        let durations = await ledger.durations
        XCTAssertEqual(durations, [.seconds(2)])
        XCTAssertEqual(applied, 1)
        XCTAssertEqual(outcome, .settled)
    }
}
