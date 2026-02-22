import Foundation
import Combine
import MeeshySDK

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

        // Clear stale presence on socket disconnect
        MessageSocketManager.shared.$isConnected
            .receive(on: DispatchQueue.main)
            .sink { [weak self] connected in
                if !connected {
                    self?.presenceMap.removeAll()
                }
            }
            .store(in: &cancellables)

        // Recalculate every 60s (online -> away after 5min idle)
        recalcTimer = Timer.scheduledTimer(withTimeInterval: 60, repeats: true) { [weak self] _ in
            Task { @MainActor in
                self?.objectWillChange.send()
            }
        }
    }

    // Seed initial presence from conversations API response
    func seed(from conversations: [APIConversation], currentUserId: String) {
        for conv in conversations {
            guard let members = conv.members else { continue }
            for member in members where member.userId != currentUserId {
                guard let user = member.user, let isOnline = user.isOnline else { continue }
                presenceMap[member.userId] = UserPresence(
                    isOnline: isOnline,
                    lastActiveAt: user.lastActiveAt
                )
            }
        }
    }

    func presenceState(for userId: String) -> PresenceState {
        presenceMap[userId]?.state ?? .offline
    }
}
