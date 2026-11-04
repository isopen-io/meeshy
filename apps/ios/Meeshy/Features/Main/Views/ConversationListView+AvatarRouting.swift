import SwiftUI
import MeeshySDK

// MARK: - Le toucher de l'avatar d'une ligne (#15887)

/// Profil du pair ou détails de la conversation, décidés par la loi
/// (`ConversationOpenRoute.avatarRoute`) relue AU TOUCHER : un verrou posé ou
/// un blocage décidé depuis le dernier rendu de la ligne ne laisse pas passer
/// l'ancien geste. Jamais rien, jamais le fil.
extension ConversationListView {
    func handleProfileView(_ conversation: Conversation) {
        switch ConversationOpenRoute.avatarRoute(for: conversation) {
        case .profile: selectedProfileUser = .from(conversation: conversation)
        case .info, .unlockThenInfo: presentInfo(of: conversation)
        }
    }

    /// Conversation verrouillée : la fiche passe la porte du verrou (PIN), puis
    /// s'ouvre — `ConversationListModalPresentations.admitInfo(of:)`.
    func presentInfo(of conversation: Conversation) {
        guard ConversationOpenRoute.mayShowInfo(conversation.id) else {
            sheetTargets.infoAfterUnlock = true
            sheetTargets.searchAfterUnlock = false
            lockSheetMode = .openConversation
            sheetTargets.lockSheet = conversation
            return
        }
        sheetTargets.info = conversation
    }
}
