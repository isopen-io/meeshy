import XCTest
import Combine
@testable import Meeshy

@MainActor
final class MockCallQualityStatsFeed: CallQualityStatsProviding {
    let subject: CurrentValueSubject<CallQualityReading?, Never>
    private(set) var subscriptionCount = 0

    init(initial: CallQualityReading? = nil) {
        subject = CurrentValueSubject(initial)
    }

    var readings: AnyPublisher<CallQualityReading?, Never> {
        subject
            .handleEvents(receiveSubscription: { [weak self] _ in self?.subscriptionCount += 1 })
            .eraseToAnyPublisher()
    }

    func reset() {
        subject.send(nil)
        subscriptionCount = 0
    }
}

@MainActor
final class CallQualityReadingTests: XCTestCase {

    private func makeSample(
        at seconds: TimeInterval,
        rtt: Double = 120,
        loss: Double = 1.5,
        jitter: Double = 12,
        audioBytes: Int = 0,
        videoBytes: Int = 0
    ) -> CallQualitySample {
        CallQualitySample(
            at: Date(timeIntervalSince1970: seconds),
            roundTripTimeMs: rtt,
            packetLossPercent: loss,
            jitterMs: jitter,
            inboundAudioBytes: audioBytes,
            inboundVideoBytes: videoBytes
        )
    }

    func test_derive_withoutPrevious_reportsZeroBitrates() {
        let reading = CallQualityReading.derive(current: makeSample(at: 10, audioBytes: 40_000), previous: nil)

        XCTAssertEqual(reading.audioKbps, 0)
        XCTAssertEqual(reading.videoKbps, 0)
        XCTAssertEqual(reading.roundTripTimeMs, 120)
        XCTAssertEqual(reading.packetLossPercent, 1.5)
        XCTAssertEqual(reading.jitterMs, 12)
    }

    func test_derive_withPrevious_computesKilobitsPerSecondFromByteDelta() {
        let previous = makeSample(at: 10, audioBytes: 10_000, videoBytes: 100_000)
        let current = makeSample(at: 12, audioBytes: 18_000, videoBytes: 350_000)

        let reading = CallQualityReading.derive(current: current, previous: previous)

        XCTAssertEqual(reading.audioKbps, 32, accuracy: 0.001)
        XCTAssertEqual(reading.videoKbps, 1_000, accuracy: 0.001)
    }

    func test_derive_counterReset_neverReportsNegativeBitrate() {
        let previous = makeSample(at: 10, audioBytes: 50_000, videoBytes: 500_000)
        let current = makeSample(at: 12, audioBytes: 1_000, videoBytes: 2_000)

        let reading = CallQualityReading.derive(current: current, previous: previous)

        XCTAssertEqual(reading.audioKbps, 0)
        XCTAssertEqual(reading.videoKbps, 0)
    }

    func test_sampleFromStats_carriesPerKindInboundBytes() {
        let stats = CallStats(roundTripTimeMs: 80, jitterMs: 9, inboundAudioBytes: 1_200, inboundVideoBytes: 9_000)

        let sample = CallQualitySample(stats: stats, packetLossPercent: 2, at: Date(timeIntervalSince1970: 5))

        XCTAssertEqual(sample.roundTripTimeMs, 80)
        XCTAssertEqual(sample.jitterMs, 9)
        XCTAssertEqual(sample.packetLossPercent, 2)
        XCTAssertEqual(sample.inboundAudioBytes, 1_200)
        XCTAssertEqual(sample.inboundVideoBytes, 9_000)
    }

    func test_statsReducer_splitsInboundBytesByKind() {
        let stats = CallStats.reduce(entries: [
            CallStats.RawEntry(id: "a", type: "inbound-rtp", kind: "audio", values: ["bytesReceived": 3_000]),
            CallStats.RawEntry(id: "v", type: "inbound-rtp", kind: "video", values: ["bytesReceived": 70_000])
        ])

        XCTAssertEqual(stats.inboundAudioBytes, 3_000)
        XCTAssertEqual(stats.inboundVideoBytes, 70_000)
        XCTAssertEqual(stats.bytesReceived, 73_000)
    }
}

@MainActor
final class CallQualityRowsTests: XCTestCase {

    private let english = Locale(identifier: "en_US")

    private func makeReading(
        loss: Double = 2.5,
        rtt: Double = 120,
        jitter: Double = 12,
        audio: Double = 32.4,
        video: Double = 812.6
    ) -> CallQualityReading {
        CallQualityReading(packetLossPercent: loss, roundTripTimeMs: rtt, jitterMs: jitter, audioKbps: audio, videoKbps: video)
    }

    func test_rows_nilReading_isEmpty() {
        XCTAssertTrue(CallQualityRows.rows(for: nil, locale: english).isEmpty)
    }

    func test_rows_followTheWebOrder() {
        let metrics = CallQualityRows.rows(for: makeReading(), locale: english).map(\.metric)

        XCTAssertEqual(metrics, [.packetLoss, .latency, .jitter, .audioRate, .videoRate])
    }

    func test_rows_formatValuesInTheLocale() {
        let rows = CallQualityRows.rows(for: makeReading(), locale: english)
        let value = { (metric: CallQualityMetric) in rows.first { $0.metric == metric }?.value ?? "" }

        XCTAssertEqual(value(.packetLoss), "2.5%")
        XCTAssertTrue(value(.latency).contains("120"))
        XCTAssertTrue(value(.latency).contains("ms"))
        XCTAssertTrue(value(.jitter).contains("12"))
        XCTAssertTrue(value(.audioRate).contains("32"))
        XCTAssertTrue(value(.videoRate).contains("813"))
    }

    func test_rows_bitratesCarryNoGrade() {
        let rows = CallQualityRows.rows(for: makeReading(), locale: english)

        XCTAssertNil(rows.first { $0.metric == .audioRate }?.grade)
        XCTAssertNil(rows.first { $0.metric == .videoRate }?.grade)
    }

    func test_grade_packetLoss_matchesWebLadder() {
        XCTAssertEqual(CallQualityRows.grade(for: .packetLoss, value: 2.9), .good)
        XCTAssertEqual(CallQualityRows.grade(for: .packetLoss, value: 3), .medium)
        XCTAssertEqual(CallQualityRows.grade(for: .packetLoss, value: 4.9), .medium)
        XCTAssertEqual(CallQualityRows.grade(for: .packetLoss, value: 5), .poor)
    }

    func test_grade_latency_matchesWebLadder() {
        XCTAssertEqual(CallQualityRows.grade(for: .latency, value: 299), .good)
        XCTAssertEqual(CallQualityRows.grade(for: .latency, value: 300), .medium)
        XCTAssertEqual(CallQualityRows.grade(for: .latency, value: 449), .medium)
        XCTAssertEqual(CallQualityRows.grade(for: .latency, value: 450), .poor)
    }

    func test_grade_jitter_degradesAboveOpusConcealmentBudget() {
        XCTAssertEqual(CallQualityRows.grade(for: .jitter, value: 29), .good)
        XCTAssertEqual(CallQualityRows.grade(for: .jitter, value: 30), .medium)
        XCTAssertEqual(CallQualityRows.grade(for: .jitter, value: 50), .poor)
    }

    func test_overall_isTheWorstGradedRow() {
        let rows = CallQualityRows.rows(for: makeReading(loss: 0.5, rtt: 500, jitter: 35), locale: english)

        XCTAssertEqual(CallQualityRows.overall(rows), .poor)
    }

    func test_overall_noRows_isNil() {
        XCTAssertNil(CallQualityRows.overall([]))
    }
}

@MainActor
final class CallQualityStatsFeedTests: XCTestCase {

    private func makeSample(at seconds: TimeInterval, audioBytes: Int) -> CallQualitySample {
        CallQualitySample(
            at: Date(timeIntervalSince1970: seconds),
            roundTripTimeMs: 90,
            packetLossPercent: 0,
            jitterMs: 5,
            inboundAudioBytes: audioBytes,
            inboundVideoBytes: 0
        )
    }

    func test_record_publishesReadingDerivedFromPreviousSample() {
        let feed = CallQualityStatsFeed()
        var received: [CallQualityReading?] = []
        let cancellable = feed.readings.sink { received.append($0) }

        feed.record(makeSample(at: 0, audioBytes: 0))
        feed.record(makeSample(at: 1, audioBytes: 4_000))

        XCTAssertEqual(received.count, 3)
        XCTAssertEqual(received.last??.audioKbps ?? -1, 32, accuracy: 0.001)
        cancellable.cancel()
    }

    func test_reset_clearsLatestReadingAndBitrateBaseline() {
        let feed = CallQualityStatsFeed()
        feed.record(makeSample(at: 0, audioBytes: 0))

        feed.reset()
        feed.record(makeSample(at: 1, audioBytes: 4_000))

        XCTAssertEqual(feed.currentReading?.audioKbps, 0)
    }

    func test_newSubscriber_receivesLatestReadingImmediately() {
        let feed = CallQualityStatsFeed()
        feed.record(makeSample(at: 0, audioBytes: 0))
        var first: CallQualityReading??

        let cancellable = feed.readings.sink { if first == nil { first = .some($0) } }

        XCTAssertEqual(first??.roundTripTimeMs, 90)
        cancellable.cancel()
    }
}

@MainActor
final class CallQualityDetailViewModelTests: XCTestCase {

    private func makeReading(rtt: Double) -> CallQualityReading {
        CallQualityReading(packetLossPercent: 1, roundTripTimeMs: rtt, jitterMs: 4, audioKbps: 30, videoKbps: 0)
    }

    private func makeSUT(initial: CallQualityReading? = nil) -> (sut: CallQualityDetailViewModel, feed: MockCallQualityStatsFeed) {
        let feed = MockCallQualityStatsFeed(initial: initial)
        let sut = CallQualityDetailViewModel(feed: feed, locale: Locale(identifier: "en_US"))
        return (sut, feed)
    }

    private func latency(_ sut: CallQualityDetailViewModel) -> String? {
        sut.rows.first { $0.metric == .latency }?.value
    }

    func test_start_showsLatestReadingWithoutWaitingForNextTick() {
        let (sut, _) = makeSUT(initial: makeReading(rtt: 140))

        sut.start()

        XCTAssertTrue(latency(sut)?.contains("140") ?? false)
        XCTAssertFalse(sut.isWaitingForFirstReading)
    }

    func test_start_withoutReading_isWaiting() {
        let (sut, _) = makeSUT()

        sut.start()

        XCTAssertTrue(sut.isWaitingForFirstReading)
    }

    func test_liveTick_updatesRows() {
        let (sut, feed) = makeSUT(initial: makeReading(rtt: 140))
        sut.start()

        feed.subject.send(makeReading(rtt: 480))

        XCTAssertTrue(latency(sut)?.contains("480") ?? false)
        XCTAssertEqual(sut.overall, .poor)
    }

    func test_stop_detachesFromTheStatsLoop() {
        let (sut, feed) = makeSUT(initial: makeReading(rtt: 140))
        sut.start()

        sut.stop()
        feed.subject.send(makeReading(rtt: 480))

        XCTAssertTrue(latency(sut)?.contains("140") ?? false)
    }

    func test_start_twice_subscribesOnce() {
        let (sut, feed) = makeSUT(initial: makeReading(rtt: 140))

        sut.start()
        sut.start()

        XCTAssertEqual(feed.subscriptionCount, 1)
    }

    func test_viewModel_isReleasedWhileSubscribed() {
        let feed = MockCallQualityStatsFeed(initial: makeReading(rtt: 140))
        weak var released: CallQualityDetailViewModel?

        do {
            let sut = CallQualityDetailViewModel(feed: feed, locale: Locale(identifier: "en_US"))
            sut.start()
            released = sut
        }

        XCTAssertNil(released)
    }
}
