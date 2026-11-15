import Foundation

public struct LockedCache<Key: AnyObject, Value: AnyObject>: Sendable {
    // unchecked: NSCache est documenté thread-safe
    private let storage: Locked<NSCache<Key, Value>>

    public init(_ cache: NSCache<Key, Value>) {
        storage = Locked(uncheckedState: cache)
    }

    public func object(forKey key: Key) -> Value? {
        storage.mutateUnchecked { $0.object(forKey: key) }
    }

    public func setObject(_ object: Value, forKey key: Key) {
        storage.mutateUnchecked { $0.setObject(object, forKey: key) }
    }

    public func setObject(_ object: Value, forKey key: Key, cost: Int) {
        storage.mutateUnchecked { $0.setObject(object, forKey: key, cost: cost) }
    }

    public func removeObject(forKey key: Key) {
        storage.mutateUnchecked { $0.removeObject(forKey: key) }
    }

    public func removeAllObjects() {
        storage.mutateUnchecked { $0.removeAllObjects() }
    }

    public var totalCostLimit: Int {
        get { storage.mutateUnchecked { $0.totalCostLimit } }
        nonmutating set { storage.mutateUnchecked { $0.totalCostLimit = newValue } }
    }
}
