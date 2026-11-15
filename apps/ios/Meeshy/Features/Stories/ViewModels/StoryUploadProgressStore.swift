import Foundation
import Combine

nonisolated struct StoryUploadProgressSample: Equatable {
    let fraction: Double
    let at: ContinuousClock.Instant
}

nonisolated enum StoryUploadProgressCoalescing {
    static let minimumInterval: Duration = .milliseconds(100)
    static let minimumDelta = 0.01

    static func shouldPublish(
        _ next: Double,
        at now: ContinuousClock.Instant,
        after last: StoryUploadProgressSample?
    ) -> Bool {
        guard let last else { return true }
        if next == last.fraction { return false }
        if next >= 1 { return true }
        if abs(next - last.fraction) >= minimumDelta { return true }
        return now - last.at >= minimumInterval
    }
}

@MainActor
final class StoryUploadProgressStore: ObservableObject {
    nonisolated deinit {}

    @Published private(set) var fractions: [String: Double] = [:]
    private var lastPublished: [String: StoryUploadProgressSample] = [:]

    func fraction(for id: String) -> Double {
        fractions[id] ?? 0
    }

    func report(_ fraction: Double, for id: String, at now: ContinuousClock.Instant = .now) {
        guard StoryUploadProgressCoalescing.shouldPublish(fraction, at: now, after: lastPublished[id]) else { return }
        lastPublished[id] = StoryUploadProgressSample(fraction: fraction, at: now)
        fractions[id] = fraction
    }

    func forget(id: String) {
        lastPublished[id] = nil
        guard fractions[id] != nil else { return }
        fractions[id] = nil
    }

    func retainOnly(_ ids: Set<String>) {
        let stale = Set(fractions.keys).union(lastPublished.keys).subtracting(ids)
        guard !stale.isEmpty else { return }
        stale.forEach { lastPublished[$0] = nil }
        guard !stale.isDisjoint(with: fractions.keys) else { return }
        fractions = fractions.filter { ids.contains($0.key) }
    }
}
