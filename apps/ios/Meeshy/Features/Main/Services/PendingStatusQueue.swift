import Foundation
import MeeshySDK

actor PendingStatusQueue {
    static let shared = PendingStatusQueue()

    private let key = "meeshy_pending_status_actions"
    private let maxActions = 100

    /// Injected API client — defaults to the app singleton. Overridable in
    /// tests via `PendingStatusQueue(apiClient: mock)`.
    private let apiClient: any APIClientProviding

    init(apiClient: any APIClientProviding = APIClient.shared) {
        self.apiClient = apiClient
    }

    struct PendingAction: Codable, Sendable {
        let conversationId: String
        let type: String
        let timestamp: Date
    }

    func enqueue(_ action: PendingAction) {
        var actions = load()
        actions.append(action)
        if actions.count > maxActions {
            actions = Array(actions.suffix(maxActions))
        }
        save(actions)
    }

    /// Returns the current pending actions without removing them.
    func peek() -> [PendingAction] { load() }

    /// Returns the number of pending actions.
    func pendingCount() -> Int { load().count }

    private static let maxAge: TimeInterval = 24 * 60 * 60

    func flush() async {
        let now = Date()
        // Drop actions persisted with an empty conversationId (legacy bug —
        // the resulting endpoint /conversations//mark-as-received was
        // normalized to /conversations/mark-as-received and 404'd forever,
        // burning retries on every flush). Also drop expired actions.
        let actions = load().filter {
            !$0.conversationId.isEmpty && now.timeIntervalSince($0.timestamp) < Self.maxAge
        }
        guard !actions.isEmpty else {
            save([])
            return
        }

        var remaining: [PendingAction] = []
        for action in actions {
            let endpoint = action.type == "read"
                ? "/conversations/\(action.conversationId)/mark-as-read"
                : "/conversations/\(action.conversationId)/mark-as-received"
            do {
                let _: APIResponse<[String: String]> = try await apiClient.request(
                    endpoint: endpoint, method: "POST"
                )
            } catch {
                remaining.append(action)
            }
        }
        save(remaining)
    }

    /// Removes all pending actions without flushing to the server.
    /// Used in tests and for reset scenarios.
    func clearAll() {
        save([])
    }

    private func load() -> [PendingAction] {
        guard let data = UserDefaults.standard.data(forKey: key),
              let actions = try? JSONDecoder().decode([PendingAction].self, from: data) else {
            return []
        }
        return actions
    }

    private func save(_ actions: [PendingAction]) {
        let data = try? JSONEncoder().encode(actions)
        UserDefaults.standard.set(data, forKey: key)
    }
}
