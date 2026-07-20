import XCTest
@testable import MeeshyUI

/// `ComposerToolPanelHost` renders the timeline inline in the band like every
/// other tool (2026-07-14) — it used to special-case `.timeline` to height 0
/// / `EmptyView()` because the timeline was sheet-only.
final class ComposerToolPanelHostTimelineTests: XCTestCase {

    private func sdkSource(_ relativePath: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent(relativePath)
        return try String(contentsOf: url, encoding: .utf8)
    }

    func test_defaultPanelHeight_timeline_isNoLongerZero() {
        // 392 = opérations + transport + scrubber + 3 pistes compactes + footer
        // (2026-07-20 : +72 pour la bande d'opérations — cf. defaultPanelHeight source).
        XCTAssertEqual(ComposerToolPanelHost.defaultPanelHeight(for: .timeline), 392)
    }

    func test_defaultPanelHeight_otherTools_unchanged() {
        XCTAssertEqual(ComposerToolPanelHost.defaultPanelHeight(for: .media), 220)
        XCTAssertEqual(ComposerToolPanelHost.defaultPanelHeight(for: .audio), 220)
        XCTAssertEqual(ComposerToolPanelHost.defaultPanelHeight(for: .drawing), 280)
        XCTAssertEqual(ComposerToolPanelHost.defaultPanelHeight(for: .text), 280)
        XCTAssertEqual(ComposerToolPanelHost.defaultPanelHeight(for: .texture), 236)
        XCTAssertEqual(ComposerToolPanelHost.defaultPanelHeight(for: .filters), 180)
    }

    func test_placeholderPanel_timelineCase_rendersTimelinePanel_notEmptyView() throws {
        let source = try sdkSource("Sources/MeeshyUI/Story/Controls/ComposerToolPanelHost.swift")
        guard let placeholderRange = source.range(of: "private var placeholderPanel") else {
            XCTFail("ComposerToolPanelHost must expose placeholderPanel")
            return
        }
        let end = source.index(placeholderRange.lowerBound, offsetBy: 1200, limitedBy: source.endIndex) ?? source.endIndex
        let block = String(source[placeholderRange.lowerBound..<end])
        XCTAssertTrue(
            block.contains("timelinePanel"),
            "placeholderPanel's .timeline case must render timelinePanel, not EmptyView()."
        )
    }
}
