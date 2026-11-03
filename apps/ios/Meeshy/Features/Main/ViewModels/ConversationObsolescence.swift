import SwiftUI
import MeeshySDK
import MeeshyUI

/// « Rendre obsolète » (#14645) : effacer le contenu d'une conversation POUR
/// TOUS, d'un geste. Optimiste : la ligne quitte la liste, le store et le
/// cache disque dès le geste ; un refus de la passerelle la remet à sa place.
/// Les autres membres la perdent par `conversation:obsoleted`
/// (`ConversationStoreSocketBridge`, `CacheCoordinator`), et le fil ouvert se
/// referme (`ConversationSocketHandler`).
@MainActor
struct ConversationObsolescence {
    let list: ConversationListViewModel

    /// `false` : la passerelle a refusé, la ligne est revenue.
    @discardableResult
    func perform(conversationId: String) async -> Bool {
        guard let index = list.convIndex(for: conversationId) else { return false }
        let removed = list.conversations[index]
        list.conversations.remove(at: index)
        list.conversationLeavesDetail.send(conversationId)
        list.schedulePersist()
        await list.store.applyConversationDeleted(ConversationDeletedEvent(conversationId: conversationId))
        do {
            _ = try await list.conversationService.obsolete(conversationId: conversationId)
            await CacheCoordinator.shared.messages.invalidate(for: conversationId)
            return true
        } catch {
            await list.store.applyConversationRestored(removed)
            if list.convIndex(for: conversationId) == nil {
                list.conversations.insert(removed, at: min(index, list.conversations.count))
                list.schedulePersist()
            }
            return false
        }
    }

    static var failureMessage: String {
        String(localized: "conversation.obsolete.error", defaultValue: "Impossible de rendre la conversation obsolète.", bundle: .main)
    }

    static var confirmationTitle: String {
        String(localized: "conversation.obsolete.confirm.title", defaultValue: "Rendre la conversation obsolète ?", bundle: .main)
    }

    static func confirmationMessage(conversationName: String) -> String {
        String(
            localized: "conversation.obsolete.confirm.message",
            defaultValue: "Tout le contenu de « \(conversationName) » sera effacé pour tous les membres, et la conversation disparaîtra de leurs listes. C'est définitif.",
            bundle: .main
        )
    }
}

/// La confirmation de la liste (#14645) : elle dit que TOUT le contenu part,
/// pour TOUS, puis la ligne disparaît d'un geste ; un refus revient en toast.
struct ConversationObsoleteConfirmation: ViewModifier {
    @Binding var target: Conversation?
    let list: ConversationListViewModel

    func body(content: Content) -> some View {
        content.alert(
            ConversationObsolescence.confirmationTitle,
            isPresented: Binding(get: { target != nil }, set: { if !$0 { target = nil } }),
            presenting: target
        ) { conversation in
            Button(ConversationMenuEntry.obsolete.label, role: .destructive) {
                HapticFeedback.heavy()
                let obsolescence = ConversationObsolescence(list: list)
                Task {
                    guard await obsolescence.perform(conversationId: conversation.id) else {
                        FeedbackToastManager.shared.showError(ConversationObsolescence.failureMessage)
                        return
                    }
                }
            }
            Button(String(localized: "common.cancel", defaultValue: "Annuler", bundle: .main), role: .cancel) {}
        } message: { conversation in
            Text(ConversationObsolescence.confirmationMessage(conversationName: conversation.name))
        }
    }
}
