import XCTest
@testable import MeeshySDK

@MainActor
final class BoundedAsyncResolutionTests: XCTestCase {

    func test_operationFinishingBeforeTimeout_returnsItsValue() async {
        let value = await BoundedAsyncResolution.resolve({ "ok" }, timeout: .seconds(2))
        XCTAssertEqual(value, "ok")
    }

    func test_slowOperation_givesNilAtTimeout_andItsLateResultIsIgnored() async {
        let started = ContinuousClock.now
        let value = await BoundedAsyncResolution.resolve({
            _ = await cancellableSleep(for: .milliseconds(300))
            return "late"
        }, timeout: .milliseconds(50))
        XCTAssertNil(value)
        XCTAssertLessThan(ContinuousClock.now - started, .milliseconds(250))
        _ = await cancellableSleep(for: .milliseconds(400))
    }

    func test_cancellingTheCaller_returnsNilWithoutWaitingForTheTimeout() async {
        let caller = Task { @MainActor in
            await BoundedAsyncResolution.resolve({
                _ = await cancellableSleep(for: .seconds(5))
                return "never"
            }, timeout: .seconds(5))
        }
        _ = await cancellableSleep(for: .milliseconds(30))
        let started = ContinuousClock.now
        caller.cancel()
        let value = await caller.value
        XCTAssertNil(value)
        XCTAssertLessThan(ContinuousClock.now - started, .milliseconds(100))
    }

    func test_callerAlreadyCancelled_returnsNilAtOnce() async {
        let caller = Task { @MainActor () -> String? in
            while !Task.isCancelled { await Task.yield() }
            return await BoundedAsyncResolution.resolve({
                _ = await cancellableSleep(for: .seconds(5))
                return "never"
            }, timeout: .seconds(5))
        }
        caller.cancel()
        let started = ContinuousClock.now
        let value = await caller.value
        XCTAssertNil(value)
        XCTAssertLessThan(ContinuousClock.now - started, .milliseconds(200))
    }
}
