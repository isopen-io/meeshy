import Foundation
import MeeshySDK

/// Le jeton de l'observateur `.conversationMarkedRead`. Un observateur
/// `NotificationCenter` à bloc n'est jamais retiré tout seul : sans ce
/// propriétaire, la fermeture restait inscrite pour tout le processus (des
/// no-ops via `[weak self]`), un observateur périmé par VM recréé à chaque
/// cycle login/logout. Le jeton vit dans une `TeardownBox` : posé sur le
/// MainActor, retiré une fois par le `deinit` nonisolated.
@MainActor
final class ConversationMarkedReadObserver {
    private let token = TeardownBox<(any NSObjectProtocol)?>(nil)

    nonisolated deinit {
        token.releaseNow { token in
            if let token { NotificationCenter.default.removeObserver(token) }
        }
    }

    func observe(_ handle: @escaping @MainActor @Sendable (String) async -> Void) {
        token.update { current in
            if let existing = current {
                NotificationCenter.default.removeObserver(existing)
            }
            current = NotificationCenter.default.addObserver(
                forName: .conversationMarkedRead,
                object: nil,
                queue: nil
            ) { notification in
                guard let cid = notification.object as? String else { return }
                Task { @MainActor in
                    await handle(cid)
                }
            }
        }
    }
}
