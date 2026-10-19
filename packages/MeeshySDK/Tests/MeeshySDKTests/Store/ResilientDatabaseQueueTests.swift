import XCTest
import GRDB
@testable import MeeshySDK

final class ResilientDatabaseQueueTests: XCTestCase {

    private struct OpenFailure: Error {}

    private func persistentPath() -> String {
        FileManager.default.temporaryDirectory
            .appendingPathComponent("resilient-\(UUID().uuidString).db").path
    }

    func test_open_whenDiskSucceeds_isPersistent() {
        let opened = ResilientDatabaseQueue.open(path: persistentPath())
        guard case .persistent = opened else { return XCTFail("expected .persistent, got \(opened)") }
    }

    func test_open_withoutPath_isPersistentInMemoryQueue() {
        let opened = ResilientDatabaseQueue.open(path: nil)
        XCTAssertNotNil(opened.queue)
    }

    func test_open_whenDiskFails_fallsBackToMemory_andCarriesTheDiskError() {
        let opened = ResilientDatabaseQueue.open(
            path: "/unused",
            openDisk: { _ in throw OpenFailure() },
            openMemory: { try DatabaseQueue() }
        )
        guard case .memoryFallback(_, let diskError) = opened else { return XCTFail("expected .memoryFallback") }
        XCTAssertFalse(diskError.isEmpty)
        XCTAssertNotNil(opened.queue)
    }

    func test_open_whenDiskAndMemoryFail_isUnavailable_withoutTrapping() {
        let opened = ResilientDatabaseQueue.open(
            path: "/unused",
            openDisk: { _ in throw OpenFailure() },
            openMemory: { throw OpenFailure() }
        )
        guard case .unavailable(let diskError, let memoryError) = opened else { return XCTFail("expected .unavailable") }
        XCTAssertFalse(diskError.isEmpty)
        XCTAssertFalse(memoryError.isEmpty)
        XCTAssertNil(opened.queue)
    }

    func test_open_withoutPath_andMemoryFailure_isUnavailable() {
        let opened = ResilientDatabaseQueue.open(
            path: nil,
            openDisk: { _ in throw OpenFailure() },
            openMemory: { throw OpenFailure() }
        )
        XCTAssertNil(opened.queue)
    }
}
