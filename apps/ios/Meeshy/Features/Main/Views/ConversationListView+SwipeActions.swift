import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - Swipe Actions

/// Le bord de FIN d'une rangée : archiver, lu / non lu, masquer, puis
/// « Rendre obsolète » en dernier quand la loi du menu l'accorde (#14645).
/// Le bord porte trois actions au plus (#10579) : quand « Rendre obsolète »
/// le remplirait, la bascule lu / non lu cède sa place — elle reste en tête
/// du menu d'appui long, et le bord garde ce qui RETIRE la conversation.
nonisolated enum ConversationTrailingSwipe: Equatable, Sendable {
    case archive, unarchive, markRead, markUnread, hide, obsolete

    static func plan(isArchived: Bool, isArchiveImposed: Bool, hasUnread: Bool, obsolete: Bool) -> [ConversationTrailingSwipe] {
        let archive: ConversationTrailingSwipe? = isArchived ? (isArchiveImposed ? nil : .unarchive) : .archive
        let read: ConversationTrailingSwipe = hasUnread ? .markRead : .markUnread
        let edge = [archive, read, .hide, obsolete ? .obsolete : nil].compactMap { $0 }
        guard edge.count > SwipeRowRules.maxActionsPerSide else { return edge }
        return edge.filter { $0 != read }
    }
}

/// Les actions de balayage d'une rangée de conversation : épingler, couper le
/// son, verrouiller à gauche ; le bord de fin suit `ConversationTrailingSwipe`.
/// Le view model porte les mutations ; les points d'entrée de la vue (feuille
/// de verrouillage, alerte « code maître requis », confirmations de
/// suppression et d'obsolescence) lui sont rendus par fermetures.
struct ConversationSwipeActions {
    let viewModel: ConversationListViewModel
    let lockManager: ConversationLockManager
    let currentUser: MeeshyUser?
    let onLockRequest: (Conversation, ConversationLockSheet.Mode) -> Void
    let onMasterPinMissing: () -> Void
    let onHide: (Conversation) -> Void
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
        static let mute = String(localized: "swipe.mute")
        static let unmute = String(localized: "swipe.unmute")
        static let lock = String(localized: "swipe.lock")
        static let unlock = String(localized: "swipe.unlock")
        static let archive = String(localized: "swipe.archive")
        static let unarchive = String(localized: "swipe.unarchive")
        static let markRead = String(localized: "swipe.mark_read")
        static let markUnread = String(localized: "swipe.mark_unread")
        static let hide = String(localized: "swipe.hide")
        static let obsolete = ConversationMenuEntry.obsolete.label
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
        case .hide:
            return SwipeAction(icon: "eye.slash.fill", label: SwipeLabels.hide, color: MeeshyColors.error) {
                onHide(conversation)
            }
        case .obsolete:
            return SwipeAction(icon: ConversationMenuEntry.obsolete.symbol, label: SwipeLabels.obsolete, color: MeeshyColors.error) {
                onObsolete(conversation)
            }
        }
    }
}
