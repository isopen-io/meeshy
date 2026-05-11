import Combine
import Foundation
import MeeshySDK

/// Aggregates network, socket, and outbox state into a single `Status` so
/// `ConnectionBanner` (and any other UI surface) can render the right
/// connection-health indicator without observing three singletons.
///
/// Phase 4 Task 4.7 — moves the `!isOffline && !isConnected` heuristic out
/// of the view and adds an explicit `.syncing` state driven by
/// `OfflineQueue.pendingCountPublisher` (Phase 4 Task 4.B1).
///
/// The init accepts publishers directly so tests can drive deterministic
/// state transitions without bringing up real singletons.
@MainActor
public final class ConnectionStatusViewModel: ObservableObject {

    /// Connection-health roll-up surfaced to the UI.
    /// - `.offline` — device has no network interface at all.
    /// - `.disconnected` — network is up but the socket is not connected.
    /// - `.syncing` — fully connected, but the offline queue still has pending writes.
    /// - `.connected` — connected and outbox empty.
    public enum Status: Sendable, Equatable {
        case connected
        case syncing
        case disconnected
        case offline
    }

    @Published public private(set) var status: Status = .connected

    private var cancellables: Set<AnyCancellable> = []

    /// Designated initializer — accepts publishers for full testability.
    public init(
        isOnlinePublisher: AnyPublisher<Bool, Never>,
        isConnectedPublisher: AnyPublisher<Bool, Never>,
        pendingCountPublisher: AnyPublisher<Int, Never>
    ) {
        Publishers.CombineLatest3(
            isOnlinePublisher,
            isConnectedPublisher,
            pendingCountPublisher
        )
        .receive(on: DispatchQueue.main)
        .sink { [weak self] online, connected, pending in
            self?.status = Self.derive(online: online, connected: connected, pending: pending)
        }
        .store(in: &cancellables)
    }

    /// Convenience initializer wiring the live singletons used in production.
    public convenience init(
        networkMonitor: NetworkMonitor = .shared,
        socketManager: MessageSocketManager = .shared,
        offlineQueue: OfflineQueue = .shared
    ) {
        self.init(
            isOnlinePublisher: networkMonitor.$isOffline.map { !$0 }.eraseToAnyPublisher(),
            isConnectedPublisher: socketManager.$isConnected.eraseToAnyPublisher(),
            pendingCountPublisher: offlineQueue.pendingCountPublisher
        )
    }

    /// Pure derivation — kept `static` so it can be unit-tested directly
    /// without spinning up the Combine pipeline.
    static func derive(online: Bool, connected: Bool, pending: Int) -> Status {
        if !online { return .offline }
        if !connected { return .disconnected }
        if pending > 0 { return .syncing }
        return .connected
    }
}
