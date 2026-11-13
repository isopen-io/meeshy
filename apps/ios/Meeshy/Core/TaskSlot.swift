import Foundation
import MeeshySDK

nonisolated final class TaskSlot: Sendable {
    private let slot = Locked<Task<Void, Never>?>(nil)

    init() {}

    deinit {
        cancel()
    }

    var isEmpty: Bool {
        slot.read { $0 == nil }
    }

    func replace(with task: Task<Void, Never>) {
        let previous = slot.mutate { state -> Task<Void, Never>? in
            let old = state
            state = task
            return old
        }
        previous?.cancel()
    }

    func forget() {
        slot.mutate { $0 = nil }
    }

    func cancel() {
        let held = slot.mutate { state -> Task<Void, Never>? in
            let old = state
            state = nil
            return old
        }
        held?.cancel()
    }
}
