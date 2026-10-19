import Foundation
import os

struct NSEBudget: Sendable, Equatable {
    static let total: TimeInterval = 27
    static let minimumDownload: TimeInterval = 2
    static let maximumDownloadTimeout: TimeInterval = 12

    let start: Date

    func remaining(at now: Date = Date()) -> TimeInterval {
        Self.total - now.timeIntervalSince(start)
    }

    func downloadTimeout(at now: Date = Date()) -> TimeInterval? {
        let remaining = remaining(at: now)
        guard remaining > Self.minimumDownload else { return nil }
        return min(Self.maximumDownloadTimeout, remaining)
    }
}

enum NSEDeadline {

    static func race<T: Sendable>(
        timeout: TimeInterval,
        operation: @escaping @Sendable () async -> T
    ) async -> T? {
        guard timeout > 0, !Task.isCancelled else { return nil }
        let race = Race<T>()
        return await withTaskCancellationHandler {
            await withCheckedContinuation { (continuation: CheckedContinuation<T?, Never>) in
                race.start(timeout: timeout, operation: operation, continuation: continuation)
            }
        } onCancel: {
            race.finish(nil)
        }
    }
}

private final class Race<T: Sendable>: Sendable {
    private struct State: Sendable {
        var continuation: CheckedContinuation<T?, Never>?
        var tasks: [Task<Void, Never>] = []
        var isFinished = false
    }

    private let state = OSAllocatedUnfairLock(initialState: State())

    func start(
        timeout: TimeInterval,
        operation: @escaping @Sendable () async -> T,
        continuation: CheckedContinuation<T?, Never>
    ) {
        let alreadyFinished = state.withLock { state -> Bool in
            guard !state.isFinished else { return true }
            state.continuation = continuation
            return false
        }
        guard !alreadyFinished else {
            continuation.resume(returning: nil)
            return
        }
        let work = Task { [self] in finish(await operation()) }
        let timer = Task { [self] in
            do {
                try await Task.sleep(for: .seconds(timeout))
            } catch {
                return
            }
            finish(nil)
        }
        let finishedMeanwhile = state.withLock { state -> Bool in
            state.tasks = [work, timer]
            return state.isFinished
        }
        if finishedMeanwhile {
            work.cancel()
            timer.cancel()
        }
    }

    func finish(_ value: T?) {
        let outcome = state.withLock { state -> (CheckedContinuation<T?, Never>?, [Task<Void, Never>])? in
            guard !state.isFinished else { return nil }
            state.isFinished = true
            defer { state.continuation = nil }
            return (state.continuation, state.tasks)
        }
        guard let (continuation, tasks) = outcome else { return }
        tasks.forEach { $0.cancel() }
        continuation?.resume(returning: value)
    }
}
