package me.meeshy.app.conversations

/**
 * LE geste de chaque entrée du menu, le même pour toutes les entrées : le composable ne branche rien,
 * il remet l'entrée touchée. Les entrées que le menu traite lui-même (sous-menus, étiquettes,
 * suppression pour tous, rendre obsolète) n'agissent pas ici. Miroir de `ConversationRowMenuActions.perform`.
 */
internal fun ConversationRowActions.perform(
    entry: ConversationMenuEntry,
    manageMembers: (() -> Unit)? = null,
) {
    when (entry) {
        ConversationMenuEntry.PIN, ConversationMenuEntry.UNPIN -> onTogglePin()
        ConversationMenuEntry.MUTE, ConversationMenuEntry.UNMUTE -> onToggleMute()
        ConversationMenuEntry.MARK_READ -> onMarkRead()
        ConversationMenuEntry.MARK_UNREAD -> onMarkUnread()
        ConversationMenuEntry.SEARCH -> onSearch()
        ConversationMenuEntry.CALL -> onCall?.invoke()
        ConversationMenuEntry.DETAILS -> onViewInfo?.invoke()
        ConversationMenuEntry.VIEW_PROFILE -> onViewProfile?.invoke()
        ConversationMenuEntry.RENAME -> onRequestRename()
        ConversationMenuEntry.MANAGE_MEMBERS -> manageMembers?.invoke()
        ConversationMenuEntry.MENTIONS_ONLY, ConversationMenuEntry.ALL_NOTIFICATIONS -> onToggleMentionsOnly()
        ConversationMenuEntry.DISCARD_DRAFT -> onDiscardDraft()
        ConversationMenuEntry.INVITE -> onInvite()
        ConversationMenuEntry.LOCK, ConversationMenuEntry.UNLOCK -> onLockToggle()
        ConversationMenuEntry.ARCHIVE, ConversationMenuEntry.UNARCHIVE -> onToggleArchive()
        ConversationMenuEntry.BLOCK -> onBlock()
        ConversationMenuEntry.UNBLOCK -> onUnblock()
        ConversationMenuEntry.REPORT -> onReport()
        ConversationMenuEntry.ADMIN_OPEN -> onOpenAdmin()
        ConversationMenuEntry.LEAVE -> onRequestLeave()
        ConversationMenuEntry.DELETE, ConversationMenuEntry.HIDE -> onRemove()
        ConversationMenuEntry.DELETE_FOR_ALL -> onDeleteForAll()
        ConversationMenuEntry.MAKE_OBSOLETE -> onMakeObsolete()
        ConversationMenuEntry.READING_MODE,
        ConversationMenuEntry.FAVORITE,
        ConversationMenuEntry.TAGS,
        ConversationMenuEntry.MOVE,
        -> Unit
    }
}
