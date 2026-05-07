import XCTest
import Combine
@testable import MeeshySDK

/// Tests for `NetworkMonitorProviding` protocol + `NetworkMonitor.isOnline` convenience.
///
/// The existing `NetworkMonitorTests.swift` covers singleton identity and ConnectionType.
/// These tests cover the new protocol contract added for offline-first dependency injection.
@MainActor
final class NetworkMonitorProviderTests: XCTestCase {

    // MARK: - Protocol conformance

    func test_networkMonitor_conformsToNetworkMonitorProviding() {
        let monitor: NetworkMonitorProviding = NetworkMonitor.shared
        XCTAssertNotNil(monitor)
    }

    func test_networkMonitor_isOnline_invertsIsOffline() {
        let monitor = NetworkMonitor.shared
        // isOnline must be the logical inverse of isOffline
        XCTAssertEqual(monitor.isOnline, !monitor.isOffline,
                       "isOnline must equal !isOffline at any given instant")
    }

    // MARK: - Published isOnline publisher (Combine)

    func test_networkMonitor_published_isOffline_emitsInitialValue() async throws {
        let monitor = NetworkMonitor.shared
        let exp = expectation(description: "$isOffline emits at least once")
        var count = 0
        let cancellable = monitor.$isOffline.sink { _ in
            count += 1
            if count >= 1 { exp.fulfill() }
        }
        await fulfillment(of: [exp], timeout: 1.0)
        cancellable.cancel()
        XCTAssertGreaterThanOrEqual(count, 1, "$isOffline must emit the initial value on subscribe")
    }

    // MARK: - MockNetworkMonitor usable as NetworkMonitorProviding

    func test_mockNetworkMonitor_canBeUsedAsProviding() {
        let mock = MockNetworkMonitor()
        let providing: NetworkMonitorProviding = mock
        mock.isOnline = false
        XCTAssertFalse(providing.isOnline)
        mock.isOnline = true
        XCTAssertTrue(providing.isOnline)
    }
}

// MARK: - Inline test double (canonical location is Mocks/ but also usable here)

/// Minimal test double declared locally for NetworkMonitorProviderTests.
/// The authoritative `MockNetworkMonitor` lives in `Mocks/MockNetworkMonitor.swift`.
private final class MockNetworkMonitor: NetworkMonitorProviding, @unchecked Sendable {
    var isOnline: Bool = true
}
