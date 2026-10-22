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

    // MARK: - #11294 — les gels se mesurent, un MOS les résume

    private static func entry(_ id: String, _ type: String, kind: String? = nil,
                              values: [String: Double] = [:], strings: [String: String] = [:]) -> CallStats.RawEntry {
        CallStats.RawEntry(id: id, type: type, kind: kind, values: values, strings: strings)
    }

    func test_mediaQuality_readsFreezesRetransmissionsConcealmentAndLimitation() {
        let qualite = CallMediaQuality.reduce(entries: [
            Self.entry("v", "inbound-rtp", kind: "video", values: [
                "freezeCount": 3, "totalFreezesDuration": 1.5, "framesPerSecond": 24, "nackCount": 12, "pliCount": 2,
            ]),
            Self.entry("a", "inbound-rtp", kind: "audio", values: [
                "concealedSamples": 4800, "jitterBufferDelay": 6, "jitterBufferEmittedCount": 100,
            ]),
            Self.entry("o", "outbound-rtp", kind: "video", strings: ["qualityLimitationReason": "bandwidth"]),
        ])

        XCTAssertEqual(qualite.freezeCount, 3)
        XCTAssertEqual(qualite.totalFreezesDuration, 1.5)
        XCTAssertEqual(qualite.framesPerSecond, 24)
        XCTAssertEqual(qualite.nackCount, 12)
        XCTAssertEqual(qualite.pliCount, 2)
        XCTAssertEqual(qualite.concealedSamples, 4800)
        XCTAssertEqual(qualite.jitterBufferDelayMs ?? 0, 60, accuracy: 0.001, "6 s cumulées sur 100 émissions = 60 ms")
        XCTAssertEqual(qualite.qualityLimitationReason, "bandwidth")
    }

    func test_mediaQuality_withoutTheseStats_isEmpty() {
        let qualite = CallMediaQuality.reduce(entries: [Self.entry("a", "inbound-rtp", kind: "audio")])

        XCTAssertEqual(qualite, .none)
        XCTAssertNil(qualite.jitterBufferDelayMs, "aucune émission : pas de délai à moyenner")
    }

    func test_reduce_carriesTheMediaQuality() {
        let stats = CallStats.reduce(entries: [
            Self.entry("v", "inbound-rtp", kind: "video", values: ["freezeCount": 2]),
        ])

        XCTAssertEqual(stats.mediaQuality.freezeCount, 2)
    }

    /// Un client qui n'a rien mesuré n'invente rien : le rapport garde ses
    /// dix-sept champs, les nouveaux sont optionnels côté passerelle (#11277).
    func test_payload_withoutMediaSamples_addsNoQualityField() {
        var recorder = CallAnalyticsRecorder()
        recorder.recordSample(level: .good, roundTripTimeMs: 100, packetLossPercent: 1, at: Date())

        XCTAssertEqual(Set(makePayload(recorder).keys), payloadKeys)
    }

    func test_payload_afterMediaSamples_carriesFreezesAndAMos() {
        var recorder = CallAnalyticsRecorder()
        let t0 = Date(timeIntervalSince1970: 100)
        recorder.recordSample(level: .good, roundTripTimeMs: 200, packetLossPercent: 2, at: t0)
        recorder.recordMedia(Self.quality(freezes: 1, reason: "cpu"), jitterMs: 20)
        recorder.recordMedia(Self.quality(freezes: 4, reason: "bandwidth"), jitterMs: 20)
        recorder.recordMedia(Self.quality(freezes: 4, reason: "bandwidth"), jitterMs: 20)

        let payload = makePayload(recorder)

        XCTAssertEqual(payload["freezeCount"] as? Int, 4, "les compteurs sont cumulés par WebRTC : le dernier relevé fait foi")
        XCTAssertEqual(payload["totalFreezesDuration"] as? Double, 2)
        XCTAssertEqual(payload["nackCount"] as? Int, 5)
        XCTAssertEqual(payload["pliCount"] as? Int, 1)
        XCTAssertEqual(payload["concealedSamples"] as? Int, 480)
        XCTAssertEqual(payload["jitterBufferDelay"] as? Double, 40)
        XCTAssertEqual(payload["qualityLimitationReason"] as? String, "bandwidth", "la cause DOMINANTE sur l'appel")
        let mos = try? XCTUnwrap(payload["mos"] as? Double)
        XCTAssertEqual(mos ?? 0, 3.76, accuracy: 0.05)
    }

    func test_payload_mos_fallsWithLoss() {
        func mos(loss: Double) -> Double {
            var recorder = CallAnalyticsRecorder()
            recorder.recordSample(level: .good, roundTripTimeMs: 100, packetLossPercent: loss, at: Date())
            recorder.recordMedia(.none, jitterMs: 10)
            return makePayload(recorder)["mos"] as? Double ?? 0
        }
        XCTAssertGreaterThan(mos(loss: 0), mos(loss: 10))
    }

    func test_reset_forgetsTheMediaSamples() {
        var recorder = CallAnalyticsRecorder()
        recorder.recordMedia(Self.quality(freezes: 2, reason: "cpu"), jitterMs: 5)

        recorder.reset()

        XCTAssertEqual(recorder, CallAnalyticsRecorder())
    }

    private static func quality(freezes: Int, reason: String) -> CallMediaQuality {
        CallMediaQuality(freezeCount: freezes, totalFreezesDuration: 2, framesPerSecond: 30,
                         qualityLimitationReason: reason, jitterBufferDelayMs: 40,
                         concealedSamples: 480, nackCount: 5, pliCount: 1)
    }
}
