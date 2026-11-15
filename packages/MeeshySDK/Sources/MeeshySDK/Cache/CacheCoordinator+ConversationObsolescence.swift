import Foundation
import Combine

// MARK: - Une conversation rendue obsolète quitte le cache persisté (#14645)

extension CacheCoordinator {

    /// `conversation:obsoleted` : un administrateur a effacé le contenu pour
    /// tous. La ligne quitte la liste persistée, ses messages et son index de
    /// médias partent avec elle — rien de ce contenu ne survit sur l'appareil.
    /// Le store en mémoire est vidé par `ConversationStoreSocketBridge`.
    func subscribeToConversationObsolescence() {
        let lane = OrderedEventLane()
        lane.store(in: &cancellables)
        messageSocket.conversationObsoleted
            .relay(through: lane) { [weak self] in await self?.forgetObsoletedConversation($0.conversationId) }
            .store(in: &cancellables)
    }

    func forgetObsoletedConversation(_ conversationId: String) async {
        let list = await conversations.load(for: "list").snapshot() ?? []
        if list.contains(where: { $0.id == conversationId }) {
            await conversations.update(for: "list") { rows in
                rows.filter { $0.id != conversationId }
            }
        }
        await messages.invalidate(for: conversationId)
        await invalidateConversationMedia(conversationId: conversationId)
    }
}
