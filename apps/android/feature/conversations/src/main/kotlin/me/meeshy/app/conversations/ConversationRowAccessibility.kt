package me.meeshy.app.conversations

/**
 * La phrase que TalkBack lit pour une ligne de conversation (iOS
 * `ThemedConversationRow.conversationAccessibilityLabel`) : conversation avec X, aperçu, heure,
 * non-lus, muet, épinglé, synchro en attente. Pure : la ligne lui passe ses libellés localisés.
 */
internal object ConversationRowAccessibility {

    internal data class Strings(
        val conversationWith: (String) -> String,
        val lastMessage: (String) -> String,
        val unread: (Int) -> String,
        val muted: String,
        val pinned: String,
        val pendingSync: String,
    )

    fun label(
        title: String,
        spokenPreview: String?,
        relativeTime: String?,
        unreadCount: Int,
        isMuted: Boolean,
        isPinned: Boolean,
        hasPendingSync: Boolean,
        strings: Strings,
    ): String = listOfNotNull(
        strings.conversationWith(title),
        spokenPreview?.takeIf { it.isNotBlank() }?.let(strings.lastMessage),
        relativeTime?.takeIf { it.isNotBlank() },
        if (unreadCount > 0) strings.unread(unreadCount) else null,
        if (isMuted) strings.muted else null,
        if (isPinned) strings.pinned else null,
        if (hasPendingSync) strings.pendingSync else null,
    ).joinToString(", ")

    /** Ce que la ligne dit de son aperçu : le brouillon se lit avec son étiquette, comme il se voit. */
    fun spokenPreview(preview: RowPreview): String =
        listOfNotNull(preview.draftLabel, preview.text).joinToString(" ")
}
