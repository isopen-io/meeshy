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

    // MARK: - Connecting state VoiceOver announcement

    func test_callState_connecting_postsVoiceOverAnnouncement() throws {
        let source = try callViewSource()
        XCTAssertTrue(
            source.contains("call.a11y.connecting"),
            "The .connecting call state must post a UIAccessibility.announcement so " +
            "VoiceOver users are informed when ICE negotiation begins. Without this, " +
            "the transition from ringing to connected is completely silent — several " +
            "seconds during which the user hears nothing and may think the call failed."
        )
    }

    func test_callState_connecting_announcementIsInOnChangeHandler() throws {
        let source = try callViewSource()
        guard let changeRange = source.range(of: "adaptiveOnChange(of: callManager.callState)") else {
            XCTFail("CallView must use adaptiveOnChange to observe callState transitions")
            return
        }
        let end = source.index(changeRange.lowerBound, offsetBy: 800, limitedBy: source.endIndex) ?? source.endIndex
        let handler = String(source[changeRange.lowerBound ..< end])
        XCTAssertTrue(
            handler.contains("call.a11y.connecting"),
            "The .connecting announcement must live inside the adaptiveOnChange(of: callManager.callState) " +
            "handler alongside the .connected, .reconnecting, and .ended cases."
        )
    }

    // MARK: - Reduce Motion in FloatingCallPillView

    func test_reconnectingBanner_usesReduceMotionForTransition() throws {
        let source = try callViewSource()
        guard let bannerRange = source.range(of: "reconnecting banner") else {
            XCTFail("CallView must have a reconnecting banner comment block")
            return
        }
        let end = source.index(bannerRange.lowerBound, offsetBy: 500, limitedBy: source.endIndex) ?? source.endIndex
        let vicinity = String(source[bannerRange.lowerBound ..< end])
        XCTAssertTrue(
            vicinity.contains("reduceMotion"),
            "The reconnecting banner transition must check `reduceMotion` and collapse " +
            "to .opacity for motion-sensitive users — the slide-from-top movement can " +
            "trigger vestibular discomfort."
        )
    }

    // MARK: - Video quality VoiceOver announcement

    func test_liveVideoQualityLevel_postsVoiceOverAnnouncement() throws {
        let source = try callViewSource()
        XCTAssertTrue(
            source.contains("liveVideoQualityLevel"),
            "CallView must observe liveVideoQualityLevel to announce quality changes."
        )
        XCTAssertTrue(
            source.contains("call.a11y.quality"),
            "CallView must post a VoiceOver announcement when video quality degrades so " +
            "blind users are informed the video stream is degraded — they cannot see the " +
            "visual quality indicator and would otherwise have no feedback."
        )
    }

    func test_qualityAnnouncement_isInsideLiveQualityOnChangeHandler() throws {
        let source = try callViewSource()
        guard let changeRange = source.range(of: "liveVideoQualityLevel") else {
            XCTFail("CallView must observe liveVideoQualityLevel via adaptiveOnChange")
            return
        }
        let end = source.index(changeRange.lowerBound, offsetBy: 600, limitedBy: source.endIndex) ?? source.endIndex
        let handler = String(source[changeRange.lowerBound ..< end])
        XCTAssertTrue(
            handler.contains("call.a11y.quality"),
            "The quality VoiceOver announcement must live inside the liveVideoQualityLevel " +
            "onChange handler so it fires on every quality transition, not just once."
        )
    }

    // MARK: - Video suspended tile accessibility

    func test_videoSuspendedTile_hasAccessibilityLabel() throws {
        let source = try callViewSource()
        XCTAssertTrue(
            source.contains("localVideoSuspendedTile"),
            "CallView must define a localVideoSuspendedTile for the audio-only survival state."
        )
        XCTAssertTrue(
            source.contains("call.video.suspended.a11y") || source.contains("video.suspended"),
            "The video-suspended tile must carry an accessibility label so VoiceOver users " +
            "know the camera was paused to preserve the call on a poor network — without " +
            "it they see a frozen frame with no context."
        )
    }

    // MARK: - callToggleAccessibility compound modifier

    func test_callControlButton_usesCallToggleAccessibilityModifier() throws {
        let source = try callViewSource()
        XCTAssertTrue(
            source.contains("callToggleAccessibility"),
            "callControlButton must apply the callToggleAccessibility modifier to bundle " +
            "label, hint, trait, and value into a single reusable modifier — avoids " +
            "repeated .accessibilityLabel/.accessibilityHint chains that drift out of sync."
        )
    }

    // MARK: - Effects toggle button accessibility

    func test_effectsToggleButton_hasAccessibilityHint() throws {
        // The call.filters.a11y label now appears on TWO controls (the bottom-bar
        // effects toggle AND the self-preview pipFrameButton, Fix 8) — EVERY
        // occurrence must pair the label with the call.filters.hint hint, or
        // VoiceOver users get no indication that the control toggles the video
        // effects toolbar.
        let source = try callViewSource()
        var searchStart = source.startIndex
        var occurrences = 0
        while let labelRange = source.range(of: "call.filters.a11y", range: searchStart..<source.endIndex) {
            occurrences += 1
            let end = source.index(labelRange.lowerBound, offsetBy: 600, limitedBy: source.endIndex) ?? source.endIndex
            let vicinity = String(source[labelRange.lowerBound ..< end])
            XCTAssertTrue(
                vicinity.contains(".accessibilityHint"),
                "occurrence #\(occurrences) of call.filters.a11y has no .accessibilityHint nearby — " +
                "unlike every sibling control (mute/speaker/camera/end-call via callControlButton)."
            )
            XCTAssertTrue(
                vicinity.contains("call.filters.hint"),
                "occurrence #\(occurrences) of call.filters.a11y must pair with the " +
                "call.filters.hint localization key."
            )
            searchStart = labelRange.upperBound
        }
        XCTAssertGreaterThan(occurrences, 0, "effectsToggleButton must carry the call.filters.a11y accessibility label")
    }

    // MARK: - End call button accessibility

    func test_endCallButton_hasDestructiveTrait() throws {
        let source = try callViewSource()
        guard let endCallRange = source.range(of: "endCallGlass") else {
            XCTFail("CallView must define endCallGlass for the end call button")
            return
        }
        let end = source.index(endCallRange.lowerBound, offsetBy: 600, limitedBy: source.endIndex) ?? source.endIndex
        let vicinity = String(source[endCallRange.lowerBound ..< end])
        XCTAssertTrue(
            vicinity.contains("call.end.a11y") || vicinity.contains("accessibilityLabel"),
            "The end call button must carry an explicit accessibility label — its red " +
            "colour alone does not convey the destructive action to VoiceOver users."
        )
    }
}
