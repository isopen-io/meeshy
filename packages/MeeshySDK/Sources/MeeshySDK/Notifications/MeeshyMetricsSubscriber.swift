import Foundation
import MetricKit
import os

/// Subscribes to `MXMetricManager` and aggregates the `MXSignpostMetric` entries
/// produced by `TimelineSignposter` (and any future hot-path signposters that
/// adopt the same `me.meeshy.app/TimelineEngine`-style category convention).
///
/// MetricKit does NOT aggregate signposts unless an `MXMetricManagerSubscriber`
/// is registered. Without this subscriber the docstring promise of "automatic
/// 24h rolling-window aggregation" in `TimelineSignposter` is vacuous — the
/// signposts still appear in Instruments, but no daily payload ever arrives.
///
/// ## Wire-up
///
/// Call exactly once at app launch (idempotent). The recommended seam is the
/// iOS app entry point, alongside `CrashDiagnosticsManager.install()`:
///
/// ```swift
/// // apps/ios/Meeshy/MeeshyApp.swift
/// init() {
///     CrashDiagnosticsManager.shared.install()
///     MeeshyMetricsSubscriber.shared.register()
/// }
/// ```
///
/// The subscriber retains nothing user-specific and is safe to register before
/// authentication completes. Payloads land on the MetricKit background queue
/// once every ~24h (or on next launch after a metric window closes), so the
/// in-memory `aggregates` snapshot is sparse and bounded.
///
/// ## Categories
///
/// Only signposts whose `signpostCategory` matches one of `trackedCategories`
/// are aggregated. The default allowlist is `["TimelineEngine"]` — the single
/// category currently used by `TimelineSignposter`. Add more categories as new
/// hot-path subsystems adopt `OSSignposter`.
///
/// ## Testability
///
/// `MXMetricPayload` cannot be instantiated outside MetricKit, so the
/// `didReceive(_:)` callback is a thin adapter that delegates to the
/// `consume(signpostMetrics:)` testable seam. Tests exercise the seam directly
/// with `SignpostMetricInput` value types — no payload mocking required.
public final class MeeshyMetricsSubscriber: NSObject, @unchecked Sendable {

    /// Process-wide singleton. Wire up exactly once via `register()` at launch.
    public static let shared = MeeshyMetricsSubscriber()

    /// Plain-data projection of the fields we read from `MXSignpostMetric`.
    /// Used as the input to the testable `consume(signpostMetrics:)` seam so
    /// that unit tests don't need to instantiate `MXMetricPayload`.
    public struct SignpostMetricInput: Sendable, Equatable {
        public let category: String
        public let name: String
        public let totalCount: UInt
        public let cumulativeCPUTimeSeconds: Double?

        public init(
            category: String,
            name: String,
            totalCount: UInt,
            cumulativeCPUTimeSeconds: Double?
        ) {
            self.category = category
            self.name = name
            self.totalCount = totalCount
            self.cumulativeCPUTimeSeconds = cumulativeCPUTimeSeconds
        }
    }

    /// Aggregate exposed to future analytics surfaces. A single MetricKit
    /// payload may contain many signpost intervals for the same name; this
    /// type stores the post-filter snapshot keyed by `(category, name)`.
    public struct Aggregate: Sendable, Equatable {
        public let category: String
        public let name: String
        public let totalCount: UInt
        public let cumulativeCPUTimeSeconds: Double?
        public let receivedAt: Date

        public init(
            category: String,
            name: String,
            totalCount: UInt,
            cumulativeCPUTimeSeconds: Double?,
            receivedAt: Date
        ) {
            self.category = category
            self.name = name
            self.totalCount = totalCount
            self.cumulativeCPUTimeSeconds = cumulativeCPUTimeSeconds
            self.receivedAt = receivedAt
        }
    }

    /// Categories that are forwarded into `aggregates`. Anything outside the
    /// allowlist is dropped — keeps noise from system signposts (`http`,
    /// `dynamic_tracing`, etc.) out of our analytics surface.
    public var trackedCategories: Set<String>

    private let logger = Logger(subsystem: "me.meeshy.app", category: "metrics-subscriber")

    /// Lock-protected aggregate store. Reads from app code, writes from the
    /// MetricKit background queue. Using `OSAllocatedUnfairLock` keeps the
    /// happy path single-instruction on iOS 16+.
    private let aggregatesLock = OSAllocatedUnfairLock<[Aggregate]>(initialState: [])

    /// Inspection point for analytics / debug surfaces. Returns a snapshot
    /// copy so callers don't have to worry about concurrent mutation.
    public var aggregates: [Aggregate] {
        aggregatesLock.withLock { $0 }
    }

    /// Clock injection seam. Tests pin this to a fixed instant; production
    /// uses the real `Date.init` so each aggregate carries a wall-clock
    /// timestamp matching the payload delivery time.
    private let clock: @Sendable () -> Date

    /// Whether `register(with:)` has wired up an `MXMetricManager`. Guarded
    /// by the same lock so concurrent registration calls are idempotent.
    private let registrationLock = OSAllocatedUnfairLock<Bool>(initialState: false)

    public init(
        trackedCategories: Set<String> = ["TimelineEngine"],
        clock: @escaping @Sendable () -> Date = { Date() }
    ) {
        self.trackedCategories = trackedCategories
        self.clock = clock
        super.init()
    }

    // MARK: - Public API

    /// Wires this subscriber into `MXMetricManager.shared` (or an injected
    /// manager for tests). Idempotent — repeated calls are no-ops.
    ///
    /// MUST run on the main thread because `MXMetricManager.shared` is
    /// `@MainActor` on iOS 16+. The recommended seam is the app entry point
    /// alongside `CrashDiagnosticsManager.install()`.
    @MainActor
    public func register(with manager: MXMetricManager = MXMetricManager.shared) {
        let alreadyRegistered = registrationLock.withLock { current -> Bool in
            if current { return true }
            current = true
            return false
        }
        guard !alreadyRegistered else { return }
        manager.add(self)
        logger.info("MeeshyMetricsSubscriber registered (categories: \(self.trackedCategories.sorted().joined(separator: ","), privacy: .public))")
    }

    /// Detaches from the metric manager. Primarily for tests; production
    /// keeps the subscription alive for the whole app lifetime.
    @MainActor
    public func unregister(from manager: MXMetricManager = MXMetricManager.shared) {
        let wasRegistered = registrationLock.withLock { current -> Bool in
            guard current else { return false }
            current = false
            return true
        }
        guard wasRegistered else { return }
        manager.remove(self)
    }

    /// Testable seam. Filters the input by `trackedCategories` and stores
    /// the surviving entries as `Aggregate`s. Returns the count of stored
    /// entries so callers (and tests) can assert the filter behaviour
    /// without inspecting `aggregates` directly.
    @discardableResult
    public func consume(signpostMetrics: [SignpostMetricInput]) -> Int {
        let now = clock()
        let kept = signpostMetrics.filter { trackedCategories.contains($0.category) }
        guard !kept.isEmpty else { return 0 }

        let newAggregates = kept.map { input in
            Aggregate(
                category: input.category,
                name: input.name,
                totalCount: input.totalCount,
                cumulativeCPUTimeSeconds: input.cumulativeCPUTimeSeconds,
                receivedAt: now
            )
        }

        aggregatesLock.withLock { store in
            store.append(contentsOf: newAggregates)
        }

        logger.info("Stored \(newAggregates.count, privacy: .public) signpost aggregate(s)")
        return newAggregates.count
    }

    /// Test helper. Empties the in-memory aggregate buffer.
    public func resetAggregates() {
        aggregatesLock.withLock { store in
            store.removeAll()
        }
    }
}

// MARK: - MXMetricManagerSubscriber

extension MeeshyMetricsSubscriber: MXMetricManagerSubscriber {
    /// Called by MetricKit on a background queue once per ~24h window.
    /// Extracts the signpost section, converts each entry into a plain
    /// `SignpostMetricInput`, and delegates to the testable seam.
    ///
    /// Note: `signpostMetrics` is optional — payloads with only CPU, memory
    /// or animation data carry `nil` here, which is the normal empty case.
    public func didReceive(_ payloads: [MXMetricPayload]) {
        var inputs: [SignpostMetricInput] = []
        for payload in payloads {
            guard let metrics = payload.signpostMetrics, !metrics.isEmpty else { continue }
            for metric in metrics {
                let cpuSeconds = metric.signpostIntervalData?
                    .cumulativeCPUTime?
                    .converted(to: .seconds)
                    .value
                inputs.append(
                    SignpostMetricInput(
                        category: metric.signpostCategory,
                        name: metric.signpostName,
                        totalCount: UInt(metric.totalCount),
                        cumulativeCPUTimeSeconds: cpuSeconds
                    )
                )
            }
        }
        consume(signpostMetrics: inputs)
    }
}
