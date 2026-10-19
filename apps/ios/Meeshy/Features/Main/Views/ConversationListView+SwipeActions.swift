import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - Swipe Actions

/// Les actions de balayage d'une rangée de conversation : épingler, couper le
/// son, verrouiller à gauche ; archiver, marquer lu, masquer à droite.
/// Le view model porte les mutations ; les trois points d'entrée de la vue
/// (feuille de verrouillage, alerte « code maître requis », confirmation de
/// suppression) lui sont rendus par fermetures.
struct ConversationSwipeActions {
    let viewModel: ConversationListViewModel
    let lockManager: ConversationLockManager
    let onLockRequest: (Conversation, ConversationLockSheet.Mode) -> Void
    let onMasterPinMissing: () -> Void
    let onHide: (Conversation) -> Void

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
        static let mute = String(localized: "swipe.mute")
        static let unmute = String(localized: "swipe.unmute")
        static let lock = String(localized: "swipe.lock")
        static let unlock = String(localized: "swipe.unlock")
        static let archive = String(localized: "swipe.archive")
        static let unarchive = String(localized: "swipe.unarchive")
        static let markRead = String(localized: "swipe.mark_read")
        static let markUnread = String(localized: "swipe.mark_unread")
        static let hide = String(localized: "swipe.hide")
    }

    func leadingSwipeActions(for conversation: Conversation) -> [SwipeAction] {
        let isLocked = lockManager.isLocked(conversation.id)
        return [
            SwipeAction(
                icon: conversation.userState.isPinned ? "pin.slash.fill" : "pin.fill",
                label: conversation.userState.isPinned ? SwipeLabels.unpin : SwipeLabels.pin,
                color: MeeshyColors.pinnedBlue
            ) {
                Task { await viewModel.togglePin(for: conversation.id) }
            },
            SwipeAction(
                icon: conversation.userState.isMuted ? "bell.fill" : "bell.slash.fill",
                label: conversation.userState.isMuted ? SwipeLabels.unmute : SwipeLabels.mute,
                color: MeeshyColors.neutral500
            ) {
                Task { await viewModel.toggleMute(for: conversation.id) }
            },
            SwipeAction(
                icon: isLocked ? "lock.open.fill" : "lock.fill",
                label: isLocked ? SwipeLabels.unlock : SwipeLabels.lock,
                color: MeeshyColors.warning
            ) {
                if isLocked {
                    onLockRequest(conversation, .unlockConversation)
                } else if lockManager.masterPinConfigured {
                    onLockRequest(conversation, .lockConversation)
                } else {
                    onMasterPinMissing()
                }
            }
        ]
    }

    func trailingSwipeActions(for conversation: Conversation) -> [SwipeAction] {
        // Per-user archive state (same source as the list filter + `.setArchived`),
        // NOT `conversation.isActive` (server lifecycle flag) — reading it froze this
        // swipe on "Archiver". Global d'un mineur ne se désarchive pas (#9929).
        let isArchived = conversation.userState.isArchived
        let isRead = conversation.userState.unreadCount == 0
        var actions: [SwipeAction] = [
            SwipeAction(
                icon: isArchived ? "tray.and.arrow.up.fill" : "archivebox.fill",
                label: isArchived ? SwipeLabels.unarchive : SwipeLabels.archive,
                color: MeeshyColors.warning
            ) {
                if isArchived {
                    Task { await viewModel.unarchiveConversation(conversationId: conversation.id) }
                } else {
                    Task { await viewModel.archiveConversation(conversationId: conversation.id) }
                }
            },
            SwipeAction(
                icon: isRead ? "envelope.badge.fill" : "envelope.open.fill",
                label: isRead ? SwipeLabels.markUnread : SwipeLabels.markRead,
                color: MeeshyColors.indigo400
            ) {
                if isRead {
                    Task { await viewModel.markAsUnread(conversationId: conversation.id) }
                } else {
                    Task { await viewModel.markAsRead(conversationId: conversation.id) }
                }
            }
        ]

        if conversation.isArchiveImposed { actions.removeAll { $0.label == SwipeLabels.unarchive } }
        actions.append(SwipeAction(
            icon: "eye.slash.fill",
            label: SwipeLabels.hide,
            color: MeeshyColors.error
        ) {
            onHide(conversation)
        })

        return actions
    }
}
