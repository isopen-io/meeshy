import XCTest
@testable import Meeshy

final class CallManagerAnalyticsRecorderTests: XCTestCase {

    private let payloadKeys: Set<String> = [
        "setupTimeMs", "negotiationTimeMs", "durationSeconds", "reconnectionCount",
        "networkTransitions", "averageRtt", "averagePacketLoss", "maxPacketLoss", "codec",
        "effectsUsed", "filtersUsed", "transcriptionUsed", "qualityDistribution", "platform",
        "deviceModel", "isVideo", "endReason"
    ]

    private func makePayload(_ recorder: CallAnalyticsRecorder, endReason: String = "local") -> [String: Any] {
        recorder.payload(
            now: Date(timeIntervalSince1970: 1_000),
            context: CallAnalyticsContext(
                callDuration: 42,
                codec: "opus",
                filtersEnabledNow: false,
                transcriptionUsed: true,
                deviceModel: "iPhone",
                isVideo: true,
                endReason: endReason
            )
        )
    }

    func test_payload_afterSamples_emitsSameSeventeenKeysWithAverages() {
        var recorder = CallAnalyticsRecorder()
        let t0 = Date(timeIntervalSince1970: 100)
        recorder.recordSample(level: .excellent, roundTripTimeMs: 100, packetLossPercent: 1, at: t0)
        recorder.recordSample(level: .good, roundTripTimeMs: 200, packetLossPercent: 3, at: t0.addingTimeInterval(5))
        recorder.recordSample(level: .good, roundTripTimeMs: 300, packetLossPercent: 2, at: t0.addingTimeInterval(10))
        recorder.totalReconnects += 1
        recorder.networkTransitions += 1

        let payload = makePayload(recorder)

        XCTAssertEqual(Set(payload.keys), payloadKeys)
        XCTAssertEqual(payload["averageRtt"] as? Double, 200)
        XCTAssertEqual(payload["averagePacketLoss"] as? Double, 2)
        XCTAssertEqual(payload["maxPacketLoss"] as? Double, 3)
        XCTAssertEqual(payload["reconnectionCount"] as? Int, 1)
        XCTAssertEqual(payload["networkTransitions"] as? Int, 1)
        XCTAssertEqual(payload["platform"] as? String, "ios")
        XCTAssertEqual(payload["endReason"] as? String, "local")
        XCTAssertEqual(payload["durationSeconds"] as? TimeInterval, 42)
        XCTAssertEqual(payload["codec"] as? String, "opus")
    }

    func test_payload_withoutSamples_averagesAreZero() {
        let payload = makePayload(CallAnalyticsRecorder())

        XCTAssertEqual(payload["averageRtt"] as? Double, 0)
        XCTAssertEqual(payload["averagePacketLoss"] as? Double, 0)
    }

    func test_payload_filtersUsed_isStickyOrLive() {
        var recorder = CallAnalyticsRecorder()
        recorder.recordFilterUsage(faceEffectName: nil, colorFilter: true, backgroundBlur: false, skinSmoothing: false)

        XCTAssertEqual(makePayload(recorder)["filtersUsed"] as? Bool, true)
        XCTAssertEqual(Set(makePayload(recorder)["effectsUsed"] as? [String] ?? []), ["colorFilter"])
    }

    func test_recordFilterUsage_collectsEveryActiveEffect() {
        var recorder = CallAnalyticsRecorder()
        recorder.recordFilterUsage(faceEffectName: "glasses", colorFilter: false, backgroundBlur: true, skinSmoothing: true)

        XCTAssertEqual(recorder.effectsUsed, ["glasses", "backgroundBlur", "skinSmoothing"])
        XCTAssertFalse(recorder.videoFiltersUsed)
    }

    func test_resetAccumulators_keepsTotalReconnectsOnly() {
        var recorder = CallAnalyticsRecorder()
        recorder.callInitiatedDate = Date()
        recorder.networkTransitions = 4
        recorder.recordSample(level: .good, roundTripTimeMs: 10, packetLossPercent: 1, at: Date())
        recorder.totalReconnects = 2

        recorder.resetAccumulators()

        var expected = CallAnalyticsRecorder()
        expected.totalReconnects = 2
        XCTAssertEqual(recorder, expected)
    }

    func test_reset_afterCall_returnsInitialValue() {
        var recorder = CallAnalyticsRecorder()
        recorder.totalReconnects = 3
        recorder.networkTransitions = 1

        recorder.reset()

        XCTAssertEqual(recorder, CallAnalyticsRecorder())
    }
}
