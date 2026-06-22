import XCTest
@testable import Meeshy

/// A6 — pin `withTaskTimeout` race semantics.
///
/// Used by FeedView + FeedCommentsSheet heart-toggle to guarantee the
/// in-flight Set is always released (rollback path) even when the underlying
/// network call hangs forever. Without this helper, a stalled
/// SocialSocketManager left the heart button locked until app kill.
@MainActor
final class TaskTimeoutTests: XCTestCase {

    func test_fastOperation_returnsResultBeforeDeadline() async throws {
        let result = try await withTaskTimeout(seconds: 1.0) {
            return 42
        }
        XCTAssertEqual(result, 42)
    }

    func test_slowOperation_throwsTimeoutError() async {
        do {
            _ = try await withTaskTimeout(seconds: 0.05) {
                try await Task.sleep(nanoseconds: 500_000_000)
                return "should not return"
            }
            XCTFail("Expected TaskTimeoutError")
        } catch let error as TaskTimeoutError {
            XCTAssertEqual(error.seconds, 0.05)
        } catch {
            XCTFail("Expected TaskTimeoutError, got \(error)")
        }
    }

    func test_operationThrowingError_propagatesOriginalError() async {
        struct OriginalError: Error, Equatable {}
        do {
            _ = try await withTaskTimeout(seconds: 1.0) { () throws -> String in
                throw OriginalError()
            }
            XCTFail("Expected OriginalError to propagate")
        } catch is OriginalError {
            // success
        } catch {
            XCTFail("Expected OriginalError, got \(error)")
        }
    }

    func test_timeoutErrorEquality() {
        XCTAssertEqual(TaskTimeoutError(seconds: 5), TaskTimeoutError(seconds: 5))
        XCTAssertNotEqual(TaskTimeoutError(seconds: 5), TaskTimeoutError(seconds: 10))
    }
}
