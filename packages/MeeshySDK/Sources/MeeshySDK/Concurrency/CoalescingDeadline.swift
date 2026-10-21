@MainActor
public final class CoalescingDeadline {
    public static let shared = CoalescingDeadline()

    private struct Pending {
        let generation: Int
        let task: Task<Void, Never>
    }

    private let sleep: @Sendable (Duration) async -> Bool
    private var pending: [ObjectIdentifier: Pending] = [:]
    private var nextGeneration = 0

    public init(sleep: @escaping @Sendable (Duration) async -> Bool = cancellableSleep(for:)) {
        self.sleep = sleep
    }

    nonisolated deinit {}

    public func schedule(
        for owner: AnyObject,
        after delay: Duration,
        perform: @escaping @MainActor () -> Void
    ) {
        let key = ObjectIdentifier(owner)
        pending[key]?.task.cancel()
        nextGeneration += 1
        let generation = nextGeneration
        let sleeper = sleep
        let task = Task { [weak self] in
            guard await sleeper(delay), !Task.isCancelled else { return }
            guard let self, self.pending[key]?.generation == generation else { return }
            self.pending[key] = nil
            perform()
        }
        pending[key] = Pending(generation: generation, task: task)
    }

    public func cancel(for owner: AnyObject) {
        let key = ObjectIdentifier(owner)
        pending[key]?.task.cancel()
        pending[key] = nil
    }
}
