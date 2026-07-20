import XCTest

/// Source-level VoiceOver guard for the conversation dashboard's data-viz
/// gauges (`StatRing`, health `ArcGauge`) in ConversationDashboardView.swift.
/// Both render a bare number inside decorative geometry with the caption as a
/// separate sibling, so before grouping VoiceOver announced the abbreviated
/// value ("1,2k") and the uppercased caption ("MESSAGES") as two disjoint,
/// context-free stops per gauge — and the health score as a naked "78".
final class ConversationDashboardViewAccessibilityTests: XCTestCase {

    private func dashboardSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Components/ConversationDashboardView.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    func test_statRing_isSingleVoiceOverElement_withLabelAndValue() throws {
        let source = try dashboardSource()
        guard let range = source.range(of: "private struct StatRing") else {
            XCTFail("ConversationDashboardView.swift must define the StatRing gauge"); return
        }
        let body = String(source[range.lowerBound...].prefix(2600))
        XCTAssertTrue(
            body.contains(".accessibilityElement(children: .ignore)"),
            "StatRing must collapse its value + caption into one VoiceOver element; " +
            "otherwise the abbreviated value and the uppercased caption are read as two stops."
        )
        XCTAssertTrue(
            body.contains(".accessibilityLabel(label)"),
            "StatRing must expose the already-localized, non-uppercased label to VoiceOver."
        )
        XCTAssertTrue(
            body.contains(".accessibilityValue(\"\\(value)\")"),
            "StatRing must announce the raw (un-abbreviated) count as its accessibility value."
        )
    }

    func test_healthArcGauge_isSingleVoiceOverElement_withScoreValue() throws {
        let source = try dashboardSource()
        guard let range = source.range(of: "ArcGauge(") else {
            XCTFail("ConversationDashboardView.swift must render the health ArcGauge"); return
        }
        let vicinity = String(source[range.lowerBound...].prefix(1400))
        XCTAssertTrue(
            vicinity.contains(".accessibilityElement(children: .ignore)"),
            "The health gauge and its \"Sante\" caption must form one VoiceOver element; " +
            "otherwise VoiceOver reads a naked \"78\" from inside the arc with no label."
        )
        XCTAssertTrue(
            vicinity.contains(".accessibilityValue(\"\\(health)\")"),
            "The health gauge must announce the score as its accessibility value."
        )
    }
}
