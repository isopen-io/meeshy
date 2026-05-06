import XCTest
@testable import MeeshySDK

final class KeychainAsyncTests: XCTestCase {

    func test_loadAsync_returnsValue_whenSet() async throws {
        let key = "test.async.\(UUID().uuidString)"
        let manager = KeychainManager.shared
        try manager.save("hello", forKey: key)
        defer { manager.delete(forKey: key) }

        let value = await manager.loadAsync(forKey: key)
        XCTAssertEqual(value, "hello")
    }

    func test_loadAsync_returnsNil_whenAbsent() async {
        let value = await KeychainManager.shared.loadAsync(forKey: "missing.\(UUID().uuidString)")
        XCTAssertNil(value)
    }

    func test_saveAsync_persists_acrossCalls() async throws {
        let key = "test.saveAsync.\(UUID().uuidString)"
        let manager = KeychainManager.shared
        defer { manager.delete(forKey: key) }

        try await manager.saveAsync("world", forKey: key)
        let value = await manager.loadAsync(forKey: key)
        XCTAssertEqual(value, "world")
    }
}
