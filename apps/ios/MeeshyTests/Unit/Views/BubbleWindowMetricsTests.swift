import XCTest
import SwiftUI
import UIKit
@testable import Meeshy

/// The conversation surfaces size themselves as a *share of the space the app
/// was given*: a bubble caps at 70 % (compact) or 62 % capped at 560 pt
/// (regular) of its container, and the message-menu preview at 62 % of the
/// available height. The gutter left opposite a bubble is not decoration — it
/// is what tells sender from recipient at a glance.
///
/// Those three ratios were taken against `UIScreen.main.bounds`, the **physical
/// display**. `UIScreen.main` is deprecated since iOS 16, and under iPad Split
/// View, Slide Over or Stage Manager the app owns only a fraction of the
/// display: a ratio of the screen is then a ratio of space the app does not
/// have, and it inflates until it stops constraining anything.
///
/// `DeviceLayout.windowSize` is the single source of truth for "the surface the
/// app is actually rendered in"; `bubbleMaxWidth(sizeClass:)` is the convenience
/// that makes the correct measurement the easy one to reach for.
@MainActor
final class BubbleWindowMetricsTests: XCTestCase {

    /// `apps/ios/` — four levels up from `MeeshyTests/Unit/Views/<this file>`.
    private func source(_ relativePath: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent(relativePath)
        return try String(contentsOf: url, encoding: .utf8)
    }

    /// Comment lines are stripped before matching: the doc-comments deliberately
    /// name the deprecated API to explain why it is banned here, and a guard that
    /// trips on its own rationale is a guard nobody keeps.
    private func codeLines(_ source: String) -> String {
        AppSourceGuard.stripComments(source)
    }

    private static let deviceLayout = "Meeshy/Core/DeviceLayout.swift"
    private static let bubbleStandardLayout = "Meeshy/Features/Main/Views/Bubble/BubbleStandardLayout.swift"
    private static let messageOverlayMenu = "Meeshy/Features/Main/Components/MessageOverlayMenu.swift"
    private static let messageListView = "Meeshy/Features/Main/Views/MessageListView.swift"

    // MARK: - The ratio only constrains when it is taken against the window

    /// Nominal path: a bubble in a 320 pt-wide container keeps a 96 pt gutter —
    /// comfortably more than the row's `Spacer(minLength: 50)`, which means the
    /// whitespace is ratio-driven (a design decision) and not spacer-driven (a
    /// last-resort floor).
    func test_bubbleMaxWidth_takenAgainstTheWindow_keepsTheGutterRatioDriven() {
        let window: CGFloat = 320
        let cap = DeviceLayout.bubbleMaxWidth(containerWidth: window, sizeClass: .compact)

        XCTAssertEqual(cap, 224, accuracy: 0.001)
        XCTAssertGreaterThan(
            window - cap, 50,
            "The gutter must be wider than the row's Spacer(minLength: 50) floor, otherwise the " +
            "70 % rule is decorative and the bubble is really sized by the spacer."
        )
    }

    /// The defect, in one assertion. iPad Pro 12.9\" landscape is 1366 pt wide;
    /// a Slide Over window is ~320 pt. Fed the display, the cap lands at 956 pt
    /// — three times the window — so `.frame(maxWidth:)` never binds and the
    /// bubble runs to the full width minus its 50 pt spacer, i.e. ~84 % instead
    /// of the intended 70 %.
    func test_bubbleMaxWidth_takenAgainstTheDisplay_stopsCappingInASlideOverWindow() {
        let display: CGFloat = 1366
        let window: CGFloat = 320

        let fromDisplay = DeviceLayout.bubbleMaxWidth(containerWidth: display, sizeClass: .compact)
        let fromWindow = DeviceLayout.bubbleMaxWidth(containerWidth: window, sizeClass: .compact)

        XCTAssertGreaterThan(
            fromDisplay, window,
            "A cap wider than the window it applies to is inert — this is exactly what reading " +
            "UIScreen.main.bounds.width produced."
        )
        XCTAssertLessThan(fromWindow, window)
    }

    /// Same failure at regular width, where the 560 pt ceiling masks it: an iPad
    /// 12.9" split 50/50 gives a ~683 pt window. Measured on the display the cap
    /// saturates at 560 pt — 82 % of the window instead of the intended 62 %.
    func test_bubbleMaxWidth_atRegularWidth_theCeilingHidesTheDisplayError() {
        let display: CGFloat = 1366
        let window: CGFloat = 683

        let fromDisplay = DeviceLayout.bubbleMaxWidth(containerWidth: display, sizeClass: .regular)
        let fromWindow = DeviceLayout.bubbleMaxWidth(containerWidth: window, sizeClass: .regular)

        XCTAssertEqual(fromDisplay, 560, accuracy: 0.001)
        XCTAssertEqual(fromWindow, window * 0.62, accuracy: 0.001)
        XCTAssertGreaterThan(
            fromDisplay / window, 0.8,
            "Saturated at its 560 pt ceiling, the display-derived cap occupies over 80 % of the " +
            "window — the 62 % rule is gone."
        )
    }

    // MARK: - Full screen is unchanged

    /// The whole point of the change is that it moves nothing on the nominal
    /// path. The unit-test host runs full screen, so the window *is* the display
    /// and every call site keeps its previous value — on iPhone this iteration
    /// is visually a no-op.
    func test_windowSize_inAFullScreenHost_matchesTheDisplay() {
        XCTAssertGreaterThan(DeviceLayout.windowSize.width, 0)
        XCTAssertGreaterThan(DeviceLayout.windowSize.height, 0)
        XCTAssertEqual(
            DeviceLayout.windowSize.width, UIScreen.main.bounds.width, accuracy: 0.001,
            "Full screen, window == display: the migrated call sites must keep their previous values."
        )
        XCTAssertEqual(
            DeviceLayout.windowSize.height, UIScreen.main.bounds.height, accuracy: 0.001
        )
    }

    /// The convenience is a delegation, not a second formula — the ratios stay
    /// in one place and remain independently testable.
    func test_bubbleMaxWidthConvenience_delegatesToTheWindowMeasurement() {
        for sizeClass: UserInterfaceSizeClass in [.compact, .regular] {
            XCTAssertEqual(
                DeviceLayout.bubbleMaxWidth(sizeClass: sizeClass),
                DeviceLayout.bubbleMaxWidth(
                    containerWidth: DeviceLayout.windowSize.width,
                    sizeClass: sizeClass
                ),
                accuracy: 0.001
            )
        }
    }

    // MARK: - Single-source-of-truth lock

    func test_bubbleStandardLayout_capsAgainstTheWindow() throws {
        let code = codeLines(try source(Self.bubbleStandardLayout))

        XCTAssertTrue(
            code.contains("DeviceLayout.bubbleMaxWidth(sizeClass: horizontalSizeClass)"),
            "The conversation bubble must cap against the app's window."
        )
        XCTAssertFalse(
            code.contains("bubbleMaxWidth(containerWidth: UIScreen"),
            "The bubble cap must never be derived from the physical display."
        )
    }

    func test_messageOverlayMenu_previewCapsAgainstTheWindow() throws {
        let code = codeLines(try source(Self.messageOverlayMenu))

        XCTAssertTrue(
            code.contains("DeviceLayout.bubbleMaxWidth(sizeClass: horizontalSizeClass)"),
            "The long-press preview must use the same cap as the bubble it mirrors."
        )
        XCTAssertFalse(
            code.contains("UIScreen.main"),
            "MessageOverlayMenu already reads its own GeometryReader for every other metric."
        )
    }

    func test_messageMenuPreviewContainer_capsAgainstTheWindow() throws {
        let code = codeLines(try source(Self.messageListView))

        XCTAssertTrue(
            code.contains("DeviceLayout.windowSize.height * 0.62"),
            "The native context-menu preview height must be a share of the window."
        )
        XCTAssertFalse(
            code.contains("UIScreen.main"),
            "MessageListView must not measure the physical display."
        )
    }

    /// `DeviceLayout` keeps exactly one reference to the deprecated API: the
    /// documented last-resort fallback used when no foreground scene is attached
    /// — a context where nothing is being laid out anyway. Pinning the count is
    /// what makes this a single source of truth rather than a fourth copy.
    func test_deviceLayout_holdsTheOnlyRemainingDisplayFallback() throws {
        let code = codeLines(try source(Self.deviceLayout))

        XCTAssertEqual(
            code.components(separatedBy: "UIScreen.main").count - 1, 1,
            "DeviceLayout must carry a single, documented display fallback — no more, no fewer."
        )
        XCTAssertTrue(
            code.contains("activationState == .foregroundActive"),
            "The scene must be resolved by activation state: `connectedScenes` is an unordered " +
            "Set, so `.first` can return a background scene under multi-window."
        )
        XCTAssertTrue(
            code.contains("isKeyWindow"),
            "Within the foreground scene, the key window is the one hosting the app's UI."
        )
    }
}
