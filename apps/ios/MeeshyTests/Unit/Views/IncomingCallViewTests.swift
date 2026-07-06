import XCTest
@testable import Meeshy

// MARK: - IncomingCallView Source Inspection Tests

@MainActor
final class IncomingCallViewTests: XCTestCase {

    private func incomingCallViewSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Views/
            .deletingLastPathComponent()   // Unit/
            .deletingLastPathComponent()   // MeeshyTests/
            .deletingLastPathComponent()   // ios/
            .appendingPathComponent("Meeshy/Features/Main/Views/IncomingCallView.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    // MARK: - VoiceOver announcement on appear

    func test_incomingCallView_postsScreenChangedOnAppear() throws {
        let source = try incomingCallViewSource()
        XCTAssertTrue(
            source.contains("UIAccessibility.post") && source.contains(".screenChanged"),
            "IncomingCallView must post a UIAccessibility.screenChanged notification " +
            "on appear so VoiceOver users are immediately informed of the incoming call " +
            "when the view slides up — without it the ringing animation is completely silent."
        )
    }

    func test_incomingCallView_announcementUsesCallerName() throws {
        let source = try incomingCallViewSource()
        XCTAssertTrue(
            source.contains("call.incoming.a11y.announced"),
            "IncomingCallView must reference the call.incoming.a11y.announced localization " +
            "key in the screenChanged notification so the announcement is localizable."
        )
    }

    func test_incomingCallView_announcementIncludesCallType() throws {
        let source = try incomingCallViewSource()
        XCTAssertTrue(
            source.contains("callTypeLabel"),
            "The screenChanged announcement must incorporate the call type (audio vs video) " +
            "so VoiceOver announces 'Appel vidéo entrant' or 'Appel entrant' as appropriate."
        )
    }

    // MARK: - Reduce Motion support

    func test_incomingCallView_readsReduceMotionEnvironment() throws {
        let source = try incomingCallViewSource()
        XCTAssertTrue(
            source.contains("accessibilityReduceMotion"),
            "IncomingCallView must read @Environment(\\.accessibilityReduceMotion) " +
            "to conditionally suppress ring pulse and avatar bounce animations."
        )
    }

    func test_incomingCallView_ringAnimation_isStaticWhenReduceMotion() throws {
        let source = try incomingCallViewSource()
        XCTAssertTrue(
            source.contains("reduceMotion ? nil"),
            "Ring pulse animations must be nil when reduceMotion is enabled — " +
            "repeating scale animations can trigger vestibular discomfort."
        )
    }

    // MARK: - Action button accessibility

    func test_declineButton_hasAccessibilityLabel() throws {
        let source = try incomingCallViewSource()
        XCTAssertTrue(
            source.contains("call.incoming.decline.label"),
            "The decline button must carry an accessibility label so VoiceOver users " +
            "can identify it without exploring by touch."
        )
    }

    func test_acceptButton_hasAccessibilityLabel() throws {
        let source = try incomingCallViewSource()
        XCTAssertTrue(
            source.contains("call.incoming.accept.label"),
            "The accept button must carry an accessibility label describing its function."
        )
    }

    func test_declineButton_hasAccessibilityHint() throws {
        let source = try incomingCallViewSource()
        XCTAssertTrue(
            source.contains("call.incoming.decline.hint"),
            "The decline button must carry an accessibility hint explaining the tap outcome."
        )
    }

    func test_acceptButton_hasAccessibilityHint() throws {
        let source = try incomingCallViewSource()
        XCTAssertTrue(
            source.contains("call.incoming.accept.hint"),
            "The accept button must carry an accessibility hint explaining the tap outcome."
        )
    }

    func test_ringAnimation_isAccessibilityHidden() throws {
        let source = try incomingCallViewSource()
        XCTAssertTrue(
            source.contains("ringAnimation") && source.contains(".accessibilityHidden(true)"),
            "The decorative ring pulse animation must be hidden from VoiceOver " +
            "(.accessibilityHidden(true)) to avoid polluting the accessibility tree."
        )
    }

    // MARK: - Dead code

    func test_doesNotDeclareUnusedColorSchemeReader() throws {
        // Neither `colorScheme` nor the derived `isDark` is read anywhere in
        // this file — IncomingCallView never overrides or branches on the
        // color scheme itself.
        let source = try incomingCallViewSource()
        XCTAssertFalse(
            source.contains("colorScheme"),
            "IncomingCallView must not declare an unused @Environment(\\.colorScheme) reader."
        )
        XCTAssertFalse(
            source.contains("isDark"),
            "IncomingCallView must not declare an unused isDark computed property."
        )
    }
}
