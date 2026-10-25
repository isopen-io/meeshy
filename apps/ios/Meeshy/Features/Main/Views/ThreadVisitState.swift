import Foundation
import MeeshySDK

/// **L'état de la VISITE qu'aucune ligne GRDB ne porte** : la vue unique texte
/// ouverte (#7618), l'éphémère en combustion (#8382) et le clair qu'un message
/// chiffré de bout en bout a sur CET appareil (#12916). Le fil rend
/// `MessageStore` ; ces états vivent au modèle de vue et se reposent ici, sur
/// chaque cellule, dans les modes que la liste sert — le site unique que la
/// cellule, la capture d'écran et les témoins lisent.
enum ThreadVisitState {
    static func apply(to message: inout MeeshyMessage, from viewModel: ConversationViewModel?) {
        message.isViewOnceRevealed = viewModel?.revealedViewOnceIds[message.id] == true
        message.isBurning = viewModel?.burningEphemeralIds[message.id] == true
        guard let viewModel else { return }
        viewModel.startupDependencies.endToEndClear.apply(to: &message, conversationId: viewModel.conversationId)
    }
}
