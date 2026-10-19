import Combine
import os

public final class OrderedEventLane: Sendable {
    public typealias Job = @Sendable @concurrent () async -> Void

    private enum Entry: Sendable {
        case job(Job)
        case barrier(CheckedContinuation<Void, Never>)
    }

    private let entries: AsyncStream<Entry>.Continuation
    private let closed: OSAllocatedUnfairLock<Bool>

    public init() {
        let (stream, continuation) = AsyncStream<Entry>.makeStream(bufferingPolicy: .unbounded)
        let closed = OSAllocatedUnfairLock(initialState: false)
        self.entries = continuation
        self.closed = closed
        Task {
            for await entry in stream {
                switch entry {
                case .job(let job):
                    guard !closed.withLock({ $0 }) else { continue }
                    await job()
                case .barrier(let waiter):
                    waiter.resume()
                }
            }
        }
    }

    deinit {
        close()
    }

    public func submit(_ job: @escaping Job) {
        guard !closed.withLock({ $0 }) else { return }
        entries.yield(.job(job))
    }

    public func barrier() async {
        await withCheckedContinuation { waiter in
            if case .terminated = entries.yield(.barrier(waiter)) {
                waiter.resume()
            }
        }
    }

    public func close() {
        closed.withLock { $0 = true }
        entries.finish()
    }

    public func store(in subscriptions: inout Set<AnyCancellable>) {
        AnyCancellable { [self] in close() }.store(in: &subscriptions)
    }
}

extension Publisher where Failure == Never, Output: Sendable {
    public func relay(
        through lane: OrderedEventLane,
        _ apply: @escaping @Sendable @concurrent (Output) async -> Void
    ) -> AnyCancellable {
        sink { event in
            lane.submit { await apply(event) }
        }
    }
}
