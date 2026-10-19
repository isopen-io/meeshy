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
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466, isolation MainActor par
    // défaut) → double-free `pointer being freed was not allocated` (abrt)
    // au démontage hors d'une tâche (test XCTest synchrone, vue démontée).
    // Garde : MainActorDeinitSourceGuardTests / MeeshyUIDeinitSourceGuardTests.
    nonisolated deinit {}

    /// Connection-health roll-up surfaced to the UI.
    /// - `.offline` — device has no network interface at all.
    /// - `.connecting` — network is up and the socket has NEVER been connected
    ///   yet: a first connection, not a re-connection (#10923).
    /// - `.disconnected` — network is up but a socket that WAS connected dropped.
    /// - `.syncing` — fully connected, but the offline queue still has pending writes.
    /// - `.connected` — connected and outbox empty.
    public enum Status: Sendable, Equatable {
        case connected
        case syncing
        case connecting
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
        let socket = isConnectedPublisher
            .scan((connected: false, hasConnectedOnce: false)) { state, connected in
                (connected: connected, hasConnectedOnce: state.hasConnectedOnce || connected)
            }
        Publishers.CombineLatest3(
            isOnlinePublisher,
            socket,
            pendingCountPublisher
        )
        .receive(on: DispatchQueue.main)
        .sink { [weak self] online, socket, pending in
            self?.status = Self.derive(
                online: online,
                connected: socket.connected,
                pending: pending,
                hasConnectedOnce: socket.hasConnectedOnce
            )
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
    static func derive(online: Bool, connected: Bool, pending: Int, hasConnectedOnce: Bool) -> Status {
        if !online { return .offline }
        if !connected { return hasConnectedOnce ? .disconnected : .connecting }
        if pending > 0 { return .syncing }
        return .connected
    }
}
