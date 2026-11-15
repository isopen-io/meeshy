@MainActor
public final class DelayedActions {
    private let pending = Locked<[Int: Task<Void, Never>]>([:])
    private let sleep: @Sendable @concurrent (Duration) async -> Bool
    private var nextKey = 0

    public init(sleep: @escaping @Sendable @concurrent (Duration) async -> Bool = { await cancellableSleep(for: $0) }) {
        self.sleep = sleep
    }

    nonisolated deinit {
        pending.read { $0.values.forEach { $0.cancel() } }
    }

    public var hasPending: Bool {
        pending.read { !$0.isEmpty }
    }

    public func run(after delay: Duration, _ perform: @escaping @MainActor () -> Void) {
        nextKey += 1
        let key = nextKey
        let sleeper = sleep
        let task = Task { [weak self] in
            guard await sleeper(delay), !Task.isCancelled, let self else { return }
            self.forget(key)
            perform()
        }
        pending.mutate { $0[key] = task }
    }

    public func cancelAll() {
        let tasks = pending.mutate { state -> [Task<Void, Never>] in
            defer { state = [:] }
            return Array(state.values)
        }
        tasks.forEach { $0.cancel() }
    }

    private func forget(_ key: Int) {
        pending.mutate { $0[key] = nil }
    }
}
