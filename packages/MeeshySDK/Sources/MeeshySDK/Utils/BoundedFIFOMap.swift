import Foundation

/// Dictionnaire borné à éviction FIFO (ordre d'insertion). Extrait l'idiome
/// « dict + tableau d'ordre + cap » dupliqué dans le SDK (StoryService,
/// OfflineQueue tombstones — et candidat pour les caches de traduction de
/// CacheCoordinator dont l'éviction a des effets de bord supplémentaires).
///
/// Invariants garantis en un seul endroit :
/// - `storage` et `insertionOrder` restent synchrones (update d'une clé
///   existante ne ré-append PAS son ordre) ;
/// - l'éviction retire toujours la clé la plus ancienne ;
/// - `removeValue` purge aussi l'entrée d'ordre.
///
/// Value type : embarquable tel quel dans un actor ou derrière un NSLock.
public struct BoundedFIFOMap<Key: Hashable, Value> {
    private var storage: [Key: Value] = [:]
    private var insertionOrder: [Key] = []
    public let capacity: Int

    public init(capacity: Int) {
        self.capacity = max(1, capacity)
    }

    public subscript(key: Key) -> Value? {
        get { storage[key] }
        set {
            guard let newValue else {
                removeValue(forKey: key)
                return
            }
            if storage.updateValue(newValue, forKey: key) == nil {
                insertionOrder.append(key)
                if insertionOrder.count > capacity {
                    let evicted = insertionOrder.removeFirst()
                    storage.removeValue(forKey: evicted)
                }
            }
        }
    }

    @discardableResult
    public mutating func removeValue(forKey key: Key) -> Value? {
        guard let removed = storage.removeValue(forKey: key) else { return nil }
        insertionOrder.removeAll { $0 == key }
        return removed
    }

    public mutating func removeAll() {
        storage.removeAll()
        insertionOrder.removeAll()
    }

    public var count: Int { storage.count }
    public var isEmpty: Bool { storage.isEmpty }
}

extension BoundedFIFOMap: Sendable where Key: Sendable, Value: Sendable {}
