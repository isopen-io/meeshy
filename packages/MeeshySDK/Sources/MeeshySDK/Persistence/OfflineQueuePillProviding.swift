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

    /// **Relance une ligne définitivement échouée** — remet `attempts` à zéro,
    /// efface `lastError`, repasse `status` à `.pending` et programme la
    /// prochaine passe du flusher pour tout de suite.
    ///
    /// Déclarée ICI, sur le protocole de la PASTILLE, parce que c'est la
    /// pastille qui la déclenche : elle est la seule surface où une ligne
    /// épuisée est visible, et le seul étage que les deux racines — iPhone et
    /// iPad — partagent. `OfflineQueue.retryItem(_:)` existait, `public`,
    /// documentée « Manual Retry (Phase 4 prereq) », et n'avait **aucun
    /// appelant de production** (#5830) : un contrat mort, donc une pastille
    /// « Réel non publié » sur laquelle le doigt ne pouvait rien.
    func retryItem(_ outboxId: String) async throws
}

extension OfflineQueue: OfflineQueuePillProviding {}
