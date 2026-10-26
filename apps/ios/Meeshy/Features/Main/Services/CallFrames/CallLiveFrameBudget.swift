import Foundation
import os
import MeeshySDK

/// Le budget d'une image composée (doc frames 06 § 4, spec 02 § 3.1) : 0,5 ms pour un cadre
/// léger, 1 ms standard, 2,5 ms riche, mesurés en temps CARTE GRAPHIQUE sur iPhone 12.
nonisolated enum CallLiveFrameBudget {
    static let windowSize = 90

    static func limitMs(for cost: CallFrameCost?) -> Double {
        switch cost {
        case .none, .light: return 0.5
        case .standard: return 1
        case .rich: return 2.5
        }
    }

    /// Le 95e centile d'une fenêtre de mesures, `nil` si elle est vide.
    static func percentile95(_ samples: [Double]) -> Double? {
        guard !samples.isEmpty else { return nil }
        let sorted = samples.sorted()
        let rank = Int((Double(sorted.count) * 0.95).rounded(.up)) - 1
        return sorted[min(max(rank, 0), sorted.count - 1)]
    }
}

/// Recueille le temps carte graphique de chaque image (rappel de fin du tampon de commandes,
/// hors du fil principal) et journalise le p95 toutes les `windowSize` images.
nonisolated final class CallLiveFrameBudgetMeter: Sendable {
    private nonisolated struct Window: Sendable {
        var samples: [Double] = []
        var limitMs: Double
    }

    private let window: Locked<Window>
    private let logger = MeeshyLog.logger(.callLiveFrame)

    init(limitMs: Double = CallLiveFrameBudget.limitMs(for: nil)) {
        window = Locked(Window(limitMs: limitMs))
    }

    func reset(limitMs: Double) {
        window.mutate { state in
            state.limitMs = limitMs
            state.samples.removeAll(keepingCapacity: true)
        }
    }

    func record(gpuMs: Double) {
        guard gpuMs.isFinite, gpuMs >= 0 else { return }
        let full = window.mutate { state -> (samples: [Double], limit: Double)? in
            state.samples.append(gpuMs)
            guard state.samples.count >= CallLiveFrameBudget.windowSize else { return nil }
            defer { state.samples.removeAll(keepingCapacity: true) }
            return (state.samples, state.limitMs)
        }
        guard let full, let p95 = CallLiveFrameBudget.percentile95(full.samples) else { return }
        let limit = full.limit
        if p95 > limit {
            logger.warning("call-live-frame: p95 GPU \(p95, format: .fixed(precision: 3), privacy: .public) ms > \(limit, format: .fixed(precision: 1), privacy: .public) ms")
        } else {
            logger.debug("call-live-frame: p95 GPU \(p95, format: .fixed(precision: 3), privacy: .public) ms")
        }
    }
}
