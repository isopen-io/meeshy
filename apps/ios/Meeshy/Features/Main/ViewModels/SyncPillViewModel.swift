import Foundation
import Combine
import MeeshySDK

/// UI-facing state for the sync pill. Combines the outbox queue snapshot
/// (`OfflineQueuePillProviding.pendingUIItemsPublisher`) and the debounced
/// offline-state publisher (`NetworkMonitorProviding.isOfflinePublisher`)
/// into a single discriminated state.
///
/// Priority (highest first): `.failed` > `.offline` > `.syncing` > `.hidden`.
public enum PillState: Equatable, Sendable {
    case hidden
    case syncing(items: [OutboxUIItem])
    case offline(items: [OutboxUIItem])
    case failed(items: [OutboxUIItem])

    public var items: [OutboxUIItem] {
        switch self {
        case .hidden:
            return []
        case .syncing(let items),
             .offline(let items),
             .failed(let items):
            return items
        }
    }
}

@MainActor
final class SyncPillViewModel: ObservableObject {
    @Published private(set) var state: PillState = .hidden

    private var cancellables = Set<AnyCancellable>()

    /// Inflight rows older than this threshold are treated as "stuck" and
    /// surfaced via `.offline(...)` even when the network reports online —
    /// catches the case where a socket stalled silently.
    nonisolated static let staleInflightThreshold: TimeInterval = 4.0

    init(
        offlineQueue: OfflineQueuePillProviding = OfflineQueue.shared,
        networkMonitor: NetworkMonitorProviding = NetworkMonitor.shared
    ) {
        Publishers.CombineLatest(
            offlineQueue.pendingUIItemsPublisher,
            networkMonitor.isOfflinePublisher
        )
        .map { items, isOffline in
            Self.derive(items: items, isOffline: isOffline, now: Date())
        }
        .receive(on: DispatchQueue.main)
        .sink { [weak self] newState in
            self?.state = newState
        }
        .store(in: &cancellables)
    }

    nonisolated static func derive(
        items: [OutboxUIItem],
        isOffline: Bool,
        now: Date
    ) -> PillState {
        if items.contains(where: { $0.status == .failed }) {
            return .failed(items: items)
        }
        let hasStaleInflight = items.contains { item in
            item.status == .inflight
                && now.timeIntervalSince(item.createdAt) > staleInflightThreshold
        }
        if isOffline || hasStaleInflight {
            return .offline(items: items)
        }
        if !items.isEmpty {
            return .syncing(items: items)
        }
        return .hidden
    }
}
