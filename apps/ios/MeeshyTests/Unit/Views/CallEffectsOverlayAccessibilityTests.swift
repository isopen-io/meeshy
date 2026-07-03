import XCTest
@testable import Meeshy

@MainActor
final class CallEffectsOverlayAccessibilityTests: XCTestCase {

    private func callEffectsOverlaySource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Views/CallEffectsOverlay.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    func test_backdrop_isExposedAsDismissButtonToVoiceOver() throws {
        let source = try callEffectsOverlaySource()
        guard let range = source.range(of: "onTapGesture { dismiss() }") else {
            XCTFail("Backdrop tap-to-dismiss gesture must exist")
            return
        }
        let end = source.index(range.lowerBound, offsetBy: 400, limitedBy: source.endIndex) ?? source.endIndex
        let vicinity = String(source[range.lowerBound ..< end])
        XCTAssertTrue(
            vicinity.contains(".accessibilityAddTraits(.isButton)"),
            "The tap-outside-to-dismiss backdrop must be exposed as a button trait so " +
            "VoiceOver users can discover and trigger it."
        )
        XCTAssertTrue(
            vicinity.contains(".accessibilityLabel("),
            "The backdrop must have an explicit accessibility label describing the dismiss action."
        )
    }

    func test_toolbarButton_hasExplicitAccessibilityLabel() throws {
        let source = try callEffectsOverlaySource()
        guard let range = source.range(of: "private func toolbarButton") else {
            XCTFail("toolbarButton must exist")
            return
        }
        let end = source.index(range.lowerBound, offsetBy: 1200, limitedBy: source.endIndex) ?? source.endIndex
        let body = String(source[range.lowerBound ..< end])
        XCTAssertTrue(
            body.contains(".accessibilityLabel(label)"),
            "toolbarButton must set an explicit .accessibilityLabel(label) rather than relying " +
            "on the visible caption Text being auto-combined into the button's label."
        )
    }

    func test_overlay_pinsColorSchemeDark() throws {
        let source = try callEffectsOverlaySource()
        XCTAssertTrue(
            source.contains(".environment(\\.colorScheme, .dark)"),
            "CallEffectsOverlay must pin .dark colorScheme like its sibling call chrome " +
            "(CallWaitingBannerView, FloatingCallPillView) so it renders correctly even if " +
            "ever presented outside CallView's forced-dark subtree."
        )
    }

    func test_filtersPanel_heightIsResponsiveNotHardcoded() throws {
        let source = try callEffectsOverlaySource()
        XCTAssertFalse(
            source.contains(".frame(maxHeight: 360)"),
            "The filters panel must not hardcode a fixed maxHeight — it must derive from " +
            "available geometry so it doesn't clip content on short/landscape viewports."
        )
        XCTAssertTrue(
            source.contains("proxy.size.height"),
            "The filters panel height must be derived from a GeometryReader proxy."
        )
    }
}
