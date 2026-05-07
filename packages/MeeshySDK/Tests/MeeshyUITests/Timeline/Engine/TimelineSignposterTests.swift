import XCTest
@testable import MeeshyUI

final class TimelineSignposterTests: XCTestCase {

    func test_interval_returnsSyncResult() {
        let result = TimelineSignposter.interval("test_sync") { 42 }
        XCTAssertEqual(result, 42)
    }

    func test_interval_propagatesThrows() {
        struct E: Error {}
        XCTAssertThrowsError(try TimelineSignposter.interval("test_throw") { () -> Int in throw E() })
    }

    func test_intervalAsync_returnsAsyncResult() async {
        let result = await TimelineSignposter.intervalAsync("test_async") { 7 }
        XCTAssertEqual(result, 7)
    }

    func test_intervalAsync_propagatesThrows() async {
        struct E: Error {}
        do {
            _ = try await TimelineSignposter.intervalAsync("test_async_throw") { () async throws -> Int in throw E() }
            XCTFail("Expected throw")
        } catch is E {
            // OK
        } catch {
            XCTFail("Wrong error type: \(error)")
        }
    }
}
