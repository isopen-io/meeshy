import SwiftUI
import MeeshySDK
import MeeshyUI

// Extrait de `ConversationListView.swift`, hors budget de taille : le lot #8892
// ajoute « est dans la conversation », on extrait d'abord les signaux du pair
// d'une conversation directe (story, humeur), on ajoute ensuite. Chaque
// résolveur rend une VALEUR que la rangée compare dans son `==`.

extension ConversationListView {

    func storyRingState(for conversation: Conversation) -> StoryRingState {
        guard conversation.type == .direct, let userId = conversation.participantUserId else { return .none }
        return storyViewModel.storyRingState(forUserId: userId)
    }

    func conversationMoodStatus(for conversation: Conversation) -> StatusEntry? {
        guard conversation.type == .direct, let userId = conversation.participantUserId else { return nil }
        return statusViewModel.statusForUser(userId: userId)
    }

    /// Le pair d'une conversation directe a l'écran de CETTE conversation
    /// ouvert (#8892). Le rafraîchissement passe par `presencePulse`, que
    /// `PresenceManager` relance quand l'ensemble des présents change.
    func peerIsHere(in conversation: Conversation) -> Bool {
        guard conversation.type == .direct, let userId = conversation.participantUserId else { return false }
        return PresenceManager.shared.isHere(userId: userId, conversationId: conversation.id)
    }
}
