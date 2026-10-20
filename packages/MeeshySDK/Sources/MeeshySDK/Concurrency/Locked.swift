import os

public struct Locked<State>: Sendable {
    private let lock: OSAllocatedUnfairLock<State>

    public init(_ initial: State) where State: Sendable {
        lock = OSAllocatedUnfairLock(initialState: initial)
    }

    public init(uncheckedState initial: State) {
        lock = OSAllocatedUnfairLock(uncheckedState: initial)
    }

    public func read<V: Sendable>(_ body: @Sendable (State) throws -> V) rethrows -> V {
        try lock.withLockUnchecked { state in try body(state) }
    }

    @discardableResult
    public func mutate<V: Sendable>(_ body: @Sendable (inout State) throws -> V) rethrows -> V {
        try lock.withLockUnchecked { state in try body(&state) }
    }

    @discardableResult
    public func mutateUnchecked<V>(_ body: (inout State) throws -> V) rethrows -> V {
        try lock.withLockUnchecked { state in try body(&state) }
    }
}
