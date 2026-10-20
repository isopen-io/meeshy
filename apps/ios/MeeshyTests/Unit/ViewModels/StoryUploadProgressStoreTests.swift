import XCTest
import Combine
@testable import Meeshy

@MainActor
final class StoryUploadProgressStoreTests: XCTestCase {

    private let t0 = ContinuousClock.Instant.now

    private func sample(_ fraction: Double) -> StoryUploadProgressSample {
        StoryUploadProgressSample(fraction: fraction, at: t0)
    }

    func test_shouldPublish_firstSample_publishes() {
        XCTAssertTrue(StoryUploadProgressCoalescing.shouldPublish(0.1, at: t0, after: nil))
    }

    func test_shouldPublish_smallDeltaWithin100ms_isDropped() {
        let publishes = StoryUploadProgressCoalescing.shouldPublish(
            0.405, at: t0.advanced(by: .milliseconds(50)), after: sample(0.40)
        )
        XCTAssertFalse(publishes)
    }

    func test_shouldPublish_smallDeltaAfter100ms_publishes() {
        let publishes = StoryUploadProgressCoalescing.shouldPublish(
            0.405, at: t0.advanced(by: .milliseconds(100)), after: sample(0.40)
        )
        XCTAssertTrue(publishes)
    }

    func test_shouldPublish_onePercentDeltaImmediately_publishes() {
        let publishes = StoryUploadProgressCoalescing.shouldPublish(
            0.42, at: t0.advanced(by: .milliseconds(1)), after: sample(0.40)
        )
        XCTAssertTrue(publishes)
    }

    func test_shouldPublish_completion_alwaysPublishes() {
        let publishes = StoryUploadProgressCoalescing.shouldPublish(
            1.0, at: t0.advanced(by: .milliseconds(1)), after: sample(0.995)
        )
        XCTAssertTrue(publishes)
    }

    func test_shouldPublish_sameValue_neverPublishes() {
        let publishes = StoryUploadProgressCoalescing.shouldPublish(
            0.4, at: t0.advanced(by: .seconds(1)), after: sample(0.4)
        )
        XCTAssertFalse(publishes)
    }

    func test_report_burstOfTinyTicks_publishesAtMostOncePer100ms() {
        let sut = StoryUploadProgressStore()
        var emissions = 0
        let subscription = sut.$fractions.dropFirst().sink { _ in emissions += 1 }

        (0..<150).forEach { tick in
            sut.report(Double(tick) * 0.00005, for: "u1", at: t0.advanced(by: .milliseconds(tick)))
        }

        let shown = sut.fraction(for: "u1")
        XCTAssertLessThanOrEqual(emissions, 2)
        XCTAssertEqual(shown, 100 * 0.00005, accuracy: 0.000001)
        subscription.cancel()
    }

    func test_report_publishedValue_isReadBack() {
        let sut = StoryUploadProgressStore()

        sut.report(0.7, for: "u1", at: t0)

        XCTAssertEqual(sut.fraction(for: "u1"), 0.7)
        XCTAssertEqual(sut.fraction(for: "absent"), 0)
    }

    func test_retainOnly_dropsUnlistedIds_andIsSilentWhenNothingDropped() {
        let sut = StoryUploadProgressStore()
        sut.report(0.5, for: "keep", at: t0)
        sut.report(0.6, for: "gone", at: t0)
        var emissions = 0
        let subscription = sut.$fractions.dropFirst().sink { _ in emissions += 1 }

        sut.retainOnly(["keep", "gone"])
        XCTAssertEqual(emissions, 0)

        sut.retainOnly(["keep"])
        let gone = sut.fraction(for: "gone")
        let kept = sut.fraction(for: "keep")
        XCTAssertEqual(emissions, 1)
        XCTAssertEqual(gone, 0)
        XCTAssertEqual(kept, 0.5)
        subscription.cancel()
    }

    func test_forget_resetsFractionToZero_andNextReportPublishesImmediately() {
        let sut = StoryUploadProgressStore()
        sut.report(0.5, for: "u1", at: t0)

        sut.forget(id: "u1")
        XCTAssertEqual(sut.fraction(for: "u1"), 0)

        sut.report(0.5001, for: "u1", at: t0.advanced(by: .milliseconds(1)))
        XCTAssertEqual(sut.fraction(for: "u1"), 0.5001)
    }
}
