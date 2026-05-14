import Foundation
import os
import os.signpost

/// SOTA wrapper around `OSSignposter` (iOS 16+) for hot-path instrumentation of
/// `StoryTimelineEngine`. All intervals appear in Instruments under the
/// `TimelineEngine` category, and are aggregated in production via
/// `MXSignpostMetric` MetricKit reports (24h rolling window, zero CPU overhead
/// when no profiler is attached).
///
/// ## Aggregation wire-up
///
/// MetricKit only delivers `MXSignpostMetric` payloads to a registered
/// `MXMetricManagerSubscriber`. The aggregation is provided by
/// `MeeshyMetricsSubscriber` in the `MeeshySDK` target, which MUST be
/// registered at app launch:
///
/// ```swift
/// // apps/ios/Meeshy/MeeshyApp.swift — alongside CrashDiagnosticsManager.install()
/// MeeshyMetricsSubscriber.shared.register()
/// ```
///
/// Without that registration the signposts still surface in Instruments but
/// no production payload ever arrives — see `MeeshyMetricsSubscriber` for
/// details.
public struct TimelineSignposter {
    private nonisolated static let log = OSLog(subsystem: "me.meeshy.app", category: "TimelineEngine")
    private nonisolated static let signposter = OSSignposter(logHandle: log)

    /// Wraps a synchronous block in a signpost interval. Re-throws any error.
    @discardableResult
    public nonisolated static func interval<T>(_ name: StaticString, _ work: () throws -> T) rethrows -> T {
        let state = signposter.beginInterval(name)
        defer { signposter.endInterval(name, state) }
        return try work()
    }

    /// Wraps an async block in a signpost interval. Re-throws any error.
    @discardableResult
    public nonisolated static func intervalAsync<T>(_ name: StaticString, _ work: () async throws -> T) async rethrows -> T {
        let state = signposter.beginInterval(name)
        defer { signposter.endInterval(name, state) }
        return try await work()
    }
}
