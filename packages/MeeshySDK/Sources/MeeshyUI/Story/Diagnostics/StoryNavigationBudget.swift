import Foundation

/// Les trois temps d'un balayage de story (#18510).
public nonisolated enum StoryNavigationInterval: String, CaseIterable, Sendable {
    case gestureToSwap = "geste→échange"
    case swapToFirstFrame = "échange→première image"
    case swapToPlayback = "échange→lecture"
}

/// **Le budget d'un balayage** (#18507, #18510) : l'échange suit le geste dans
/// la même image, la première image arrive dans l'image suivante, la lecture
/// démarre en 100 ms ; un battement du fil principal en retard de 100 ms est un
/// blocage, au-delà de 250 ms un blocage hors budget.
public nonisolated enum StoryNavigationBudget {
    public enum Verdict: Equatable, Sendable {
        case withinBudget
        case overBudget
    }

    public static let heartbeat: TimeInterval = 0.05
    public static let hangThreshold: TimeInterval = 0.1
    public static let blockingBudget: TimeInterval = 0.25

    public static func budget(for interval: StoryNavigationInterval) -> TimeInterval {
        switch interval {
        case .gestureToSwap: return 0.05
        case .swapToFirstFrame: return 1.0 / 60
        case .swapToPlayback: return 0.1
        }
    }

    public static func verdict(_ duration: TimeInterval, for interval: StoryNavigationInterval) -> Verdict {
        duration <= budget(for: interval) ? .withinBudget : .overBudget
    }

    /// L'écart entre deux battements, quand il dit un blocage ; `nil` sinon.
    public static func hang(previousBeat: TimeInterval?, beat: TimeInterval) -> TimeInterval? {
        guard let previousBeat else { return nil }
        let gap = beat - previousBeat
        return gap >= hangThreshold ? gap : nil
    }
}

/// Les durées relevées d'un intervalle, et leurs percentiles au rang le plus proche.
public nonisolated struct LatencyDistribution: Equatable, Sendable {
    public private(set) var samples: [TimeInterval] = []

    public init() {}

    public var count: Int { samples.count }
    public var p50: TimeInterval? { percentile(0.5) }
    public var p95: TimeInterval? { percentile(0.95) }

    public mutating func record(_ duration: TimeInterval) {
        samples.append(duration)
    }

    public func percentile(_ fraction: Double) -> TimeInterval? {
        guard !samples.isEmpty else { return nil }
        let sorted = samples.sorted()
        let rank = Int((fraction * Double(sorted.count)).rounded(.up))
        return sorted[min(max(rank, 1), sorted.count) - 1]
    }

    public func overBudgetCount(_ budget: TimeInterval) -> Int {
        samples.filter { $0 > budget }.count
    }
}
