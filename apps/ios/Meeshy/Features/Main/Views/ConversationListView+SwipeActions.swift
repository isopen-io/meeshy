import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - Swipe Actions

/// Le bord de FIN d'une rangée : archiver, lu / non lu, puis « Rendre
/// obsolète » en dernier quand la loi du menu l'accorde (#14645). Il ne
/// supprime plus (directive porteur, #17242) : la suppression reste
/// au menu d'appui long, avec sa confirmation. Trois actions au plus (#10579).
nonisolated enum ConversationTrailingSwipe: Equatable, Sendable {
    case archive, unarchive, markRead, markUnread, obsolete

    static func plan(isArchived: Bool, isArchiveImposed: Bool, hasUnread: Bool, obsolete: Bool) -> [ConversationTrailingSwipe] {
        let archive: ConversationTrailingSwipe? = isArchived ? (isArchiveImposed ? nil : .unarchive) : .archive
        let read: ConversationTrailingSwipe = hasUnread ? .markRead : .markUnread
        return Array([archive, read, obsolete ? .obsolete : nil].compactMap { $0 }.prefix(SwipeRowRules.maxActionsPerSide))
    }
}

/// Les actions de balayage d'une rangée de conversation : épingler à gauche —
/// Sourdine et Verrouiller restent au menu d'appui long (directive porteur,
/// #17242) ; le bord de fin suit `ConversationTrailingSwipe`.
/// Le view model porte les mutations ; la confirmation d'obsolescence est
/// rendue à la vue par fermeture.
struct ConversationSwipeActions {
    let viewModel: ConversationListViewModel
    let currentUser: MeeshyUser?
    let onObsolete: (Conversation) -> Void

    /// Labels des swipe actions précalculés UNE fois par vie de process.
    /// Les builders ci-dessous tournent pour CHAQUE conversation à CHAQUE
    /// body pass (~99 rows × 8 labels) ; `String(localized:)` refait un
    /// lookup de bundle à chaque appel — mesurable dans la famine du main
    /// thread derrière les kills 0x8BADF00D (diag 2026-07-05). La langue de
    /// l'app ne change pas à chaud (redémarrage requis), des statiques sont
    /// donc sûres.
    private enum SwipeLabels {
        static let pin = String(localized: "swipe.pin")
        static let unpin = String(localized: "swipe.unpin")
        static let archive = String(localized: "swipe.archive")
        static let unarchive = String(localized: "swipe.unarchive")
        static let markRead = String(localized: "swipe.mark_read")
        static let markUnread = String(localized: "swipe.mark_unread")
        static let obsolete = ConversationMenuEntry.obsolete.label
    }

    func leadingSwipeActions(for conversation: Conversation) -> [SwipeAction] {
        [
            SwipeAction(
                icon: conversation.userState.isPinned ? "pin.slash.fill" : "pin.fill",
                label: conversation.userState.isPinned ? SwipeLabels.unpin : SwipeLabels.pin,
                color: MeeshyColors.pinnedBlue
            ) {
                Task { await viewModel.togglePin(for: conversation.id) }
            }
        ]
    }

    func trailingSwipeActions(for conversation: Conversation) -> [SwipeAction] {
        // Per-user archive state (same source as the list filter + `.setArchived`),
        // NOT `conversation.isActive` (server lifecycle flag) — reading it froze this
        // swipe on "Archiver". Global d'un mineur ne se désarchive pas (#9929).
        let plan = ConversationTrailingSwipe.plan(
            isArchived: conversation.userState.isArchived,
            isArchiveImposed: conversation.isArchiveImposed,
            hasUnread: conversation.userState.unreadCount > 0,
            obsolete: ConversationRowMenuCapabilities.make(conversation: conversation, currentUser: currentUser).obsolete
        )
        let actions = plan.map { trailingAction($0, for: conversation) }
        return actions
    }

    private func trailingAction(_ kind: ConversationTrailingSwipe, for conversation: Conversation) -> SwipeAction {
        let id = conversation.id
        switch kind {
        case .archive:
            return SwipeAction(icon: "archivebox.fill", label: SwipeLabels.archive, color: MeeshyColors.warning) {
                Task { await viewModel.archiveConversation(conversationId: id) }
            }
        case .unarchive:
            return SwipeAction(icon: "tray.and.arrow.up.fill", label: SwipeLabels.unarchive, color: MeeshyColors.warning) {
                Task { await viewModel.unarchiveConversation(conversationId: id) }
            }
        case .markRead:
            return SwipeAction(icon: "envelope.open.fill", label: SwipeLabels.markRead, color: MeeshyColors.indigo400) {
                Task { await viewModel.markAsRead(conversationId: id) }
            }
        case .markUnread:
            return SwipeAction(icon: "envelope.badge.fill", label: SwipeLabels.markUnread, color: MeeshyColors.indigo400) {
                Task { await viewModel.markAsUnread(conversationId: id) }
            }
        case .obsolete:
            return SwipeAction(icon: ConversationMenuEntry.obsolete.symbol, label: SwipeLabels.obsolete, color: MeeshyColors.error) {
                onObsolete(conversation)
            }
        }
    }
}
