import XCTest
import SwiftUI
import UIKit
@testable import Meeshy

/// Everything a surface needs to know about "the space the app was actually
/// given" comes from one place: `DeviceLayout`.
///
/// Iteration 218i established `DeviceLayout.windowSize` for the conversation
/// bubbles (locked by `BubbleWindowMetricsTests`, which keeps the ratio-specific
/// assertions). It left twelve other surfaces resolving the scene by hand, in
/// three mutually inconsistent dialects:
///
/// 1. `connectedScenes.first` — `connectedScenes` is an *unordered* `Set`, so
///    `.first` can hand back a **background** scene in any multi-window
///    configuration (Split View, Slide Over, Stage Manager, external display).
///    A metric read from it describes a window the user is not looking at.
/// 2. `connectedScenes.compactMap { … }.first { $0.activationState == … }` —
///    correct, but a private copy, and it allocates an intermediate array.
/// 3. `UIScreen.main.bounds` — the **physical display**, deprecated since
///    iOS 16. Under any multitasking mode the app owns a fraction of it, so a
///    layout sized against it is sized against space the app does not have.
///
/// The three accessors below share a single window resolution, so a surface can
/// no longer be accidentally right about the size and wrong about the insets:
///
/// - `DeviceLayout.windowSize`       — the window's bounds
/// - `DeviceLayout.safeAreaInsets`   — that same window's insets
/// - `DeviceLayout.activeWindowScene` — that same window's scene
@MainActor
final class WindowMetricsSingleSourceTests: XCTestCase {

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
    /// name the banned APIs to explain why they are banned, and a guard that
    /// trips on its own rationale is a guard nobody keeps.
    private func codeLines(_ source: String) -> String {
        source
            .split(separator: "\n", omittingEmptySubsequences: false)
            .filter { !$0.trimmingCharacters(in: .whitespaces).hasPrefix("//") }
            .joined(separator: "\n")
    }

    private static let deviceLayout = "Meeshy/Core/DeviceLayout.swift"

    /// Every surface that reads a window metric. `DeviceLayout` itself is
    /// deliberately absent — it *is* the resolution, and it is the only file
    /// allowed to spell it out.
    ///
    /// `CallManager` is also absent, and stays absent: its screen-capture probe
    /// asks whether *any* connected scene is being recorded, which is a question
    /// about every scene rather than about the one the user is looking at.
    private static let convergedSurfaces: [String] = [
        "Meeshy/Features/Main/Views/StoryViewerView.swift",
        "Meeshy/Features/Main/Views/StoryViewerView+Content.swift",
        "Meeshy/Features/Main/Views/ConversationView.swift",
        "Meeshy/Features/Main/Views/ConversationListView.swift",
        "Meeshy/Features/Main/Views/ReelFeedCard.swift",
        "Meeshy/Features/Main/Views/AudioFullscreenView.swift",
        "Meeshy/Features/Main/Views/RootView.swift",
        "Meeshy/Features/Main/Views/VideoLegacySupport.swift",
        "Meeshy/Features/Main/Components/ComposerModels.swift",
        "Meeshy/Features/Main/Components/RecentMediaStrip.swift",
        "Meeshy/Features/Main/Components/IslandEmergingBanner.swift"
    ]

    // MARK: - One window, three questions

    /// The defect this closes is not "a wrong number" but "two numbers from two
    /// different windows": a view could size itself against the key window while
    /// insetting itself against whatever `connectedScenes.first` returned. All
    /// three accessors must describe the same window or none of them can be
    /// trusted together.
    func test_theThreeAccessors_describeTheSameWindow() {
        guard let window = DeviceLayout.activeWindow else {
            XCTAssertEqual(
                DeviceLayout.windowSize.width, UIScreen.main.bounds.width, accuracy: 0.001,
                "With no foreground window attached, the documented display fallback applies."
            )
            XCTAssertEqual(DeviceLayout.safeAreaInsets, .zero)
            XCTAssertNil(DeviceLayout.activeWindowScene)
            return
        }

        XCTAssertEqual(DeviceLayout.windowSize.width, window.bounds.width, accuracy: 0.001)
        XCTAssertEqual(DeviceLayout.windowSize.height, window.bounds.height, accuracy: 0.001)
        XCTAssertEqual(DeviceLayout.safeAreaInsets.top, window.safeAreaInsets.top, accuracy: 0.001)
        XCTAssertEqual(DeviceLayout.safeAreaInsets.bottom, window.safeAreaInsets.bottom, accuracy: 0.001)
        XCTAssertTrue(
            DeviceLayout.activeWindowScene === window.windowScene,
            "The scene accessor must be the scene of the very window the metrics came from."
        )
    }

    /// Insets are added to layout heights (`ConversationView.updateComposerHeight`)
    /// and compared against thresholds (`IslandEmergingBanner` trips at 59 pt): a
    /// negative or absent value must read as "no inset", never as a subtraction.
    func test_safeAreaInsets_areNeverNegative() {
        let insets = DeviceLayout.safeAreaInsets

        XCTAssertGreaterThanOrEqual(insets.top, 0)
        XCTAssertGreaterThanOrEqual(insets.bottom, 0)
        XCTAssertGreaterThanOrEqual(insets.left, 0)
        XCTAssertGreaterThanOrEqual(insets.right, 0)
    }

    /// Full screen, the window *is* the display — which is why this convergence
    /// moves nothing on iPhone. The whole behavioural delta lives in iPad
    /// multitasking, where the two stop being the same rectangle.
    func test_windowSize_inAFullScreenHost_stillMatchesTheDisplay() {
        XCTAssertEqual(
            DeviceLayout.windowSize.width, UIScreen.main.bounds.width, accuracy: 0.001,
            "Every migrated call site must keep its previous value on a full-screen iPhone."
        )
        XCTAssertEqual(
            DeviceLayout.windowSize.height, UIScreen.main.bounds.height, accuracy: 0.001
        )
    }

    // MARK: - Single-source-of-truth lock

    func test_deviceLayout_exposesTheThreeAccessors() throws {
        let code = codeLines(try source(Self.deviceLayout))

        XCTAssertTrue(code.contains("static var activeWindow: UIWindow?"))
        XCTAssertTrue(code.contains("static var windowSize: CGSize"))
        XCTAssertTrue(code.contains("static var safeAreaInsets: UIEdgeInsets"))
        XCTAssertTrue(code.contains("static var activeWindowScene: UIWindowScene?"))
    }

    /// One traversal, one set of fallback rules. Three copies of a rule are three
    /// chances to fix it in two places.
    func test_deviceLayout_traversesTheSceneGraphExactlyOnce() throws {
        let code = codeLines(try source(Self.deviceLayout))

        XCTAssertEqual(
            code.components(separatedBy: "connectedScenes").count - 1, 1,
            "DeviceLayout must resolve the window in a single place; the accessors read from it."
        )
        XCTAssertTrue(
            code.contains("activationState == .foregroundActive"),
            "The scene must be resolved by activation state: `connectedScenes` is an unordered " +
            "Set, so `.first` can return a background scene under multi-window."
        )
    }

    /// The nominal path runs inside the `body` of a message-list cell — the
    /// hottest list in the app — so the resolution must stay allocation-free.
    /// `compactMap { … }.first { … }` builds an intermediate array on every call.
    func test_deviceLayout_resolvesWithoutAllocating() throws {
        let code = codeLines(try source(Self.deviceLayout))

        XCTAssertFalse(
            code.contains("compactMap"),
            "The window resolution must stay a plain loop with early exit — no intermediate array."
        )
    }

    func test_noSurfaceResolvesTheSceneItself() throws {
        for path in Self.convergedSurfaces {
            let code = codeLines(try source(path))

            XCTAssertFalse(
                code.contains("connectedScenes"),
                "\(path) must reach the user's window through DeviceLayout: `connectedScenes` is " +
                "an unordered Set and every private copy drifts from the shared fallback rules."
            )
        }
    }

    func test_noSurfaceMeasuresThePhysicalDisplay() throws {
        for path in Self.convergedSurfaces {
            let code = codeLines(try source(path))

            XCTAssertFalse(
                code.contains("UIScreen.main"),
                "\(path) must size itself against the window the app owns, not the display it " +
                "may only partly occupy."
            )
        }
    }

    func test_everyConvergedSurface_readsTheSharedMeasurement() throws {
        for path in Self.convergedSurfaces {
            let code = codeLines(try source(path))

            XCTAssertTrue(
                code.contains("DeviceLayout."),
                "\(path) is listed as converged, so it must actually read the shared measurement."
            )
        }
    }
}
