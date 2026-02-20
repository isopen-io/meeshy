import Foundation
import Combine
import MeeshySDK

// MARK: - Presence State

enum PresenceState: Equatable {
    case online   // green — lastActive < 5min
    case away     // orange — lastActive > 5min but isOnline
    case offline  // no dot
}

// MARK: - User Presence

struct UserPresence {
    let isOnline: Bool
    let lastActiveAt: Date?

    var state: PresenceState {
        guard isOnline else { return .offline }
        guard let last = lastActiveAt else { return .online }
        return Date().timeIntervalSince(last) > 300 ? .away : .online
    }
}

// MARK: - Presence Manager

@MainActor
final class PresenceManager: ObservableObject {
    static let shared = PresenceManager()

    @Published var presenceMap: [String: UserPresence] = [:]

    private var cancellables = Set<AnyCancellable>()
    private var recalcTimer: Timer?

    private init() {
        // Subscribe to user:status events from socket
        MessageSocketManager.shared.userStatusChanged
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in
                self?.presenceMap[event.userId] = UserPresence(
                    isOnline: event.isOnline,
                    lastActiveAt: event.lastActiveAt
                )
            }
            .store(in: &cancellables)

        // Recalculate every 60s (online -> away after 5min idle)
        recalcTimer = Timer.scheduledTimer(withTimeInterval: 60, repeats: true) { [weak self] _ in
            Task { @MainActor in
                self?.objectWillChange.send()
            }
        }
    }

    func presenceState(for userId: String) -> PresenceState {
        presenceMap[userId]?.state ?? .offline
    }
}
