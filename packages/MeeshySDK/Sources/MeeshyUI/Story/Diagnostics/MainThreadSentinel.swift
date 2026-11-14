import Foundation

/// **La sentinelle du fil principal** (#18510) : un battement toutes les 50 ms
/// sur la file principale ; un battement en retard d'au moins 100 ms dit un
/// blocage, rendu à `onHang` avec sa durée. Rien n'est alloué par battement, et
/// aucune pile n'est capturée.
public final class MainThreadSentinel {
    private let onHang: @MainActor (TimeInterval) -> Void
    private var timer: DispatchSourceTimer?
    private var lastBeat: TimeInterval?

    nonisolated deinit {}

    public init(onHang: @escaping @MainActor (TimeInterval) -> Void) {
        self.onHang = onHang
    }

    public var isRunning: Bool { timer != nil }

    public func start() {
        guard timer == nil else { return }
        let source = DispatchSource.makeTimerSource(queue: .main)
        let interval = Int(StoryNavigationBudget.heartbeat * 1_000)
        source.schedule(deadline: .now() + .milliseconds(interval), repeating: .milliseconds(interval), leeway: .milliseconds(5))
        source.setEventHandler { [weak self] in
            MainActor.assumeIsolated { self?.beat(at: ProcessInfo.processInfo.systemUptime) }
        }
        lastBeat = ProcessInfo.processInfo.systemUptime
        timer = source
        source.resume()
    }

    public func stop() {
        timer?.cancel()
        timer = nil
        lastBeat = nil
    }

    func beat(at now: TimeInterval) {
        if let gap = StoryNavigationBudget.hang(previousBeat: lastBeat, beat: now) { onHang(gap) }
        lastBeat = now
    }
}
