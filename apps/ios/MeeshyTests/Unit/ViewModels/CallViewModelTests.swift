//
//  CallViewModelTests.swift
//  MeeshyTests
//

import XCTest
@testable import Meeshy

@MainActor
final class CallViewModelTests: XCTestCase {
    var sut: CallViewModel!

    func testInitiateCall_Success() async {
        // Test initiating a call
    }

    func testAnswerCall_Success() async {
        // Test answering incoming call
    }

    func testDeclineCall_Success() async {
        // Test declining call
    }

    func testEndCall_Success() async {
        // Test ending active call
    }

    func testToggleMute() {
        // Test muting/unmuting
    }

    func testToggleVideo() {
        // Test enabling/disabling video
    }

    func testCallDuration() async {
        // Test call duration tracking
    }

    func testWebRTCConnection() async {
        // Test WebRTC connection establishment
    }
}

// MARK: - CallView Liquid Glass + Layout (iOS 26)

/// Source-level guards for the iOS 26 Liquid Glass adoption and the intelligent
/// control-bar layout. SwiftUI views aren't unit-testable headless, so we assert
/// the structural invariants in the source (same pattern as CallManager guards).
final class CallViewLiquidGlassTests: XCTestCase {

    private func callViewSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // ViewModels
            .deletingLastPathComponent()   // Unit
            .deletingLastPathComponent()   // MeeshyTests
            .deletingLastPathComponent()   // apps/ios
            .appendingPathComponent("Meeshy/Features/Main/Views/CallView.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    func test_controls_useSDKAdaptiveGlass_notInlineAvailability() throws {
        let source = try callViewSource()
        // The version gate belongs to the SDK Compatibility layer (adaptiveGlass /
        // adaptiveGlassProminent), like every other adaptive wrapper — NOT an
        // inline #available in the app view.
        XCTAssertTrue(source.contains("adaptiveGlass("), "Call controls must use the SDK adaptiveGlass wrapper")
        XCTAssertTrue(source.contains("adaptiveGlassProminent("), "Hang-up button must use the SDK adaptiveGlassProminent wrapper")
        XCTAssertFalse(source.contains("#available(iOS 26"), "iOS 26 gating must live in the SDK Compatibility layer, not inline in CallView")
        XCTAssertFalse(source.contains(".glassEffect("), "CallView must not call .glassEffect directly — go through the SDK wrapper")
    }

    func test_adjacentControls_groupedInAdaptiveGlassContainer() throws {
        let source = try callViewSource()
        // Glass can't sample glass; adjacent control circles must share a
        // container so they blend instead of clipping each other. The app uses
        // the SDK AdaptiveGlassContainer (GlassEffectContainer on iOS 26).
        XCTAssertTrue(source.contains("AdaptiveGlassContainer"), "Control bar must group glass buttons in AdaptiveGlassContainer")
    }

    func test_controlBar_usesViewThatFits_forIntelligentLayout() throws {
        let source = try callViewSource()
        // Centred when it fits, horizontal-scroll fallback only when too narrow —
        // so the camera-flip and other controls are evenly positioned, not
        // left-anchored in a scroll view.
        XCTAssertTrue(source.contains("ViewThatFits"), "Control bar must use ViewThatFits for an intelligently centred layout")
    }

    func test_controlButton_separatesCaptionFromAccessibilityLabel() throws {
        let source = try callViewSource()
        // Short visible caption + long VoiceOver label keep every column the same
        // width (no button ballooning to fit a long French label).
        XCTAssertTrue(source.contains("caption: String"), "callControlButton must take a short visible caption distinct from the a11y label")
        XCTAssertTrue(source.contains("camera.rotate.fill"), "Camera flip control must be present in the bar")
    }
}
