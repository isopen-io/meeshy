import XCTest
@testable import MeeshySDK

/// Decoding tests for CallQualityAlertData — the struct published when the
/// gateway emits call:quality-alert (high RTT or packet loss from the remote peer).
final class CallQualityAlertEventTests: XCTestCase {

    private let decoder = JSONDecoder()

    func test_decode_allFields() throws {
        let json = """
        {
            "callId": "abc123abc123abc123abc123",
            "participantId": "pid456pid456pid456pid456",
            "metric": "rtt",
            "value": 450.0,
            "threshold": 300.0
        }
        """.data(using: .utf8)!

        let data = try decoder.decode(CallQualityAlertData.self, from: json)
        XCTAssertEqual(data.callId, "abc123abc123abc123abc123")
        XCTAssertEqual(data.participantId, "pid456pid456pid456pid456")
        XCTAssertEqual(data.metric, "rtt")
        XCTAssertEqual(data.value, 450.0, accuracy: 0.001)
        XCTAssertEqual(data.threshold, 300.0, accuracy: 0.001)
    }

    func test_decode_packetLossMetric() throws {
        let json = """
        {
            "callId": "aaa111aaa111aaa111aaa111",
            "participantId": "bbb222bbb222bbb222bbb222",
            "metric": "packetLoss",
            "value": 8.5,
            "threshold": 5.0
        }
        """.data(using: .utf8)!

        let data = try decoder.decode(CallQualityAlertData.self, from: json)
        XCTAssertEqual(data.metric, "packetLoss")
        XCTAssertEqual(data.value, 8.5, accuracy: 0.001)
    }

    func test_decode_bitrateMetric() throws {
        let json = """
        {
            "callId": "ccc333ccc333ccc333ccc333",
            "participantId": "ddd444ddd444ddd444ddd444",
            "metric": "bitrate",
            "value": 120000.0,
            "threshold": 150000.0
        }
        """.data(using: .utf8)!

        let data = try decoder.decode(CallQualityAlertData.self, from: json)
        XCTAssertEqual(data.metric, "bitrate")
        XCTAssertEqual(data.value, 120000.0, accuracy: 1.0)
    }

    func test_decode_missingSomeFields_throws() {
        let json = """
        {
            "callId": "aaa111aaa111aaa111aaa111",
            "metric": "rtt"
        }
        """.data(using: .utf8)!

        XCTAssertThrowsError(try decoder.decode(CallQualityAlertData.self, from: json))
    }
}
