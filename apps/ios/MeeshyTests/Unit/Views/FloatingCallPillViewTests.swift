import XCTest
@testable import Meeshy

// MARK: - CallPillStatus Unit Tests

@MainActor
final class CallPillStatusTests: XCTestCase {

    // MARK: - from(_ state:) mapping

    func test_from_connected_returnsConnected() {
        XCTAssertEqual(CallPillStatus.from(.connected), .connected)
    }

    func test_from_outgoingRinging_returnsRinging() {
        XCTAssertEqual(CallPillStatus.from(.ringing(isOutgoing: true)), .ringing)
    }

    func test_from_incomingRinging_returnsRinging() {
        XCTAssertEqual(CallPillStatus.from(.ringing(isOutgoing: false)), .ringing)
    }

    func test_from_offering_returnsConnecting() {
        XCTAssertEqual(CallPillStatus.from(.offering), .connecting)
    }

    func test_from_connecting_returnsConnecting() {
        XCTAssertEqual(CallPillStatus.from(.connecting), .connecting)
    }

    func test_from_reconnecting_returnsReconnecting() {
        XCTAssertEqual(CallPillStatus.from(.reconnecting(attempt: 1)), .reconnecting)
    }

    func test_from_reconnecting_highAttempt_returnsReconnecting() {
        XCTAssertEqual(CallPillStatus.from(.reconnecting(attempt: 5)), .reconnecting)
    }

    func test_from_idle_returnsConnecting_safeNonConnectedFallback() {
        // The pill is hidden when `.idle` (isActive == false); mapping to
        // `.connecting` ensures a stray render never displays a green "00:00".
        XCTAssertEqual(CallPillStatus.from(.idle), .connecting)
    }

    func test_from_ended_returnsConnecting_safeNonConnectedFallback() {
        XCTAssertEqual(CallPillStatus.from(.ended(reason: .local)), .connecting)
        XCTAssertEqual(CallPillStatus.from(.ended(reason: .remote)), .connecting)
        XCTAssertEqual(CallPillStatus.from(.ended(reason: .missed)), .connecting)
        XCTAssertEqual(CallPillStatus.from(.ended(reason: .connectionLost)), .connecting)
    }

    // MARK: - isConnected

    func test_isConnected_trueOnlyForConnected() {
        XCTAssertTrue(CallPillStatus.connected.isConnected)
        XCTAssertFalse(CallPillStatus.ringing.isConnected)
        XCTAssertFalse(CallPillStatus.connecting.isConnected)
        XCTAssertFalse(CallPillStatus.reconnecting.isConnected)
    }

    // MARK: - label

    func test_label_emptyForConnected() {
        XCTAssertEqual(CallPillStatus.connected.label, "")
    }

    func test_label_nonEmptyForNonConnectedStates() {
        XCTAssertFalse(CallPillStatus.ringing.label.isEmpty,
                       "ringing status label must not be empty — pill shows pre-connection text")
        XCTAssertFalse(CallPillStatus.connecting.label.isEmpty,
                       "connecting status label must not be empty — pill shows pre-connection text")
        XCTAssertFalse(CallPillStatus.reconnecting.label.isEmpty,
                       "reconnecting status label must not be empty — pill shows pre-connection text")
    }
}

// MARK: - FloatingCallPillView Source Inspection Tests

@MainActor
final class FloatingCallPillViewTests: XCTestCase {

    private func pillSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Views/
            .deletingLastPathComponent()   // Unit/
            .deletingLastPathComponent()   // MeeshyTests/
            .deletingLastPathComponent()   // ios/
            .appendingPathComponent("Meeshy/Features/Main/Views/FloatingCallPillView.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    // MARK: - Reduce Motion support

    func test_pill_readsReduceMotionEnvironment() throws {
        let source = try pillSource()
        XCTAssertTrue(
            source.contains("accessibilityReduceMotion"),
            "FloatingCallPillView must read @Environment(\\.accessibilityReduceMotion) " +
            "to conditionally skip animated transitions for motion-sensitive users."
        )
    }

    func test_pill_transition_usesConditionalOpacityWhenReduceMotion() throws {
        let source = try pillSource()
        XCTAssertTrue(
            source.contains("reduceMotion ? .opacity"),
            "FloatingCallPillView transition must collapse to .opacity when reduceMotion " +
            "is true — .move animations can trigger vestibular discomfort."
        )
    }

    func test_pill_animation_isNilWhenReduceMotion() throws {
        let source = try pillSource()
        XCTAssertTrue(
            source.contains("reduceMotion ? nil"),
            "FloatingCallPillView spring animation must be nil when reduceMotion is true " +
            "so the pill appears/disappears without a spring bounce."
        )
    }

    func test_expandToFullScreen_respectsReduceMotion() throws {
        let source = try pillSource()
        XCTAssertTrue(
            source.contains("reduceMotion ? nil : .spring(response: 0.5"),
            "expandToFullScreen() must gate its withAnimation on reduceMotion — " +
            "unconditional .spring when reduceMotion is enabled triggers a spring " +
            "bounce that can cause vestibular discomfort."
        )
    }

    // MARK: - Accessibility labels on controls

    func test_muteButton_hasAccessibilityLabel() throws {
        let source = try pillSource()
        XCTAssertTrue(
            source.contains("call.pill.mute") && source.contains("call.pill.unmute"),
            "The mute button in FloatingCallPillView must carry dynamic accessibility labels " +
            "reflecting the current mute state so VoiceOver announces the tap outcome."
        )
    }

    func test_speakerButton_hasAccessibilityLabel() throws {
        let source = try pillSource()
        XCTAssertTrue(
            source.contains("call.pill.speaker.on") && source.contains("call.pill.speaker.off"),
            "The speaker button must carry dynamic accessibility labels reflecting the " +
            "current speaker state."
        )
    }

    func test_hangupButton_hasAccessibilityLabel() throws {
        let source = try pillSource()
        XCTAssertTrue(
            source.contains("call.pill.hangup"),
            "The hang-up button must carry an accessibility label so VoiceOver users " +
            "can identify it without exploring by touch."
        )
    }

    func test_expandButton_hasAccessibilityLabel() throws {
        let source = try pillSource()
        XCTAssertTrue(
            source.contains("call.pill.expand"),
            "The expand button must carry an accessibility label describing its function."
        )
    }

    func test_hangupButton_hasAccessibilityHint() throws {
        let source = try pillSource()
        guard let range = source.range(of: "private var hangupButton") else {
            XCTFail("FloatingCallPillView must define hangupButton")
            return
        }
        let end = source.index(range.lowerBound, offsetBy: 1000, limitedBy: source.endIndex) ?? source.endIndex
        let vicinity = String(source[range.lowerBound..<end])
        XCTAssertTrue(
            vicinity.contains(".accessibilityHint("),
            "The hang-up button must carry an accessibility hint — CallView's endCallButton " +
            "already has one (call.end.hint); the pill's hangup button is the same action and " +
            "must not regress behind it for VoiceOver users."
        )
    }

    func test_expandButton_hasAccessibilityHint() throws {
        let source = try pillSource()
        guard let range = source.range(of: "private var expandButton") else {
            XCTFail("FloatingCallPillView must define expandButton")
            return
        }
        let end = source.index(range.lowerBound, offsetBy: 1000, limitedBy: source.endIndex) ?? source.endIndex
        let vicinity = String(source[range.lowerBound..<end])
        XCTAssertTrue(
            vicinity.contains(".accessibilityHint("),
            "The expand button must carry an accessibility hint describing what happens on tap " +
            "(returns to the full-screen call), matching the hint-coverage pattern used " +
            "elsewhere in the calling UI (e.g. call.minimize.hint)."
        )
    }

    func test_pillContent_hasContainerAccessibilityLabel() throws {
        let source = try pillSource()
        XCTAssertTrue(
            source.contains("call.pill.ongoing"),
            "The pill container must carry a combined accessibility label so VoiceOver " +
            "users can quickly identify an active call without having to explore each control."
        )
    }

    func test_pillContent_hasTapToReturnHint() throws {
        let source = try pillSource()
        XCTAssertTrue(
            source.contains("call.pill.tapToReturn"),
            "The pill container must carry an accessibility hint explaining the tap action " +
            "(return to full-screen call)."
        )
    }

    // MARK: - Toggle semantics parity with CallView

    func test_muteButton_appliesToggleAccessibility() throws {
        let source = try pillSource()
        guard let range = source.range(of: "private var muteButton") else {
            XCTFail("FloatingCallPillView must define muteButton")
            return
        }
        let end = source.index(range.lowerBound, offsetBy: 1000, limitedBy: source.endIndex) ?? source.endIndex
        let vicinity = String(source[range.lowerBound ..< end])
        XCTAssertTrue(
            vicinity.contains("callToggleAccessibility(isToggle: true, isActive: callManager.isMuted)"),
            "The mute button must apply .callToggleAccessibility so VoiceOver exposes the " +
            "same toggle trait + on/off value as the equivalent control in CallView — a plain " +
            "label swap alone loses the toggle semantics and rotor navigation support."
        )
    }

    func test_speakerButton_appliesToggleAccessibility() throws {
        let source = try pillSource()
        guard let range = source.range(of: "private var speakerButton") else {
            XCTFail("FloatingCallPillView must define speakerButton")
            return
        }
        let end = source.index(range.lowerBound, offsetBy: 1000, limitedBy: source.endIndex) ?? source.endIndex
        let vicinity = String(source[range.lowerBound ..< end])
        XCTAssertTrue(
            vicinity.contains("callToggleAccessibility(isToggle: true, isActive: callManager.isSpeaker)"),
            "The speaker button must apply .callToggleAccessibility so VoiceOver exposes the " +
            "same toggle trait + on/off value as the equivalent control in CallView."
        )
    }

    // MARK: - Status text

    func test_statusLine_showsDurationOnlyWhenConnected() throws {
        let source = try pillSource()
        XCTAssertTrue(
            source.contains("pillStatus.isConnected ? formattedDuration"),
            "The pill status line must show the live duration ONLY for the .connected state " +
            "— pre-connection states must show a textual label, never 00:00."
        )
    }

    // MARK: - Dynamic Type sizing

    func test_pillContent_usesMinHeightNotExactHeight() throws {
        let source = try pillSource()
        // userInfoSection stacks two Dynamic-Type-scalable Text lines that can
        // exceed pillHeight at accessibility text sizes (AX1+). An exact
        // `.frame(height:)` would force-clip the name/status instead of letting
        // the pill grow to fit its content.
        XCTAssertTrue(
            source.contains(".frame(minHeight: pillHeight)"),
            "pillContent must use .frame(minHeight: pillHeight), not an exact .frame(height:), " +
            "so the pill grows to fit Dynamic Type text instead of clipping it."
        )
        XCTAssertFalse(
            source.contains(".frame(height: pillHeight)"),
            "pillContent must not force an exact height on the pill — that clips " +
            "userInfoSection's text at large accessibility text sizes."
        )
    }
}
