import XCTest
@testable import Meeshy
import MeeshySDK

@MainActor
final class StatsTimelineChartAccessibilityTests: XCTestCase {

    private func point(_ date: String, _ messages: Int) -> TimelinePoint {
        TimelinePoint(date: date, messages: messages)
    }

    private func chartSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent() // Views
            .deletingLastPathComponent() // Unit
            .deletingLastPathComponent() // MeeshyTests
            .deletingLastPathComponent() // apps/ios
            .appendingPathComponent("Meeshy/Features/Main/Views/StatsTimelineChart.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    // MARK: - accessibilitySummary (pure helper)

    func test_accessibilitySummary_emptyTimeline_hasSpokenValueWithoutFabricatingCounts() {
        let summary = StatsTimelineChart.accessibilitySummary(for: [])
        XCTAssertFalse(
            summary.isEmpty,
            "An empty timeline must still yield a spoken VoiceOver value, not silence."
        )
        XCTAssertFalse(
            summary.contains(where: \.isNumber),
            "The empty-state summary must not fabricate any message counts."
        )
    }

    func test_accessibilitySummary_reportsTotalPeakAndMostRecentDay() {
        let timeline = [
            point("2026-06-01", 3),
            point("2026-06-02", 9),
            point("2026-06-03", 5)
        ]
        let summary = StatsTimelineChart.accessibilitySummary(for: timeline)

        XCTAssertTrue(
            summary.contains("17"),
            "Total volume (3 + 9 + 5 = 17) must be spoken so VoiceOver conveys overall activity: \(summary)"
        )
        XCTAssertTrue(
            summary.contains("9"),
            "The busiest day (peak = 9) must be spoken: \(summary)"
        )
        XCTAssertTrue(
            summary.contains("5"),
            "The most recent day (latest = 5) must be spoken: \(summary)"
        )
    }

    func test_accessibilitySummary_singlePoint_reportsThatDay() {
        let summary = StatsTimelineChart.accessibilitySummary(for: [point("2026-06-01", 4)])
        XCTAssertTrue(
            summary.contains("4"),
            "A single-day timeline must still surface its count: \(summary)"
        )
    }

    // MARK: - Dynamic Type & VoiceOver wiring (source scan)

    func test_axisLabels_useDynamicTypeFontNotFixedSize() throws {
        let source = try chartSource()
        XCTAssertFalse(
            source.contains(".font(.system(size: 9))"),
            "Axis labels must not use a fixed point size — migrate to MeeshyFont.relative so they scale with Dynamic Type."
        )
        XCTAssertTrue(
            source.contains("MeeshyFont.relative(9)"),
            "Axis labels must scale with Dynamic Type via MeeshyFont.relative(9)."
        )
    }

    func test_chart_exposesDataSummaryAsAccessibilityValue() throws {
        let source = try chartSource()
        XCTAssertTrue(
            source.contains(".accessibilityValue(Self.accessibilitySummary(for: timeline))"),
            "The chart must expose its data summary as a VoiceOver value so blind users hear the numbers, not just a generic label."
        )
        XCTAssertTrue(
            source.contains(".accessibilityElement(children: .ignore)"),
            "The chart must collapse into a single accessibility element so VoiceOver reads label + value once."
        )
    }
}
