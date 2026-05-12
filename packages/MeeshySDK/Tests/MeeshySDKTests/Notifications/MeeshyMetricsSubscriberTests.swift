import XCTest
@testable import MeeshySDK

final class MeeshyMetricsSubscriberTests: XCTestCase {

    // MARK: - Factory

    private func makeSUT(
        trackedCategories: Set<String> = ["TimelineEngine"],
        clock: @Sendable @escaping () -> Date = { Date(timeIntervalSince1970: 1_000_000) }
    ) -> MeeshyMetricsSubscriber {
        MeeshyMetricsSubscriber(
            trackedCategories: trackedCategories,
            clock: clock
        )
    }

    private func makeInput(
        category: String = "TimelineEngine",
        name: String = "frame.render",
        totalCount: UInt = 42,
        cumulativeCPUTimeSeconds: Double? = 0.123
    ) -> MeeshyMetricsSubscriber.SignpostMetricInput {
        MeeshyMetricsSubscriber.SignpostMetricInput(
            category: category,
            name: name,
            totalCount: totalCount,
            cumulativeCPUTimeSeconds: cumulativeCPUTimeSeconds
        )
    }

    // MARK: - Tests

    func test_subscriber_handlesPayloadWithSignpostMetrics() {
        let fixedDate = Date(timeIntervalSince1970: 2_000_000)
        let sut = makeSUT(clock: { fixedDate })

        let stored = sut.consume(signpostMetrics: [
            makeInput(name: "frame.render", totalCount: 60),
            makeInput(name: "audio.mix", totalCount: 12, cumulativeCPUTimeSeconds: 0.5)
        ])

        XCTAssertEqual(stored, 2)
        let aggregates = sut.aggregates
        XCTAssertEqual(aggregates.count, 2)
        XCTAssertEqual(aggregates[0].category, "TimelineEngine")
        XCTAssertEqual(aggregates[0].name, "frame.render")
        XCTAssertEqual(aggregates[0].totalCount, 60)
        XCTAssertEqual(aggregates[0].receivedAt, fixedDate)
        XCTAssertEqual(aggregates[1].name, "audio.mix")
        XCTAssertEqual(aggregates[1].cumulativeCPUTimeSeconds, 0.5)
    }

    func test_subscriber_filtersForTimelineCategories() {
        let sut = makeSUT(trackedCategories: ["TimelineEngine"])

        let stored = sut.consume(signpostMetrics: [
            makeInput(category: "TimelineEngine", name: "kept-1"),
            makeInput(category: "http", name: "dropped-1"),
            makeInput(category: "dynamic_tracing", name: "dropped-2"),
            makeInput(category: "TimelineEngine", name: "kept-2")
        ])

        XCTAssertEqual(stored, 2)
        let names = sut.aggregates.map(\.name)
        XCTAssertEqual(names, ["kept-1", "kept-2"])
        XCTAssertTrue(sut.aggregates.allSatisfy { $0.category == "TimelineEngine" })
    }

    func test_subscriber_doesNotCrashOnEmptyPayload() {
        let sut = makeSUT()

        let stored = sut.consume(signpostMetrics: [])

        XCTAssertEqual(stored, 0)
        XCTAssertTrue(sut.aggregates.isEmpty)
    }

    // MARK: - Behavioural extras (guard against silent regressions)

    func test_subscriber_droppsAllWhenNoCategoryMatches() {
        let sut = makeSUT(trackedCategories: ["TimelineEngine"])

        let stored = sut.consume(signpostMetrics: [
            makeInput(category: "http"),
            makeInput(category: "memory")
        ])

        XCTAssertEqual(stored, 0)
        XCTAssertTrue(sut.aggregates.isEmpty)
    }

    func test_resetAggregates_clearsStore() {
        let sut = makeSUT()
        sut.consume(signpostMetrics: [makeInput()])
        XCTAssertFalse(sut.aggregates.isEmpty)

        sut.resetAggregates()

        XCTAssertTrue(sut.aggregates.isEmpty)
    }

    func test_trackedCategoriesIsConfigurable() {
        let sut = makeSUT(trackedCategories: ["CustomCategory"])

        let stored = sut.consume(signpostMetrics: [
            makeInput(category: "CustomCategory", name: "ok"),
            makeInput(category: "TimelineEngine", name: "dropped")
        ])

        XCTAssertEqual(stored, 1)
        XCTAssertEqual(sut.aggregates.first?.name, "ok")
    }
}
