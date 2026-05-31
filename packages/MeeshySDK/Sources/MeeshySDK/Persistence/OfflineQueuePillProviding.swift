import Combine

/// Narrow protocol surfacing the outbox queue snapshot consumed by the
/// `SyncPill` UI. Lets views and view-models depend on a single Combine
/// publisher of `[OutboxUIItem]` without binding to the full `OfflineQueue`
/// actor surface (and without taking the actor isolation penalty on every
/// SwiftUI body re-render).
public protocol OfflineQueuePillProviding: Sendable {
    /// Current pending/inflight/failed outbox rows, ordered by `createdAt`
    /// ascending. Emits the latest snapshot immediately on subscription
    /// (Combine `CurrentValueSubject` semantics) and every time the outbox
    /// table changes (enqueue, drain, retry, dequeue, clear).
    nonisolated var pendingUIItemsPublisher: AnyPublisher<[OutboxUIItem], Never> { get }
}

extension OfflineQueue: OfflineQueuePillProviding {}
