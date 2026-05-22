import Foundation

/// A6 — Cooperative timeout helper for async work.
///
/// Some UI flows (like the heart-in-flight set on FeedView) protect the
/// user from double-tapping by inserting an ID before kicking an async
/// network call, then removing it on completion. If the underlying network
/// call hangs indefinitely (server stalls without responding, no URLSession
/// timeout configured), the Task never completes, the `defer` never fires,
/// and the ID stays in the set forever — locking the heart button until
/// the user kills the app.
///
/// `withTaskTimeout` wraps an async operation with an upper-bound. When
/// the deadline elapses first, it throws `TaskTimeoutError`, which the
/// caller can map to its standard error path (rollback + cleanup).
///
/// Implementation: a `withThrowingTaskGroup` race between the user work
/// and a `Task.sleep`. The losing branch is cancelled (Swift concurrency
/// cancels children when the group returns).
public struct TaskTimeoutError: Error, Equatable {
    public let seconds: TimeInterval
    public init(seconds: TimeInterval) {
        self.seconds = seconds
    }
}

@inlinable
public func withTaskTimeout<T: Sendable>(
    seconds: TimeInterval,
    operation: @Sendable @escaping () async throws -> T
) async throws -> T {
    try await withThrowingTaskGroup(of: T.self) { group in
        group.addTask {
            try await operation()
        }
        group.addTask {
            try await Task.sleep(nanoseconds: UInt64(seconds * 1_000_000_000))
            throw TaskTimeoutError(seconds: seconds)
        }
        guard let result = try await group.next() else {
            throw TaskTimeoutError(seconds: seconds)
        }
        group.cancelAll()
        return result
    }
}
