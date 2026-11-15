public actor LatestFirstGate {
    private let limit: Int
    private var inUse = 0
    private let waiters = CancellableWaiters<Bool>()

    public init(limit: Int) {
        self.limit = limit
    }

    public func enter() async -> Bool {
        if inUse < limit {
            inUse += 1
            return true
        }
        let ticket = waiters.enroll()
        return await waiters.suspendCancellable(ticket, cancelledValue: false)
    }

    public func leave() {
        guard !waiters.resolveLatest(with: true) else { return }
        inUse = max(0, inUse - 1)
    }
}
