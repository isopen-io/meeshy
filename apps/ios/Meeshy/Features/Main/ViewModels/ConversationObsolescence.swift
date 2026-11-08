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

    nonisolated enum Outcome: Equatable, Sendable {
        case obsoleted
        /// La passerelle a refusé : la ligne est revenue à sa place.
        case refused(Refusal)
        /// La ligne n'est pas (ou plus) dans la liste : rien n'est parti.
        case absent
    }

    /// Pourquoi la passerelle a refusé (#14690). Dans un tête-à-tête, tant
    /// qu'une demande de message n'est pas acceptée, seul son DESTINATAIRE la
    /// rend obsolète : l'expéditeur reçoit 403 (#14676). La passerelle ne sert
    /// jamais à l'expéditeur l'état de sa demande, donc la loi de la rangée lui
    /// offre l'action ; un 403 sur une directe ne peut venir que de là. Même
    /// lecture qu'Android (`ObsoleteRefusal`).
    nonisolated enum Refusal: Equatable, Sendable {
        case pendingRequest
        case other

        static func of(isDirect: Bool, error: Error) -> Refusal {
            guard isDirect, case .forbidden? = error as? MeeshyError else { return .other }
            return .pendingRequest
        }

        var message: String {
            switch self {
            case .pendingRequest:
                return String(
                    localized: "conversation.obsolete.refused_pending_request",
                    defaultValue: "Seul le destinataire d'une demande de message non acceptée peut rendre cette conversation obsolète.",
                    bundle: .main
                )
            case .other:
                return ConversationObsolescence.failureMessage
            }
        }
    }

    @discardableResult
    func perform(conversationId: String) async -> Outcome {
        guard let index = list.convIndex(for: conversationId) else { return .absent }
        let removed = list.conversations[index]
        list.conversations.remove(at: index)
        list.conversationLeavesDetail.send(conversationId)
        list.schedulePersist()
        await list.store.applyConversationDeleted(ConversationDeletedEvent(conversationId: conversationId))
        do {
            _ = try await list.conversationService.obsolete(conversationId: conversationId)
            await CacheCoordinator.shared.messages.invalidate(for: conversationId)
            return .obsoleted
        } catch {
            await list.store.applyConversationRestored(removed)
            if list.convIndex(for: conversationId) == nil {
                list.conversations.insert(removed, at: min(index, list.conversations.count))
                list.schedulePersist()
            }
            return .refused(Refusal.of(isDirect: removed.type == .direct, error: error))
        }
    }

    nonisolated static var failureMessage: String {
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

/// La confirmation de la liste (#14645), armée par le menu ET le balayage de
/// fin : elle dit que TOUT le contenu part, pour TOUS, puis la ligne disparaît
/// d'un geste ; un refus la rend et dit pourquoi en toast (#14690).
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
                    guard case .refused(let refusal) = await obsolescence.perform(conversationId: conversation.id) else { return }
                    HapticFeedback.error()
                    FeedbackToastManager.shared.showError(refusal.message)
                }
            }
            Button(String(localized: "common.cancel", defaultValue: "Annuler", bundle: .main), role: .cancel) {}
        } message: { conversation in
            Text(ConversationObsolescence.confirmationMessage(conversationName: conversation.name))
        }
    }
}
