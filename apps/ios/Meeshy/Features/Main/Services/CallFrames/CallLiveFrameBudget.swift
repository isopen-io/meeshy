import Foundation
import os

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
nonisolated final class CallLiveFrameBudgetMeter: @unchecked Sendable {
    private let lock = NSLock()
    private var samples: [Double] = []
    private var limitMs: Double
    private let logger = Logger(subsystem: "me.meeshy.app", category: "call-live-frame")

    init(limitMs: Double = CallLiveFrameBudget.limitMs(for: nil)) {
        self.limitMs = limitMs
    }

    func reset(limitMs: Double) {
        lock.lock()
        self.limitMs = limitMs
        samples.removeAll(keepingCapacity: true)
        lock.unlock()
    }

    func record(gpuMs: Double) {
        guard gpuMs.isFinite, gpuMs >= 0 else { return }
        lock.lock()
        samples.append(gpuMs)
        guard samples.count >= CallLiveFrameBudget.windowSize else {
            lock.unlock()
            return
        }
        let window = samples
        let limit = limitMs
        samples.removeAll(keepingCapacity: true)
        lock.unlock()
        guard let p95 = CallLiveFrameBudget.percentile95(window) else { return }
        if p95 > limit {
            logger.warning("call-live-frame: p95 GPU \(p95, format: .fixed(precision: 3), privacy: .public) ms > \(limit, format: .fixed(precision: 1), privacy: .public) ms")
        } else {
            logger.debug("call-live-frame: p95 GPU \(p95, format: .fixed(precision: 3), privacy: .public) ms")
        }
    }
}
