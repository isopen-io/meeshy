import XCTest
import MeeshySDK
@testable import Meeshy

final class TaskSlotTests: XCTestCase {

    private func makeParkedTask(_ observed: Locked<Bool>) -> Task<Void, Never> {
        Task {
            while !Task.isCancelled { await Task.yield() }
            observed.mutate { $0 = true }
        }
    }

    private func waitUntil(_ condition: @Sendable () -> Bool) async {
        for _ in 0..<200 where !condition() {
            try? await Task.sleep(for: .milliseconds(10))
        }
    }

    func test_replace_cancelsThePreviousTask() async {
        let slot = TaskSlot()
        let first = Locked(false)
        slot.replace(with: makeParkedTask(first))
        slot.replace(with: Task {})
        await waitUntil { first.read { $0 } }
        XCTAssertTrue(first.read { $0 })
    }

    func test_cancel_cancelsTheHeldTaskAndEmptiesTheSlot() async {
        let slot = TaskSlot()
        let held = Locked(false)
        slot.replace(with: makeParkedTask(held))
        XCTAssertFalse(slot.isEmpty)
        slot.cancel()
        await waitUntil { held.read { $0 } }
        XCTAssertTrue(held.read { $0 })
        XCTAssertTrue(slot.isEmpty)
    }

    func test_deinit_cancelsTheHeldTask() async {
        let held = Locked(false)
        autoreleasepool {
            let slot = TaskSlot()
            slot.replace(with: makeParkedTask(held))
        }
        await waitUntil { held.read { $0 } }
        XCTAssertTrue(held.read { $0 })
    }

    func test_concurrentReplace_fromTaskGroupOf1000_leavesExactlyOneLiveTask() async {
        let slot = TaskSlot()
        let cancelled = Locked(0)
        await withTaskGroup(of: Void.self) { group in
            for _ in 0..<1000 {
                group.addTask {
                    slot.replace(with: Task {
                        while !Task.isCancelled { await Task.yield() }
                        cancelled.mutate { $0 += 1 }
                    })
                }
            }
        }
        await waitUntil { cancelled.read { $0 } >= 999 }
        XCTAssertEqual(cancelled.read { $0 }, 999)
        slot.cancel()
        await waitUntil { cancelled.read { $0 } == 1000 }
        XCTAssertEqual(cancelled.read { $0 }, 1000)
    }
}
