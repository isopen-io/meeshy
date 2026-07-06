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

    // MARK: - Adaptive Liquid Glass (iOS 26)

    func test_platform_isIOS26OrLater_matchesAvailabilityCheck() {
        let expected: Bool
        if #available(iOS 26.0, *) { expected = true } else { expected = false }
        XCTAssertEqual(Platform.isIOS26OrLater, expected)
    }

    @MainActor
    func test_adaptiveGlass_appliesToAnyView_regularAndProminent() {
        // Construction smoke test: fails the build if the public API surface
        // drifts. Real pixel parity across OS versions is a snapshot concern.
        _ = Image(systemName: "mic.fill")
            .frame(width: 56, height: 56)
            .adaptiveGlass(in: Circle(), tint: .white, interactive: true)

        _ = Image(systemName: "mic.fill")
            .frame(width: 56, height: 56)
            .adaptiveGlass()   // defaults: Circle(), no tint, non-interactive

        _ = Image(systemName: "phone.down.fill")
            .frame(width: 56, height: 56)
            .adaptiveGlassProminent(in: Circle(), tint: .red)

        // Non-circular shapes used by floating control chrome (search field
        // pill, mention autocomplete panel) must resolve the generic `Shape`
        // overload too — guards the iter-68i adoption sites.
        _ = Text("search")
            .frame(maxWidth: .infinity)
            .adaptiveGlass(in: RoundedRectangle(cornerRadius: 20))

        _ = Text("mentions")
            .frame(maxHeight: 200)
            .adaptiveGlass(in: Rectangle())

        // Capsule chrome floating above call video (duration badge / effects
        // toolbar pill) — guards the iter-69i adoption sites.
        _ = Text("00:42")
            .padding(.horizontal, 10)
            .adaptiveGlass(in: Capsule())
    }

    @MainActor
    func test_adaptiveGlassContainer_wrapsContent() {
        _ = AdaptiveGlassContainer(spacing: 20) {
            HStack { Text("a"); Text("b") }
        }
    }

    @MainActor
    func test_collapsibleHeader_buildsWithLeadingTitleAndFadeOutSurface() {
        // The header now uses a left/leading title (no centring) and a fade-out
        // blurred surface for ALL screens — no per-screen flags.
        _ = CollapsibleHeader(
            title: "Meeshy",
            scrollOffset: -30,
            showBackButton: false,
            titleColor: .primary,
            backArrowColor: .blue,
            backgroundColor: .black,
            titleView: { Text("Meeshy") },
            trailing: { EmptyView() }
        )
        _ = CollapsibleHeader(
            title: "Settings",
            scrollOffset: 0,
            titleColor: .primary,
            backArrowColor: .blue,
            backgroundColor: .black
        )
        _ = CollapsibleHeader(
            title: "",
            scrollOffset: 0,
            showBackButton: true,
            titleColor: .primary,
            backArrowColor: .blue,
            backgroundColor: .black,
            centerReveal: { Text("author") },
            trailing: { Image(systemName: "ellipsis") }
        )
    }
}
