#if os(iOS) && DEBUG
import Foundation
import os
@testable import MeeshySDK

final class ManualDelayedScheduler: Sendable {

    struct Pending: Sendable {
        let delay: TimeInterval
        let work: @Sendable () -> Void
    }

    private let pending = OSAllocatedUnfairLock(initialState: [Pending]())

    var scheduler: DelayedScheduler {
        { [self] delay, _, work in
            pending.withLock { $0.append(Pending(delay: delay, work: work)) }
        }
    }

    var delays: [TimeInterval] { pending.withLock { $0.map(\.delay) } }

    func advance() {
        let due = pending.withLock { queue -> [Pending] in
            defer { queue.removeAll() }
            return queue
        }
        due.forEach { $0.work() }
    }
}
#endif
