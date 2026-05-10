import XCTest
@testable import Meeshy

final class QualityThresholdsHeartbeatTests: XCTestCase {

    func test_heartbeatIntervalSeconds_is10() {
        // Phase 1 fix P1: 5s/15s was too aggressive on cellular (RTT 800ms+).
        // SOTA WhatsApp/Telegram parity: 10s heartbeat.
        // Reference §5.12.
        XCTAssertEqual(QualityThresholds.heartbeatIntervalSeconds, 10.0)
    }

    func test_heartbeatLostThresholdSeconds_is30() {
        // 3 missed beats (~30s) marks heartbeat as lost.
        XCTAssertEqual(QualityThresholds.heartbeatLostThresholdSeconds, 30.0)
    }

    func test_heartbeatAckTimeoutSeconds_is5() {
        // Phase 1 fix P10: cellular RTT worst-case ~3-4s, 5s ACK timeout.
        XCTAssertEqual(QualityThresholds.heartbeatAckTimeoutSeconds, 5.0)
    }
}
