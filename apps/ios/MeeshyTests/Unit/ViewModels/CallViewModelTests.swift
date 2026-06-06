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

    func test_controls_useGlassEffect_gatedForIOS26() throws {
        let source = try callViewSource()
        XCTAssertTrue(source.contains(".glassEffect("), "Call controls must adopt iOS 26 Liquid Glass via .glassEffect")
        XCTAssertTrue(source.contains("if #available(iOS 26.0, *)"), "Glass must be gated behind #available(iOS 26.0, *)")
    }

    func test_glass_hasMaterialFallback_forOlderIOS() throws {
        let source = try callViewSource()
        // The glass helpers must keep an else-branch fallback so iOS < 26 still
        // renders a translucent control (no blank/incompatible button).
        XCTAssertTrue(source.contains("callControlGlass"), "Reusable glass helper must exist")
        XCTAssertTrue(source.contains(".ultraThinMaterial") || source.contains("Color.white.opacity"),
                      "A pre-iOS-26 material fallback must remain")
    }

    func test_adjacentControls_groupedInGlassEffectContainer() throws {
        let source = try callViewSource()
        // Glass can't sample glass; adjacent control circles must share a
        // GlassEffectContainer so they blend instead of clipping each other.
        XCTAssertTrue(source.contains("GlassEffectContainer"), "Control bar must group glass buttons in a GlassEffectContainer")
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
