import XCTest
@testable import MeeshySDK

final class KeychainAsyncTests: XCTestCase {

    /// Pure-SPM test bundles run without a Team identifier / app entitlements,
    /// so the iOS Simulator Keychain returns errSecMissingEntitlement (-34018)
    /// for SecItemAdd. Skip the round-trip tests in that environment — these
    /// are exercised via the host app's UI tests instead.
    private func skipIfKeychainUnavailable() throws {
        let probeKey = "keychain_probe_\(UUID().uuidString)"
        do {
            try KeychainManager.shared.save("probe", forKey: probeKey)
            KeychainManager.shared.delete(forKey: probeKey)
        } catch KeychainError.saveFailed(let status) where status == -34018 {
            throw XCTSkip("Keychain unavailable in pure-SPM xctest environment (errSecMissingEntitlement). Validated via app-hosted UI tests.")
        }
    }

    func test_loadAsync_returnsValue_whenSet() async throws {
        try skipIfKeychainUnavailable()
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
        try skipIfKeychainUnavailable()
        let key = "test.saveAsync.\(UUID().uuidString)"
        let manager = KeychainManager.shared
        defer { manager.delete(forKey: key) }

        try await manager.saveAsync("world", forKey: key)
        let value = await manager.loadAsync(forKey: key)
        XCTAssertEqual(value, "world")
    }
}
