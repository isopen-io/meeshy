public final class CancellableWaiters<Value: Sendable>: Sendable {
    private let table = Locked(ContinuationTable<Value>())

    public init() {}

    public var liveCount: Int {
        table.read { $0.liveCount }
    }

    public var isEmpty: Bool {
        liveCount == 0
    }

    public func enroll() -> WaiterTicket {
        table.mutate { $0.enroll() }
    }

    public func suspendCancellable(_ ticket: WaiterTicket, cancelledValue: Value) async -> Value {
        await withTaskCancellationHandler {
            await withCheckedContinuation { (continuation: CheckedContinuation<Value, Never>) in
                let immediate = table.mutate { $0.attach(ticket, continuation) }
                guard let immediate else { return }
                continuation.resume(returning: immediate)
            }
        } onCancel: {
            let waiter = table.mutate { $0.cancel(ticket, with: cancelledValue) }
            waiter?.resume(returning: cancelledValue)
        }
    }

    public func resolveAll(with value: Value) {
        let waiters = table.mutate { $0.resolveAll(with: value) }
        waiters.forEach { $0.resume(returning: value) }
    }

    @discardableResult
    public func resolveLatest(with value: Value) -> Bool {
        let outcome = table.mutate { $0.resolveLatest(with: value) }
        outcome.waiter?.resume(returning: value)
        return outcome.handed
    }
}
