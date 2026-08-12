import XCTest
@testable import Meeshy

/// Wiring guards for the pinch-to-resize PiP tiers (spec
/// 2026-08-03-call-bubble-pip-resize-morph-design.md) — same source-inspection
/// convention as `CallBubbleViewMiniMenuWiringTests` (no SwiftUI gesture
/// simulation harness in this project, see `apps/ios/CLAUDE.md`).
@MainActor
final class CallBubbleViewSizeTierWiringTests: XCTestCase {

    private func callBubbleViewSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Views/
            .deletingLastPathComponent()   // Unit/
            .deletingLastPathComponent()   // MeeshyTests/
            .deletingLastPathComponent()   // ios/
            .appendingPathComponent("Meeshy/Features/Main/Views/CallBubbleView.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    func test_pinchGesture_isAttachedToCluster() throws {
        let source = try callBubbleViewSource()
        XCTAssertTrue(
            source.contains(".simultaneousGesture(pinchGesture)"),
            "The pinch-to-resize MagnificationGesture must be attached to the same " +
            "cluster as drag/long-press/tap, not swapped in per tier — a gesture handed " +
            "off between views loses continuity across a tier transition."
        )
    }

    func test_pinchGesture_usesResolverForProgressAndSnap() throws {
        let source = try callBubbleViewSource()
        XCTAssertTrue(
            source.contains("CallBubbleGestureResolver.progress(startingTier:"),
            "The pinch gesture must derive live progress from the pure resolver, not " +
            "inline scale math in the view."
        )
        XCTAssertTrue(
            source.contains("CallBubbleGestureResolver.nextTier(progress:"),
            "Releasing the pinch must snap via the pure resolver's nextTier(...), matching " +
            "the drag gesture's existing delegation to CallBubbleGestureResolver."
        )
    }

    func test_callParticipantVisual_usesInterpolatedRectangleInitializer() throws {
        let source = try callBubbleViewSource()
        XCTAssertTrue(
            source.contains("CallParticipantVisual(width: size.width, height: size.height, cornerRadius: cornerRadius, callManager: callManager)"),
            "CallBubbleView must drive CallParticipantVisual's size from the live " +
            "interpolated tier size, not a fixed circle diameter."
        )
    }

    func test_tierControlBar_opacityFollowsResolverCurve() throws {
        let source = try callBubbleViewSource()
        XCTAssertTrue(
            source.contains("CallBubbleGestureResolver.controlBarOpacity(progress:"),
            "The persistent mute/speaker/hangup bar at the rectangle tiers must fade in " +
            "using the resolver's curve, not pop in abruptly at a tier boundary."
        )
    }

    func test_miniMenu_isGatedToCircleRegion() throws {
        let source = try callBubbleViewSource()
        XCTAssertTrue(
            source.contains("isCircleRegion && isMenuRevealed"),
            "The long-press mini-menu cluster must only render in the circle region " +
            "(progress < 0.5) — at the rectangle tiers, controls are already always-on " +
            "via the persistent bar, so the long-press cluster must not double up."
        )
    }

    func test_revealMenu_guardsAgainstNonCircleRegion() throws {
        let source = try callBubbleViewSource()
        guard let range = source.range(of: "private func revealMenu()") else {
            XCTFail("revealMenu not found"); return
        }
        let end = source.range(of: "private func closeMenu()", range: range.upperBound..<source.endIndex)?.lowerBound
            ?? source.endIndex
        let body = String(source[range.lowerBound..<end])
        XCTAssertTrue(
            body.contains("guard currentProgress < 0.5 else { return }"),
            "revealMenu() must refuse to open the mini-menu outside the circle region — " +
            "long-pressing an already-enlarged rectangle tier must not summon a redundant menu."
        )
    }

    func test_accessibilityAdjustableAction_changesTier() throws {
        let source = try callBubbleViewSource()
        XCTAssertTrue(
            source.contains(".accessibilityAdjustableAction { direction in"),
            "VoiceOver users cannot pinch — an adjustable action (swipe up/down with the " +
            "rotor) must let them cycle through the PiP size tiers instead."
        )
    }

    func test_bubbleCenter_derivesFromCurrentSize_notFixedDiameter() throws {
        let source = try callBubbleViewSource()
        XCTAssertTrue(
            source.contains("private func bubbleCenter(in geometry: GeometryProxy, size: CGSize)"),
            "bubbleCenter must take the current interpolated size so a large rectangle " +
            "tier is vertically clamped by its own half-height, not the small circle's " +
            "fixed radius — otherwise a .large tier can render off-screen or into the FAB zone."
        )
    }
}
