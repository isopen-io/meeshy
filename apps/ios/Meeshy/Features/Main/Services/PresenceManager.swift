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
    nonisolated(unsafe) private var recalcTimer: Timer?

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

        // Keep the last-known presence snapshot across brief socket drops
        // (e.g. iOS background → foreground transition). Wiping the map the
        // moment `isConnected` flips to false caused all avatars to lose
        // their online dots during every resume, which felt like the app
        // "forgot" who was online. The `.away` computed state still kicks in
        // after 5 min of inactivity, so stale data decays gracefully.
        // Presence will be refreshed when `user:status` events resume.

        // Recalculate every 60s — déclenche un re-render seulement si un utilisateur
        // passe de online → away dans cette fenêtre (lastActiveAt entre 300 et 360s)
        recalcTimer = Timer.scheduledTimer(withTimeInterval: 60, repeats: true) { [weak self] _ in
            Task { @MainActor in
                guard let self else { return }
                let hasTransition = self.presenceMap.values.contains { presence in
                    guard presence.isOnline, let last = presence.lastActiveAt else { return false }
                    let elapsed = Date().timeIntervalSince(last)
                    return elapsed > 300 && elapsed <= 360
                }
                if hasTransition {
                    self.objectWillChange.send()
                }
            }
        }
    }

    // Seed initial presence from conversations API response
    func seed(from conversations: [APIConversation], currentUserId: String) {
        for conv in conversations {
            guard let participants = conv.participants else { continue }
            for participant in participants where participant.userId != currentUserId {
                guard let userId = participant.userId else { continue }
                let isOnline = participant.isOnline ?? participant.user?.isOnline ?? false
                let lastActive = participant.lastActiveAt ?? participant.user?.lastActiveAt
                presenceMap[userId] = UserPresence(
                    isOnline: isOnline,
                    lastActiveAt: lastActive
                )
            }
        }
    }

    func presenceState(for userId: String) -> PresenceState {
        presenceMap[userId]?.state ?? .offline
    }

    deinit {
        recalcTimer?.invalidate()
        recalcTimer = nil
    }
}
