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

    @MainActor
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

    // MARK: - #19933 — une mesure aberrante ne fait ni planter ni refuser le rapport

    private static func makeContext(codec: String = "opus") -> CallAnalyticsContext {
        CallAnalyticsContext(callDuration: 42, codec: codec, filtersEnabledNow: false, transcriptionUsed: false,
                             deviceModel: "iPhone", isVideo: false, endReason: "local")
    }

    private static func assertMeasured(_ value: Any?, _ field: String, file: StaticString = #filePath, line: UInt = #line) {
        guard let number = value as? Double else { return XCTFail("\(field) absent", file: file, line: line) }
        XCTAssertTrue(number.isFinite && number >= 0, "\(field) = \(number) : la passerelle refuserait le rapport", file: file, line: line)
    }

    @MainActor
    func test_reduce_aberrantRoundTripTime_isNotMeasured() {
        [1e306, -0.2, .nan, .infinity].forEach { aberrant in
            let stats = CallStats.reduce(entries: [Self.entry("p", "candidate-pair", values: ["currentRoundTripTime": aberrant])])

            XCTAssertEqual(stats.roundTripTimeMs, 0, "RTT \(aberrant) s")
        }
    }

    @MainActor
    func test_reduce_aberrantCounters_doNotCrashAndCountZero() {
        [Double.nan, .infinity, -.infinity, -12].forEach { aberrant in
            let stats = CallStats.reduce(entries: [
                Self.entry("p", "candidate-pair", values: ["availableOutgoingBitrate": aberrant]),
                Self.entry("a", "inbound-rtp", kind: "audio", values: [
                    "packetsLost": aberrant, "packetsReceived": aberrant, "bytesReceived": aberrant,
                ]),
                Self.entry("o", "outbound-rtp", kind: "audio", values: ["packetsSent": aberrant, "bytesSent": aberrant]),
            ])

            XCTAssertEqual(stats, CallStats(relayed: nil), "compteurs \(aberrant)")
        }
    }

    @MainActor
    func test_reduce_countersBeyondMaxSafeInteger_areNotMeasured() {
        let stats = CallStats.reduce(entries: [
            Self.entry("a", "inbound-rtp", kind: "audio", values: ["packetsLost": 1e300, "packetsReceived": 1e300, "bytesReceived": 1e300]),
            Self.entry("v", "inbound-rtp", kind: "video", values: ["packetsLost": 1e300, "packetsReceived": 1e300, "bytesReceived": 1e300]),
            Self.entry("o", "outbound-rtp", kind: "audio", values: ["packetsSent": 1e300, "bytesSent": 1e300]),
            Self.entry("p", "candidate-pair", values: ["availableOutgoingBitrate": 1e300]),
        ])

        XCTAssertEqual(stats.packetsLost, 0)
        XCTAssertEqual(stats.inboundPacketsReceived, 0)
        XCTAssertEqual(stats.bytesReceived, 0)
        XCTAssertEqual(stats.outboundPacketsSent, 0)
        XCTAssertEqual(stats.bandwidth, 0)
        XCTAssertEqual(stats.availableOutgoingBitrateBps, 0)
    }

    @MainActor
    func test_reduce_manyCountersAtMaxSafeInteger_cumulateWithinMaxSafeInteger() {
        let maxSafe = Double(CallStatValue.maxSafeCount)
        let stats = CallStats.reduce(entries: (0..<4).flatMap { index in [
            Self.entry("a\(index)", "inbound-rtp", kind: "audio", values: ["packetsLost": maxSafe, "packetsReceived": maxSafe]),
            Self.entry("v\(index)", "inbound-rtp", kind: "video", values: ["packetsLost": maxSafe, "packetsReceived": maxSafe]),
        ] })

        XCTAssertEqual(stats.packetsLost, CallStatValue.maxSafeCount)
        XCTAssertEqual(stats.inboundPacketsReceived, CallStatValue.maxSafeCount)
    }

    @MainActor
    func test_intervalLossRatio_firstReadingWithHostileStats_doesNotOverflow() {
        let hostile = CallStats.reduce(entries: [
            Self.entry("a", "inbound-rtp", kind: "audio", values: ["packetsLost": 1e300, "packetsReceived": 1e300]),
            Self.entry("v", "inbound-rtp", kind: "video", values: ["packetsLost": 9e15, "packetsReceived": 9e15]),
        ])

        let ratio = WebRTCService.intervalLossRatio(hostile, previous: nil)

        XCTAssertTrue(ratio.isFinite && ratio >= 0 && ratio <= 1, "ratio = \(ratio)")
    }

    @MainActor
    func test_reduce_aberrantJitter_isIgnored() {
        let stats = CallStats.reduce(entries: [
            Self.entry("a1", "inbound-rtp", kind: "audio", values: ["jitter": 0.02]),
            Self.entry("a2", "inbound-rtp", kind: "audio", values: ["jitter": .nan]),
            Self.entry("a3", "inbound-rtp", kind: "audio", values: ["jitter": -1]),
            Self.entry("a4", "inbound-rtp", kind: "audio", values: ["jitter": .infinity]),
        ])

        XCTAssertEqual(stats.jitterMs, 20, accuracy: 0.000_1)
    }

    @MainActor
    func test_reduce_aberrantMediaCounters_doNotCrash() {
        let quality = CallMediaQuality.reduce(entries: [
            Self.entry("v", "inbound-rtp", kind: "video", values: [
                "freezeCount": .nan, "totalFreezesDuration": .infinity, "nackCount": 1e300, "pliCount": -4,
            ]),
            Self.entry("a", "inbound-rtp", kind: "audio", values: [
                "concealedSamples": .infinity, "jitterBufferDelay": .infinity, "jitterBufferEmittedCount": 10,
            ]),
        ])

        XCTAssertEqual(quality.freezeCount, 0)
        XCTAssertEqual(quality.totalFreezesDuration, 0)
        XCTAssertEqual(quality.nackCount, 0)
        XCTAssertEqual(quality.pliCount, 0)
        XCTAssertEqual(quality.concealedSamples, 0)
        XCTAssertEqual(quality.jitterBufferDelayMs, 0)
    }

    @MainActor
    func test_reduce_validStats_areUnchanged() {
        let stats = CallStats.reduce(entries: [
            Self.entry("p", "candidate-pair", values: ["currentRoundTripTime": 0.12, "availableOutgoingBitrate": 800_000]),
            Self.entry("a", "inbound-rtp", kind: "audio", values: [
                "packetsLost": 3, "packetsReceived": 500, "bytesReceived": 40_000, "jitter": 0.01,
            ]),
            Self.entry("v", "inbound-rtp", kind: "video", values: ["packetsLost": 2, "packetsReceived": 900, "bytesReceived": 900_000]),
            Self.entry("o", "outbound-rtp", kind: "audio", values: ["packetsSent": 450, "bytesSent": 36_000]),
        ])

        XCTAssertEqual(stats.roundTripTimeMs, 120, accuracy: 0.000_1)
        XCTAssertEqual(stats.availableOutgoingBitrateBps, 800_000)
        XCTAssertEqual(stats.packetsLost, 5)
        XCTAssertEqual(stats.inboundAudioPackets, 500)
        XCTAssertEqual(stats.inboundVideoPackets, 900)
        XCTAssertEqual(stats.inboundPacketsReceived, 1_400)
        XCTAssertEqual(stats.bytesReceived, 940_000)
        XCTAssertEqual(stats.outboundPacketsSent, 450)
        XCTAssertEqual(stats.bandwidth, 36_000)
        XCTAssertEqual(stats.jitterMs, 10, accuracy: 0.000_1)
    }

    func test_payload_aberrantSamples_staysFiniteAndNonNegative() {
        [Double.infinity, -.infinity, .nan, -30, 1e308].forEach { aberrant in
            var recorder = CallAnalyticsRecorder()
            let t0 = Date(timeIntervalSince1970: 100)
            recorder.recordSample(level: .poor, roundTripTimeMs: aberrant, packetLossPercent: aberrant, at: t0)
            recorder.recordSample(level: .poor, roundTripTimeMs: 1e308, packetLossPercent: 1e308, at: t0.addingTimeInterval(1))
            recorder.recordMedia(.none, jitterMs: aberrant)

            let payload = recorder.payload(now: t0.addingTimeInterval(2), context: Self.makeContext())

            ["averageRtt", "averagePacketLoss", "maxPacketLoss"].forEach { Self.assertMeasured(payload[$0], "\($0) pour \(aberrant)") }
            XCTAssertNotNil(payload["mos"], "le MOS reste calculé")
        }
    }

    func test_payload_hostileMediaCounters_stayWithinMaxSafeInteger() {
        [1e300, 1_152_921_504_606_846_976].forEach { hostile in
            var recorder = CallAnalyticsRecorder()
            let quality = CallMediaQuality.reduce(entries: [
                Self.entry("v", "inbound-rtp", kind: "video", values: ["freezeCount": hostile, "nackCount": hostile, "pliCount": hostile]),
                Self.entry("a", "inbound-rtp", kind: "audio", values: ["concealedSamples": hostile]),
            ])
            recorder.recordSample(level: .good, roundTripTimeMs: 100, packetLossPercent: 1, at: Date(timeIntervalSince1970: 100))
            recorder.recordMedia(quality, jitterMs: 10)

            let payload = recorder.payload(now: Date(timeIntervalSince1970: 101), context: Self.makeContext())

            ["freezeCount", "concealedSamples", "nackCount", "pliCount"].forEach { field in
                let value = payload[field] as? Int
                XCTAssertNotNil(value, "\(field) absent pour \(hostile)")
                XCTAssertTrue((0...CallStatValue.maxSafeCount).contains(value ?? -1), "\(field) = \(value ?? -1) pour \(hostile)")
            }
        }
    }

    func test_payload_negativeSamples_countAsNotMeasured() {
        var recorder = CallAnalyticsRecorder()
        recorder.recordSample(level: .good, roundTripTimeMs: -50, packetLossPercent: -4, at: Date(timeIntervalSince1970: 100))
        recorder.recordSample(level: .good, roundTripTimeMs: 100, packetLossPercent: 2, at: Date(timeIntervalSince1970: 101))

        let payload = recorder.payload(now: Date(timeIntervalSince1970: 102), context: Self.makeContext())

        XCTAssertEqual(payload["averageRtt"] as? Double, 50)
        XCTAssertEqual(payload["averagePacketLoss"] as? Double, 1)
        XCTAssertEqual(payload["maxPacketLoss"] as? Double, 2)
    }

    func test_payload_codecLongerThanFifty_isCutToFifty() {
        let codec = String(repeating: "x", count: 80)

        let payload = CallAnalyticsRecorder().payload(now: Date(), context: Self.makeContext(codec: codec))

        XCTAssertEqual(payload["codec"] as? String, String(repeating: "x", count: 50))
    }

    func test_payload_codecOfWideCharacters_staysWithinFiftyUTF16Units() {
        let codec = String(repeating: "\u{1F3A7}", count: 40)

        let payload = CallAnalyticsRecorder().payload(now: Date(), context: Self.makeContext(codec: codec))

        XCTAssertLessThanOrEqual((payload["codec"] as? String)?.utf16.count ?? .max, 50)
        XCTAssertEqual(payload["codec"] as? String, String(repeating: "\u{1F3A7}", count: 25))
    }

    private func assertDistributionWithinUnit(_ payload: [String: Any], file: StaticString = #filePath, line: UInt = #line) {
        let distribution = payload["qualityDistribution"] as? [String: Double] ?? [:]
        XCTAssertEqual(Set(distribution.keys), ["excellent", "good", "fair", "poor"], file: file, line: line)
        for (key, share) in distribution {
            XCTAssertTrue(share.isFinite && share >= 0 && share <= 1, "\(key) hors de [0;1] : \(share)", file: file, line: line)
        }
    }

    func test_recordSample_clockGoingBackwards_countsNegativeIntervalAsZero() {
        var recorder = CallAnalyticsRecorder()
        let t0 = Date(timeIntervalSince1970: 100)
        recorder.recordSample(level: .excellent, roundTripTimeMs: 10, packetLossPercent: 0, at: t0)
        recorder.recordSample(level: .good, roundTripTimeMs: 10, packetLossPercent: 0, at: t0.addingTimeInterval(-10))

        XCTAssertGreaterThanOrEqual(recorder.qualitySeconds[.excellent] ?? 0, 0)
        assertDistributionWithinUnit(makePayload(recorder))
    }

    func test_recordSample_clockGoingBackwardsAfterPositiveInterval_keepsOnlyPositiveInterval() {
        var recorder = CallAnalyticsRecorder()
        let t0 = Date(timeIntervalSince1970: 100)
        recorder.recordSample(level: .excellent, roundTripTimeMs: 10, packetLossPercent: 0, at: t0)
        recorder.recordSample(level: .good, roundTripTimeMs: 10, packetLossPercent: 0, at: t0.addingTimeInterval(5))
        recorder.recordSample(level: .poor, roundTripTimeMs: 10, packetLossPercent: 0, at: t0.addingTimeInterval(2))

        let payload = recorder.payload(now: t0.addingTimeInterval(2), context: Self.makeContext(codec: "opus"))
        let distribution = payload["qualityDistribution"] as? [String: Double] ?? [:]

        XCTAssertEqual(distribution["excellent"] ?? -1, 1.0, accuracy: 0.0001)
        XCTAssertEqual(distribution["good"] ?? -1, 0.0, accuracy: 0.0001)
        assertDistributionWithinUnit(payload)
    }

    func test_qualityDistribution_negativeOrNonFiniteAccumulators_countAsZero() {
        let distribution = CallReliabilityPolicy.qualityDistribution(
            accumulatedSeconds: [.excellent: -10, .good: 30, .fair: .nan, .poor: .infinity, .critical: -.infinity],
            openWindowLevel: nil, openWindowSince: nil, now: Date(timeIntervalSince1970: 0)
        )

        XCTAssertEqual(distribution["good"] ?? -1, 1.0, accuracy: 0.0001)
        for share in distribution.values {
            XCTAssertTrue(share.isFinite && share >= 0 && share <= 1)
        }
    }

    private static func quality(freezes: Int, reason: String) -> CallMediaQuality {
        CallMediaQuality(freezeCount: freezes, totalFreezesDuration: 2, framesPerSecond: 30,
                         qualityLimitationReason: reason, jitterBufferDelayMs: 40,
                         concealedSamples: 480, nackCount: 5, pliCount: 1)
    }
}
