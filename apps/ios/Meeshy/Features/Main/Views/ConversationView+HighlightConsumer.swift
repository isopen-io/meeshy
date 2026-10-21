import SwiftUI
import MeeshySDK

// MARK: - Le surlignage demandé par le routeur
//
// Extrait de `ConversationView.swift` (cohésion). Une notification, un retour de
// lecteur ou la fiche de conversation posent un message à viser dans le routeur ;
// la conversation le consomme par ce chemin UNIQUE. Le défilement lui-même reste
// à l'hôte (`scrollTo`) : l'état de défilement est le sien.

/// Consomme `router.pendingHighlightMessageId` : scroll + flash sur le
/// message cible (fetch de la fenêtre autour si hors page chargée).
/// Scopé par conversation : un highlight posé pour une AUTRE conversation
/// n'est ni consommé ni « brûlé » ici — il reste disponible pour la bonne.
struct ConversationHighlightConsumer {
    let router: Router
    let conversationId: String?
    let viewModel: ConversationViewModel
    let scrollTo: (String) -> Void

    func consume() async {
        guard let messageId = router.pendingHighlightMessageId, !messageId.isEmpty else { return }
        if let scopedId = router.pendingHighlightConversationId,
           let currentId = conversationId,
           scopedId != currentId {
            return
        }
        router.pendingHighlightMessageId = nil
        router.pendingHighlightConversationId = nil
        try? await Task.sleep(for: .milliseconds(300))
        guard !Task.isCancelled else { return }
        if viewModel.messages.contains(where: { $0.id == messageId }) {
            scrollTo(messageId)
        } else {
            await viewModel.loadMessagesAround(messageId: messageId)
            if Task.isCancelled { return }
            try? await Task.sleep(for: .milliseconds(100))
            guard !Task.isCancelled else { return }
            scrollTo(messageId)
        }
    }
}
