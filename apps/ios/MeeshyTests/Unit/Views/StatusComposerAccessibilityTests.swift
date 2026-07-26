import XCTest
@testable import Meeshy

/// The mood composer's primary action lives in the navigation bar and swaps its
/// label for a bare `ProgressView` while the mood is being published. A view with
/// no text carries no accessible name, so in that state VoiceOver announced an
/// unnamed, dimmed button — and it never explained *why* the button is dimmed
/// before a mood is picked. The feed composer's publish button already solves
/// exactly this (label + value pinned across states); this suite holds the mood
/// composer to the same contract.
@MainActor
final class StatusComposerAccessibilityTests: XCTestCase {

    private func composerSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Views/StatusComposerView.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    /// The vicinity following a source anchor, so an assertion targets the modifier
    /// chain of that control rather than a same-named modifier elsewhere in the file.
    /// The span is measured, not guessed: the furthest assertion below lands at 731
    /// characters past this anchor.
    private func vicinity(after anchor: String, in source: String, span: Int = 900) throws -> String {
        guard let range = source.range(of: anchor) else {
            XCTFail("StatusComposerView must contain \(anchor)")
            return ""
        }
        let end = source.index(range.upperBound, offsetBy: span, limitedBy: source.endIndex) ?? source.endIndex
        return String(source[range.upperBound ..< end])
    }

    private func publishButtonModifiers() throws -> String {
        // `.disabled(selectedEmoji == nil || isPublishing)` closes the publish
        // button's own chain and appears exactly once in the file.
        try vicinity(after: ".disabled(selectedEmoji == nil || isPublishing)", in: try composerSource())
    }

    // MARK: - The publish button is named in every state

    func test_publishButton_carriesAnAccessibilityLabel() throws {
        let modifiers = try publishButtonModifiers()
        XCTAssertTrue(
            modifiers.contains(".accessibilityLabel("),
            "The publish button must pin an accessibility label: while publishing its label is a bare " +
            "ProgressView, which contributes no accessible name, so VoiceOver announces an unnamed button."
        )
        XCTAssertTrue(
            modifiers.contains("status.composer.publish\""),
            "The publish button's accessibility label must reuse the key already backing its visible " +
            "title (status.composer.publish) so the spoken and rendered names cannot drift apart."
        )
    }

    // MARK: - The button explains its own unavailability

    func test_publishButton_announcesThePublishingState() throws {
        let modifiers = try publishButtonModifiers()
        XCTAssertTrue(
            modifiers.contains(".accessibilityValue("),
            "The publish button must expose its transient state as an accessibility value."
        )
        XCTAssertTrue(
            modifiers.contains("status.composer.publish.a11y.publishing"),
            "While isPublishing is true the button must announce that the mood is being sent — the " +
            "spinner that replaces its title is invisible to VoiceOver."
        )
    }

    func test_publishButton_explainsWhyItIsDimmedWithoutAMood() throws {
        let modifiers = try publishButtonModifiers()
        XCTAssertTrue(
            modifiers.contains("status.composer.publish.a11y.disabled"),
            "With no mood selected the button is disabled; VoiceOver says 'dimmed' but not why. The " +
            "value must name the missing precondition, as the feed composer's publish button does."
        )
    }

    func test_publishButton_staysSilentWhenItIsReady() throws {
        let modifiers = try publishButtonModifiers()
        XCTAssertTrue(
            modifiers.contains(": \"\")"),
            "When a mood is selected and nothing is in flight the value must be empty: an actionable " +
            "button should announce its name alone, with no residual state commentary."
        )
    }
}
