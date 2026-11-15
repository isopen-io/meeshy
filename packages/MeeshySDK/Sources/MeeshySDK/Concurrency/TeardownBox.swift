import Foundation
import os

public final class TeardownBox<Resources>: Sendable {
    private struct Slot {
        var resources: Resources
        var released = false
    }

    private let storage: OSAllocatedUnfairLock<Slot>

    public init(_ resources: Resources) {
        storage = OSAllocatedUnfairLock(uncheckedState: Slot(resources: resources))
    }

    public func update(_ body: (inout Resources) -> Void) {
        storage.withLockUnchecked { slot in
            guard !slot.released else { return }
            body(&slot.resources)
        }
    }

    public func read<V: Sendable>(_ body: (Resources) -> V) -> V {
        storage.withLockUnchecked { slot in body(slot.resources) }
    }

    public func releaseNow(_ body: (Resources) -> Void) {
        guard let resources = take() else { return }
        body(resources)
    }

    public func release(on queue: DispatchQueue, _ body: @escaping @Sendable (Resources) -> Void) {
        queue.async { [self] in
            releaseNow(body)
        }
    }

    private func take() -> Resources? {
        storage.withLockUnchecked { (slot: inout Slot) -> Resources? in
            guard !slot.released else { return nil }
            slot.released = true
            return slot.resources
        }
    }
}
