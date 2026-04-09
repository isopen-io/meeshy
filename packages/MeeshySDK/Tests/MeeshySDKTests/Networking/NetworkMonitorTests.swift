import XCTest
@testable import MeeshySDK

final class NetworkMonitorTests: XCTestCase {

    // MARK: - Singleton

    func test_shared_returnsSameInstance() {
        let a = NetworkMonitor.shared
        let b = NetworkMonitor.shared
        XCTAssertTrue(a === b)
    }

    // MARK: - Initial State

    func test_connectionType_initialValue_isValid() {
        let monitor = NetworkMonitor.shared
        let validTypes: [NetworkMonitor.ConnectionType] = [.wifi, .cellular, .wired, .unknown]
        XCTAssertTrue(validTypes.contains(monitor.connectionType))
    }

    func test_isOffline_initialValue_isBool() {
        let monitor = NetworkMonitor.shared
        // isOffline is a Bool — just verify it can be read without crashing
        _ = monitor.isOffline
    }

    // MARK: - ConnectionType

    func test_connectionType_wifi_rawValue() {
        XCTAssertEqual(NetworkMonitor.ConnectionType.wifi.rawValue, "wifi")
    }

    func test_connectionType_cellular_rawValue() {
        XCTAssertEqual(NetworkMonitor.ConnectionType.cellular.rawValue, "cellular")
    }

    func test_connectionType_wired_rawValue() {
        XCTAssertEqual(NetworkMonitor.ConnectionType.wired.rawValue, "wired")
    }

    func test_connectionType_unknown_rawValue() {
        XCTAssertEqual(NetworkMonitor.ConnectionType.unknown.rawValue, "unknown")
    }

    // MARK: - ObservableObject

    func test_shared_conformsToObservableObject() {
        let monitor: any ObservableObject = NetworkMonitor.shared
        XCTAssertNotNil(monitor)
    }
}
