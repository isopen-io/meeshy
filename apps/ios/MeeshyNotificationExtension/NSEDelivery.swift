import Foundation
import os

final class NSEDelivery<Content>: Sendable {
    private let pendingHandler: OSAllocatedUnfairLock<((Content) -> Void)?>

    init(handler: @escaping (Content) -> Void) {
        pendingHandler = OSAllocatedUnfairLock(uncheckedState: handler)
    }

    @discardableResult
    func deliver(_ content: Content) -> Bool {
        let handler = pendingHandler.withLockUnchecked { state -> ((Content) -> Void)? in
            defer { state = nil }
            return state
        }
        guard let handler else { return false }
        handler(content)
        return true
    }

    var hasDelivered: Bool {
        pendingHandler.withLockUnchecked { $0 == nil }
    }
}
