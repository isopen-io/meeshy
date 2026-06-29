import XCTest
@testable import Meeshy

@MainActor
final class CallViewAccessibilityTests: XCTestCase {

    private func callViewSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Views/CallView.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    // MARK: - Video duration badge

    func test_videoDurationBadge_hasExplicitAccessibilityLabel() throws {
        let source = try callViewSource()
        XCTAssertTrue(
            source.contains("call.duration.a11y.label"),
            "The video call duration badge must carry an explicit .accessibilityLabel " +
            "so VoiceOver announces the timer with context (e.g. 'Durée de l'appel, 05:32') " +
            "rather than raw digits ('05:32')."
        )
    }

    func test_videoDurationBadge_hasAccessibilityValue() throws {
        let source = try callViewSource()
        XCTAssertTrue(
            source.contains("accessibilityValue(callManager.formattedDuration)"),
            "The video duration badge must expose the timer via .accessibilityValue " +
            "so VoiceOver reads the label once and the dynamic value separately."
        )
    }

    func test_videoDurationBadge_hasUpdatesFrequentlyTrait() throws {
        let source = try callViewSource()
        let badgeRange = source.range(of: "call.duration.a11y.label")
        XCTAssertNotNil(badgeRange, "Duration badge must have accessibility label")
        if let r = badgeRange {
            let window = source.index(r.upperBound, offsetBy: 200, limitedBy: source.endIndex) ?? source.endIndex
            let vicinity = String(source[r.lowerBound ..< window])
            XCTAssertTrue(
                vicinity.contains(".updatesFrequently"),
                "The duration badge must carry .updatesFrequently so VoiceOver " +
                "does not interrupt the user every second with a new timer value."
            )
        }
    }

    // MARK: - Call ended VoiceOver announcement

    func test_callState_ended_postsVoiceOverAnnouncement() throws {
        let source = try callViewSource()
        XCTAssertTrue(
            source.contains("call.a11y.ended"),
            "The .ended call state must post a UIAccessibility.announcement so " +
            "VoiceOver users are informed that the call has terminated. Without this, " +
            "a blind user hears nothing when the call ends."
        )
    }

    func test_callState_ended_announcementIsInOnChangeHandler() throws {
        let source = try callViewSource()
        guard let changeRange = source.range(of: "adaptiveOnChange(of: callManager.callState)") else {
            XCTFail("CallView must use adaptiveOnChange to observe callState transitions")
            return
        }
        let end = source.index(changeRange.lowerBound, offsetBy: 600, limitedBy: source.endIndex) ?? source.endIndex
        let handler = String(source[changeRange.lowerBound ..< end])
        XCTAssertTrue(
            handler.contains("call.a11y.ended"),
            "The .ended announcement must live inside the adaptiveOnChange(of: callManager.callState) " +
            "handler, not in a separate modifier, so it fires exactly once per state transition."
        )
    }

    // MARK: - callControlButton hint handling

    func test_callControlButton_doesNotPassEmptyHint() throws {
        let source = try callViewSource()
        XCTAssertFalse(
            source.contains(".accessibilityHint(hint ?? \"\")"),
            "callControlButton must not pass an empty string to .accessibilityHint. " +
            "Use .optionalAccessibilityHint(_:) so the modifier is skipped entirely when " +
            "the hint is nil — empty strings create a redundant no-op modifier chain."
        )
    }

    func test_callControlButton_usesOptionalAccessibilityHint() throws {
        let source = try callViewSource()
        XCTAssertTrue(
            source.contains("optionalAccessibilityHint(hint)"),
            "callControlButton must delegate hint application to .optionalAccessibilityHint " +
            "so the modifier is only applied when a non-nil hint is provided."
        )
    }

    func test_optionalAccessibilityHint_extensionDefined() throws {
        let source = try callViewSource()
        XCTAssertTrue(
            source.contains("func optionalAccessibilityHint"),
            "A private View extension must define optionalAccessibilityHint so other " +
            "call UI components can reuse the same conditional hint pattern."
        )
    }
}
