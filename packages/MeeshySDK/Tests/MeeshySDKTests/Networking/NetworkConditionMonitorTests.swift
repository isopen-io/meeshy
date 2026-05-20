import XCTest
import Network
@testable import MeeshySDK

final class NetworkConditionMonitorTests: XCTestCase {

    func test_resolve_offline_returnsOffline() {
        let condition = NetworkConditionMonitor.resolveFromFlags(
            isSatisfied: false,
            isConstrained: false,
            isExpensive: false,
            usesWiFi: false,
            usesCellular: false
        )
        XCTAssertEqual(condition, .offline)
    }

    func test_resolve_wifiUnconstrained_returnsWifi() {
        let condition = NetworkConditionMonitor.resolveFromFlags(
            isSatisfied: true,
            isConstrained: false,
            isExpensive: false,
            usesWiFi: true,
            usesCellular: false
        )
        XCTAssertEqual(condition, .wifi)
    }

    func test_resolve_wifiConstrained_returnsBadCellular() {
        let condition = NetworkConditionMonitor.resolveFromFlags(
            isSatisfied: true,
            isConstrained: true,
            isExpensive: false,
            usesWiFi: true,
            usesCellular: false
        )
        XCTAssertEqual(condition, .badCellular)
    }

    func test_resolve_cellularUnconstrained_returnsGoodCellular() {
        let condition = NetworkConditionMonitor.resolveFromFlags(
            isSatisfied: true,
            isConstrained: false,
            isExpensive: true,
            usesWiFi: false,
            usesCellular: true
        )
        XCTAssertEqual(condition, .goodCellular)
    }

    func test_resolve_cellularConstrained_returnsBadCellular() {
        let condition = NetworkConditionMonitor.resolveFromFlags(
            isSatisfied: true,
            isConstrained: true,
            isExpensive: true,
            usesWiFi: false,
            usesCellular: true
        )
        XCTAssertEqual(condition, .badCellular)
    }

    func test_resolve_ethernetUnconstrained_returnsWifi() {
        let condition = NetworkConditionMonitor.resolveFromFlags(
            isSatisfied: true,
            isConstrained: false,
            isExpensive: false,
            usesWiFi: false,
            usesCellular: false
        )
        XCTAssertEqual(condition, .wifi)
    }
}
