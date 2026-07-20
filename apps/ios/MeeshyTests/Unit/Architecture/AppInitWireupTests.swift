import XCTest
import MeeshySDK
import MeeshyUI

/// P3 wire-up invariant tests.
///
/// `MeeshyMetricsSubscriber.shared.register()` must be wired into the launch
/// sequence alongside `CrashDiagnosticsManager.shared.install(...)`: it attaches
/// to `MXMetricManager` so the `MXSignpostMetric` entries produced by
/// `TimelineSignposter` are actually aggregated into the 24h rolling window.
/// Without this call the entries appear in Instruments but no payload is ever
/// delivered to `didReceive(_:)`.
///
/// `MeeshyMetricsSubscriber` guards its registration state with a private
/// `OSAllocatedUnfairLock<Bool>` — no public getter, and `MXMetricManager.shared`
/// doesn't expose its subscriber list. The pragmatic invariant — and the one
/// that catches the actual regression (a developer accidentally removing the
/// call) — is a source-scan of `AppDelegate.swift`, mirroring the approach taken
/// by `SingleSourceOfTruthTests` for the optimistic-mutation invariant.
@MainActor
final class AppInitWireupTests: XCTestCase {

    // MARK: - Source-scan invariants

    func test_app_init_calls_metricsSubscriber_register() throws {
        let body = try appDelegateLaunchBody()
        XCTAssertTrue(
            body.contains("MeeshyMetricsSubscriber.shared.register()"),
            "P3 wire-up regression: AppDelegate.application(_:didFinishLaunchingWithOptions:) "
                + "must call MeeshyMetricsSubscriber.shared.register() so MXSignpostMetric "
                + "entries produced by TimelineSignposter are aggregated. Without this call "
                + "no MetricKit payload ever arrives and the 24h rolling window stays empty."
        )
    }

    func test_wireup_lives_in_same_MainActor_hop_as_crashDiagnostics() throws {
        // The metrics register is @MainActor-isolated. It MUST share the
        // MainActor hop that already installs CrashDiagnosticsManager so we
        // don't multiply the number of trampolines into MainActor at cold
        // start. The order inside the hop is also load-bearing — crash
        // diagnostics first (so any crash during wire-up is captured), then
        // the metrics subscriber, then AnalyticsManager.
        let body = try appDelegateLaunchBody()
        guard let crashRange = body.range(of: "CrashDiagnosticsManager.shared.install"),
              let registerRange = body.range(of: "MeeshyMetricsSubscriber.shared.register"),
              let analyticsRange = body.range(of: "AnalyticsManager.shared.syncCollectionState")
        else {
            XCTFail("Could not locate the three MainActor-hop calls in AppDelegate.swift")
            return
        }
        XCTAssertLessThan(
            crashRange.lowerBound,
            registerRange.lowerBound,
            "CrashDiagnosticsManager.install must run BEFORE MeeshyMetricsSubscriber.register "
                + "so any crash during launch wire-up is captured by the observer."
        )
        XCTAssertLessThan(
            registerRange.lowerBound,
            analyticsRange.lowerBound,
            "MeeshyMetricsSubscriber.register stays clustered with the other launch "
                + "wire-ups, just before AnalyticsManager."
        )
    }

    // MARK: - Runtime smoke (symbol availability)

    /// Cheap proof that the symbol exists with the expected signature from the
    /// imported target. If a future refactor renames or removes it the
    /// source-scan tests above still pass, but this test fails at compile time —
    /// making the breakage impossible to miss.
    @MainActor
    func test_wireup_symbols_are_callable() {
        // Verified via launch instrumentation in production; this call site is a
        // compile-time guard, not a behaviour assertion. The call is idempotent
        // so invoking it in the test harness is a no-op after the first run.
        MeeshyMetricsSubscriber.shared.register()
    }

    // MARK: - Helpers

    /// Returns the body of `application(_:didFinishLaunchingWithOptions:)`
    /// from `AppDelegate.swift`. Mirrors the file-path resolution used by
    /// `SingleSourceOfTruthTests` so the test stays portable across the
    /// Xcode and SPM test runners.
    private func appDelegateLaunchBody() throws -> String {
        let filePath = #filePath
        let projectRoot = filePath
            .components(separatedBy: "/MeeshyTests/")
            .first ?? ""
        let appDelegatePath = "\(projectRoot)/Meeshy/AppDelegate.swift"
        let source = try String(contentsOfFile: appDelegatePath, encoding: .utf8)
        guard let methodStart = source.range(of: "func application(") else {
            XCTFail("AppDelegate.swift no longer contains a `func application(` declaration")
            return ""
        }
        // Strip `//` line comments before scanning. The launch sequence carries
        // an explanatory comment block that NAMES the very symbol we order-check
        // (`register()`); without stripping, the first `range(of:)` match lands
        // inside that comment — above the real call — and the ordering assertions
        // read a bogus position. We only need the executable lines, so drop
        // everything from `//` onward per line.
        let executable = String(source[methodStart.lowerBound...])
            .split(separator: "\n", omittingEmptySubsequences: false)
            .map { line -> Substring in
                if let commentStart = line.range(of: "//") {
                    return line[line.startIndex..<commentStart.lowerBound]
                }
                return line
            }
            .joined(separator: "\n")
        return executable
    }
}
