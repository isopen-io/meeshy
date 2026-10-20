import Foundation

/// Le jeton de l'observateur `.conversationMarkedRead`. Un observateur
/// `NotificationCenter` à bloc n'est jamais retiré tout seul : sans ce
/// propriétaire, la fermeture restait inscrite pour tout le processus (des
/// no-ops via `[weak self]`), un observateur périmé par VM recréé à chaque
/// cycle login/logout. `nonisolated(unsafe)` : posé sur le MainActor, lu une
/// fois dans le `deinit` nonisolated, jamais accédé en concurrence.
@MainActor
final class ConversationMarkedReadObserver {
    nonisolated(unsafe) private var token: (any NSObjectProtocol)?

    nonisolated deinit {
        if let token {
            NotificationCenter.default.removeObserver(token)
        }
    }

    func observe(_ handle: @escaping @MainActor @Sendable (String) async -> Void) {
        if let existing = token {
            NotificationCenter.default.removeObserver(existing)
        }
        token = NotificationCenter.default.addObserver(
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
