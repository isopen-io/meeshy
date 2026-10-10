import XCTest
@testable import MeeshySDK

final class MeeshyMetricsMediaTests: XCTestCase {

    private func makeSUT() -> MeeshyMetricsSubscriber {
        MeeshyMetricsSubscriber(clock: { Date(timeIntervalSince1970: 1_000_000) })
    }

    private func makeSummary(
        end: Date = Date(timeIntervalSince1970: 2_000_000),
        hitch: Double? = 0.012,
        exits: MeeshyMetricsSubscriber.BackgroundExitCounts = .init(
            normal: 4,
            abnormal: 1,
            memoryResourceLimit: 2,
            cpuResourceLimit: 0,
            memoryPressure: 3,
            watchdog: 0,
            suspendedWithLockedFile: 0,
            backgroundTaskAssertionTimeout: 1,
            badAccess: 0,
            illegalInstruction: 0
        )
    ) -> MeeshyMetricsSubscriber.PayloadSummary {
        MeeshyMetricsSubscriber.PayloadSummary(
            periodEnd: end,
            scrollHitchTimeRatio: hitch,
            cumulativeCPUTimeSeconds: 41.5,
            cumulativeGPUTimeSeconds: 12.25,
            peakMemoryBytes: 512_000_000,
            cumulativeBackgroundAudioSeconds: 30,
            backgroundExits: exits
        )
    }

    func test_defaultAllowlist_coversTheMediaSignpostCategories() {
        let sut = makeSUT()

        XCTAssertTrue(MeeshyMetricsSubscriber.mediaCategories.isSuperset(of: ["TimelineEngine", "ReelSwitch"]))
        XCTAssertEqual(sut.trackedCategories, MeeshyMetricsSubscriber.mediaCategories)
    }

    func test_consumeSignposts_keepsTheIntervalHitchRatio() {
        let sut = makeSUT()

        sut.consume(signpostMetrics: [
            .init(category: "ReelSwitch", name: "ReelSwitch", totalCount: 80, cumulativeCPUTimeSeconds: 1.5, hitchTimeRatio: 0.02)
        ])

        XCTAssertEqual(sut.aggregates.first?.hitchTimeRatio, 0.02)
    }

    func test_consumePayloadSummaries_keepsEnergyAnimationAndExitFields() {
        let sut = makeSUT()
        let summary = makeSummary()

        let stored = sut.consume(payloadSummaries: [summary])

        XCTAssertEqual(stored, 1)
        XCTAssertEqual(sut.payloadSummaries, [summary])
        XCTAssertEqual(sut.payloadSummaries.first?.backgroundExits.terminations, 7)
    }

    func test_payloadSummaries_areBoundedToTheMostRecent() {
        let sut = makeSUT()
        let limit = MeeshyMetricsSubscriber.maxRetainedPayloads
        let summaries = (0..<(limit + 5)).map { makeSummary(end: Date(timeIntervalSince1970: Double($0))) }

        sut.consume(payloadSummaries: summaries)

        XCTAssertEqual(sut.payloadSummaries.count, limit)
        XCTAssertEqual(sut.payloadSummaries.last?.periodEnd, summaries.last?.periodEnd)
        XCTAssertEqual(sut.payloadSummaries.first?.periodEnd, summaries[5].periodEnd)
    }

    func test_theMetricKitAdapter_readsEveryEnergyAndAnimationKey() throws {
        let source = try sdkUnit("Sources/MeeshySDK/Notifications/MeeshyMetricsSubscriber")
        let keys = [
            "animationMetrics?.scrollHitchTimeRatio",
            "cpuMetrics?.cumulativeCPUTime",
            "gpuMetrics?.cumulativeGPUTime",
            "memoryMetrics?.peakMemoryUsage",
            "applicationTimeMetrics?",
            "cumulativeBackgroundAudioTime",
            "applicationExitMetrics?.backgroundExitData",
            "cumulativeNormalAppExitCount",
            "cumulativeAbnormalExitCount",
            "cumulativeMemoryResourceLimitExitCount",
            "cumulativeCPUResourceLimitExitCount",
            "cumulativeMemoryPressureExitCount",
            "cumulativeAppWatchdogExitCount",
            "cumulativeSuspendedWithLockedFileExitCount",
            "cumulativeBackgroundTaskAssertionTimeoutExitCount",
            "cumulativeBadAccessExitCount",
            "cumulativeIllegalInstructionExitCount",
            "cumulativeHitchTimeRatio",
            "consume(payloadSummaries:"
        ]
        let missing = keys.filter { !source.contains($0) }
        XCTAssertEqual(missing, [], "l'adaptateur MetricKit ne lit plus : \(missing)")
    }

    func test_timelineSignposts_areEmittedOnAMetricKitLogHandle() throws {
        let source = try sdkUnit("Sources/MeeshyUI/Story/Timeline/Engine/TimelineSignposter")

        XCTAssertTrue(source.contains("MXMetricManager.makeLogHandle(category: \"TimelineEngine\")"))
        XCTAssertTrue(source.contains("mxSignpost(.begin"))
        XCTAssertTrue(source.contains("mxSignpost(.end"))
    }

    private func sdkUnit(_ relativePrefix: String) throws -> String {
        let packageRoot = #filePath.components(separatedBy: "/Tests/").first ?? ""
        let folder = (relativePrefix as NSString).deletingLastPathComponent
        let base = (relativePrefix as NSString).lastPathComponent
        let absolute = "\(packageRoot)/\(folder)"
        let names = try FileManager.default.contentsOfDirectory(atPath: absolute)
            .filter { $0 == "\(base).swift" || ($0.hasPrefix("\(base)+") && $0.hasSuffix(".swift")) }
            .sorted()
        XCTAssertFalse(names.isEmpty, "unité « \(relativePrefix) » introuvable — la garde ne garde plus rien")
        return try names
            .map { try String(contentsOfFile: "\(absolute)/\($0)", encoding: .utf8) }
            .map { raw in
                raw.split(separator: "\n", omittingEmptySubsequences: false)
                    .map { line -> Substring in
                        guard let comment = line.range(of: "//") else { return line }
                        return line[line.startIndex..<comment.lowerBound]
                    }
                    .joined(separator: "\n")
            }
            .joined(separator: "\n")
    }
}
