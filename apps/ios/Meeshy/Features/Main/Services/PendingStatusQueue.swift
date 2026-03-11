import Foundation
import MeeshySDK

actor PendingStatusQueue {
    static let shared = PendingStatusQueue()
    private let key = "meeshy_pending_status_actions"
    private let maxActions = 100

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

    private static let maxAge: TimeInterval = 24 * 60 * 60

    func flush() async {
        let now = Date()
        let actions = load().filter { now.timeIntervalSince($0.timestamp) < Self.maxAge }
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
                let _: APIResponse<[String: String]> = try await APIClient.shared.request(
                    endpoint: endpoint, method: "POST"
                )
            } catch {
                remaining.append(action)
            }
        }
        save(remaining)
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
