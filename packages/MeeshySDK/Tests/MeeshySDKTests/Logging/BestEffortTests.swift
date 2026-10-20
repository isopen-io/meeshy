import XCTest
@testable import MeeshySDK

final class BestEffortTests: XCTestCase {

    private struct StubError: Error {}

    private func throwingSync() throws -> Int { throw StubError() }

    private func throwingAsync() async throws -> Int { throw StubError() }

    func test_bestEffort_operationSucceeds_returnsValueAndRecordsNothing() {
        let spy = SpyErrorRecorder()

        let value = bestEffort("ctx", recorder: spy) { 42 }

        XCTAssertEqual(value, 42)
        XCTAssertTrue(spy.failures.isEmpty)
    }

    func test_bestEffort_operationThrows_returnsNilAndRecordsContextCategoryAndErrorType() {
        let spy = SpyErrorRecorder()

        let value = bestEffort("ctx", recorder: spy) { try throwingSync() }

        XCTAssertNil(value)
        XCTAssertEqual(spy.failures.count, 1)
        XCTAssertEqual(spy.failures.first?.context, "ctx")
        XCTAssertEqual(spy.failures.first?.category, .grdb)
        XCTAssertTrue(spy.failures.first?.errorType.contains("StubError") ?? false)
    }

    func test_bestEffort_explicitCategory_isRecorded() {
        let spy = SpyErrorRecorder()

        _ = bestEffort("ctx", category: .cache, recorder: spy) { try throwingSync() }

        XCTAssertEqual(spy.failures.first?.category, .cache)
    }

    func test_bestEffortAsync_operationThrows_returnsNilAndRecordsOnce() async {
        let spy = SpyErrorRecorder()

        let value = await bestEffort("ctx", recorder: spy) { try await throwingAsync() }

        XCTAssertNil(value)
        XCTAssertEqual(spy.failures.count, 1)
        XCTAssertEqual(spy.failures.first?.context, "ctx")
    }

    func test_bestEffortAsync_operationSucceeds_returnsValue() async {
        let spy = SpyErrorRecorder()

        let value = await bestEffort("ctx", recorder: spy) { () async throws -> Int in 7 }

        XCTAssertEqual(value, 7)
        XCTAssertTrue(spy.failures.isEmpty)
    }

    func test_bestEffort_cancellationError_returnsNilAndRecordsNothing() {
        let spy = SpyErrorRecorder()

        let value = bestEffort("ctx", recorder: spy) { () throws -> Int in throw CancellationError() }

        XCTAssertNil(value)
        XCTAssertTrue(spy.failures.isEmpty)
    }

    func test_bestEffortAsync_cancellationError_returnsNilAndRecordsNothing() async {
        let spy = SpyErrorRecorder()

        let value = await bestEffort("ctx", recorder: spy) { () async throws -> Int in throw CancellationError() }

        XCTAssertNil(value)
        XCTAssertTrue(spy.failures.isEmpty)
    }

    func test_record_forwardsFailureWithCategoryToRecorder() {
        let spy = SpyErrorRecorder()

        MeeshyLog.record(StubError(), context: "x", category: .cache, recorder: spy)

        XCTAssertEqual(spy.failures.count, 1)
        XCTAssertEqual(spy.failures.first?.context, "x")
        XCTAssertEqual(spy.failures.first?.category, .cache)
    }
}
