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
            .appendingPathComponent("Meeshy/Features/Profile/Views/StatsTimelineChart.swift")
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

    // MARK: - La frise est le graphique du kit (K50, #19635)

    func test_points_carryEachServedDayAsAnOpaquePoint_withItsCountSpoken() {
        let french = Locale(identifier: "fr_FR")
        let points = StatsTimelineChart.points(of: [point("2026-11-09", 612), point("2026-11-10", 3)], locale: french)

        XCTAssertEqual(points.map(\.id), ["2026-11-09", "2026-11-10"], "l'identité d'un point est son jour servi")
        XCTAssertEqual(points.map(\.value), [612, 3])
        XCTAssertEqual(points[0].label, StatsTimelineChart.dayLabel("2026-11-09", locale: french))
        XCTAssertTrue(points[0].spoken.hasPrefix(points[0].label), "la voix dit le jour : \(points[0].spoken)")
        XCTAssertTrue(points[0].spoken.contains("612"), "puis son nombre de messages : \(points[0].spoken)")
    }

    func test_dayLabel_readsTheServedDayInUTC_soNoTimeZoneShiftsItByOneDay() {
        let label = StatsTimelineChart.dayLabel("2026-11-09", locale: Locale(identifier: "fr_FR"))

        XCTAssertTrue(label.contains("9"), "le 9 novembre reste le 9 : \(label)")
        XCTAssertFalse(label.contains("8"), "aucun fuseau ne le ramène au 8 : \(label)")
        XCTAssertTrue(label.lowercased().contains("nov"), "le mois se lit en mots : \(label)")
    }

    func test_dayLabel_ofAnUnreadableDay_saysItAsServed() {
        XCTAssertEqual(StatsTimelineChart.dayLabel("hier"), "hier")
    }

    func test_axisLabels_nameTheFirstDayTheMiddleAndToday() {
        let locale = Locale(identifier: "fr_FR")
        let timeline: [TimelinePoint] = (1...30).map { (day: Int) -> TimelinePoint in
            let padded: String = day < 10 ? "0\(day)" : "\(day)"
            return point("2026-11-\(padded)", day)
        }
        let labels = StatsTimelineChart.axisLabels(of: timeline, locale: locale)

        XCTAssertEqual(labels, [
            StatsTimelineChart.dayLabel("2026-11-01", locale: locale),
            StatsTimelineChart.dayLabel("2026-11-15", locale: locale),
            StatsTimelineChart.dayLabel("2026-11-30", locale: locale),
        ])
    }

    func test_axisLabels_ofASingleDay_drawNoAxis() {
        XCTAssertTrue(StatsTimelineChart.axisLabels(of: [point("2026-11-01", 4)]).isEmpty)
        XCTAssertEqual(StatsTimelineChart.axisLabels(of: [point("2026-11-01", 4), point("2026-11-02", 1)]).count, 2)
    }

    func test_callout_namesTheChosenDayAndItsCount_andNothingForAnUnknownDay() {
        let timeline = [point("2026-11-09", 612)]
        let callout = StatsTimelineChart.callout("2026-11-09", in: timeline)

        XCTAssertEqual(callout?.title, StatsTimelineChart.dayLabel("2026-11-09"))
        XCTAssertEqual(callout?.value, StatsTimelineChart.messagesValue(612))
        XCTAssertNil(StatsTimelineChart.callout("2026-11-10", in: timeline))
    }

    func test_summary_namesTheChartThenSaysItsNumbers() {
        let timeline = [point("2026-06-01", 3), point("2026-06-02", 9)]
        let summary = StatsTimelineChart.summary(for: timeline)

        XCTAssertTrue(summary.hasSuffix(StatsTimelineChart.accessibilitySummary(for: timeline)), summary)
        XCTAssertTrue(summary.contains("30"), "le nom du graphique dit sa période : \(summary)")
    }

    func test_chart_isTheKitLine_neverSwiftCharts() throws {
        let source = try chartSource()

        XCTAssertTrue(source.contains("MeeshyChart(kind: .line"), "la frise est la courbe du kit K50")
        XCTAssertFalse(source.contains("import Charts"), "plus aucun Swift Charts écrit sur place")
        XCTAssertFalse(source.contains("LineMark("))
        XCTAssertFalse(source.contains("ThemeManager"), "le graphique ne lit aucun singleton de thème")
    }
}
