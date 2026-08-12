import XCTest
@testable import Meeshy

/// Audit backlog 2026-07-20, lane "Perf divers" (P2) — `iPadRootView` carried
/// `@ObservedObject var networkMonitor = NetworkMonitor.shared` without ever
/// reading `networkMonitor` anywhere in the view or its `+Sheets`/`+Panels`/
/// `+Overlays`/`+Navigation` extensions. `@ObservedObject` re-evaluates the
/// whole `body` on every publish from the observed object — here, the entire
/// iPad two-column root re-rendered on every network flap for zero visual
/// payoff. This is a source-guard: the property (and its underlying churn)
/// simply must not exist.
@MainActor
final class iPadRootViewPerfRerenderTests: XCTestCase {

    private func source(of relativePath: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Views/
            .deletingLastPathComponent()   // Unit/
            .deletingLastPathComponent()   // MeeshyTests/
            .deletingLastPathComponent()   // ios/
            .appendingPathComponent("Meeshy/Features/Main/\(relativePath)")
        return try String(contentsOf: url, encoding: .utf8)
    }

    func test_iPadRootView_doesNotObserveNetworkMonitor() throws {
        let source = try source(of: "Views/iPadRootView.swift")
        XCTAssertFalse(
            source.contains("NetworkMonitor"),
            "iPadRootView must not reference NetworkMonitor at all — the " +
            "@ObservedObject was declared but never read, forcing the whole " +
            "iPad two-column root to re-render on every network flap for no " +
            "visual payoff. If a genuine need to read network state appears, " +
            "thread it through a leaf-scoped `let`/computed value instead of " +
            "an @ObservedObject on the root."
        )
    }

    /// Companion guard: the extensions that share `iPadRootView`'s stored
    /// properties must not reintroduce the observation either.
    func test_iPadRootViewExtensions_doNotObserveNetworkMonitor() throws {
        for file in ["Views/iPadRootView+Sheets.swift", "Views/iPadRootView+Panels.swift",
                     "Views/iPadRootView+Overlays.swift", "Views/iPadRootView+Navigation.swift"] {
            let source = try source(of: file)
            XCTAssertFalse(
                source.contains("networkMonitor"),
                "\(file) must not read a `networkMonitor` property off iPadRootView " +
                "— it was removed as an unread @ObservedObject causing whole-root " +
                "re-renders on every network flap."
            )
        }
    }
}
