import XCTest
@testable import Meeshy

/// Source-level guards for `ActiveSessionsView` VoiceOver structure (iteration 168i).
///
/// `ActiveSessionsView` is a security-sensitive screen (the list of active login
/// sessions). Its rows used to fragment into ~5 VoiceOver stops (device glyph,
/// device name, "Current" badge, IP, last-active). 168i groups the informational
/// block into one element and hides the decorative device glyph, while keeping the
/// per-session "Revoke" button separately actionable. Same pattern as
/// `CallViewAccessibilityTests` / `CallDetailSheetAccessibilityTests`.
@MainActor
final class ActiveSessionsViewAccessibilityTests: XCTestCase {

    private func activeSessionsViewSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Views/ActiveSessionsView.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    func test_sessionRow_infoBlock_isCombinedIntoOneVoiceOverElement() throws {
        let source = try activeSessionsViewSource()
        XCTAssertTrue(
            source.contains(".accessibilityElement(children: .combine)"),
            "The session row's informational block (device + current status + IP + last-active) " +
            "must be combined into ONE VoiceOver element so VoiceOver reads it as a single " +
            "announcement instead of ~5 fragmented stops."
        )
    }

    func test_deviceGlyph_isHiddenFromVoiceOver() throws {
        let source = try activeSessionsViewSource()
        // The iphone/desktopcomputer glyph is decorative — the device identity is
        // carried by `deviceName` inside the combined label — so it must not add a
        // redundant VoiceOver stop.
        XCTAssertTrue(
            source.contains(".accessibilityHidden(true)"),
            "The decorative device-type glyph must be hidden from VoiceOver."
        )
    }

    func test_screenTitle_carriesHeaderTrait() throws {
        let source = try activeSessionsViewSource()
        XCTAssertTrue(
            source.contains(".accessibilityAddTraits(.isHeader)"),
            "The screen title ('Sessions actives') must carry the header trait so VoiceOver " +
            "users can jump to it via the Headings rotor."
        )
    }

    func test_revokeButton_remainsSeparatelyLabelled() throws {
        let source = try activeSessionsViewSource()
        // Grouping the info block must NOT swallow the per-session revoke action:
        // the button keeps its own explicit label and stays actionable.
        XCTAssertTrue(
            source.contains("sessions_revoke"),
            "The per-session revoke button must remain a separately-labelled, actionable element."
        )
    }

    func test_emptyState_usesNativeContentUnavailableView() throws {
        // 196i: the empty state was a bare icon-less `Text`. It now delegates to the
        // shared `AdaptiveContentUnavailableView` (native `ContentUnavailableView`
        // on iOS 17+, faithful iOS 16 fallback) — giving it a Dynamic-Type-scaling
        // SF Symbol, a guiding subtitle, and native title+description VoiceOver
        // grouping. Guards against regressing to a bespoke bare `Text`.
        let source = try activeSessionsViewSource()
        XCTAssertTrue(
            source.contains("AdaptiveContentUnavailableView("),
            "The empty state must delegate to the shared native ContentUnavailableView wrapper."
        )
    }
}
