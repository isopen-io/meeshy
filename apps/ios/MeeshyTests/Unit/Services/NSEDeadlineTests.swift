import XCTest
import os

final class NSEDeadlineTests: XCTestCase {

    func test_fastOperation_returnsItsValue() async {
        let value = await NSEDeadline.race(timeout: 1) { 42 }

        XCTAssertEqual(value, 42)
    }

    func test_slowOperation_returnsNil_andIsCancelled() async {
        let wasCancelled = OSAllocatedUnfairLock(initialState: false)

        let value: Int? = await NSEDeadline.race(timeout: 0.05) {
            await withTaskCancellationHandler {
                await withCheckedContinuation { (_: CheckedContinuation<Int, Never>) in }
            } onCancel: {
                wasCancelled.withLock { $0 = true }
            }
        }

        XCTAssertNil(value)
        XCTAssertTrue(wasCancelled.withLock { $0 })
    }

    func test_zeroTimeout_returnsNilWithoutRunningPastTheDeadline() async {
        let started = OSAllocatedUnfairLock(initialState: false)

        let value: Int? = await NSEDeadline.race(timeout: 0) {
            started.withLock { $0 = true }
            return 1
        }

        XCTAssertNil(value)
        XCTAssertFalse(started.withLock { $0 })
    }

    func test_parentCancellation_returnsNilPromptly() async throws {
        let wasCancelled = OSAllocatedUnfairLock(initialState: false)
        let parent = Task { () -> Int? in
            await NSEDeadline.race(timeout: 60) {
                await withTaskCancellationHandler {
                    await withCheckedContinuation { (_: CheckedContinuation<Int, Never>) in }
                } onCancel: {
                    wasCancelled.withLock { $0 = true }
                }
            }
        }
        try await Task.sleep(for: .milliseconds(50))

        parent.cancel()
        let value = await parent.value

        XCTAssertNil(value)
        XCTAssertTrue(wasCancelled.withLock { $0 })
    }
}
