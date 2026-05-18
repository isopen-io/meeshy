import XCTest
import SwiftUI
import MeeshyUI

/// Tests for the multi-version (iOS 16/17/18) `Compatibility/` layer.
///
/// The adaptive wrappers are version-conditional view code, so their richest
/// guarantee — pixel parity across OS versions — belongs to snapshot tests on
/// per-version simulators. The cases below cover what is deterministically
/// assertable in a headless run: the `Platform` capability flags, plus a
/// construction smoke test that fails the build if a wrapper's public API
/// surface drifts.
final class CompatibilityLayerTests: XCTestCase {

    // MARK: - Platform capability flags

    func test_platform_iOS18OrLater_impliesIOS17OrLater() {
        guard Platform.isIOS18OrLater else { return }
        XCTAssertTrue(
            Platform.isIOS17OrLater,
            "A device on iOS 18+ must also satisfy the iOS 17+ check"
        )
    }

    func test_platform_isIOS17OrLater_matchesAvailabilityCheck() {
        let expected: Bool
        if #available(iOS 17.0, *) { expected = true } else { expected = false }
        XCTAssertEqual(Platform.isIOS17OrLater, expected)
    }

    func test_platform_isIOS18OrLater_matchesAvailabilityCheck() {
        let expected: Bool
        if #available(iOS 18.0, *) { expected = true } else { expected = false }
        XCTAssertEqual(Platform.isIOS18OrLater, expected)
    }

    // MARK: - Adaptive wrapper API surface

    @MainActor
    func test_adaptiveContentUnavailableView_buildsWithAndWithoutDescription() {
        _ = AdaptiveContentUnavailableView("Empty", systemImage: "tray")
        _ = AdaptiveContentUnavailableView(
            "Empty",
            systemImage: "tray",
            description: Text("Nothing to show yet")
        )
    }

    @MainActor
    func test_adaptiveSymbolEffects_applyToAnyView() {
        _ = Image(systemName: "star")
            .adaptiveSymbolBounce(value: true)
            .adaptiveSymbolPulse()
    }
}
